# `src/lib/context/`

Local retrieval over the user's own material. Keyword BM25 always; optional OpenAI chunk embeddings for hybrid search after **Build index**.

## Files

| File | Responsibility |
|------|----------------|
| `tokenize.ts` | Lowercase tokenize + stop-word filter; `termFrequencies` for ingest; `termVariants` for query-side stemming |
| `chunk.ts` | Split docs into passages; prefix with source tags (`[MY STORY]`, etc.); build `ContextChunk`s |
| `retrieve.ts` | BM25 (+ cosine via RRF when embeddings exist); returns `RetrievedChunk[]` |
| `embed.ts` | BYOK OpenAI / OpenRouter `text-embedding-3-small`; `embeddingApiKey` guard |
| `build-index.ts` | Embed missing chunk vectors and write them back to IndexedDB |
| `distill.ts` | LLM-condensed markdown notes per document (`source: 'distilled'`), typed story cards in question vocabulary |

## Ingest path

Options UI (`DataTab` / `ConnectorsTab`) → `saveDoc` in `lib/db.ts` → `putDoc` + `chunkDoc` → `replaceChunksForDoc`. Replacing a doc always deletes old chunks for that `docId` first (embeddings for that doc are dropped with them).

Chunking packs paragraphs toward ~900 chars (hard wrap ~1400) so one story tends to stay in one chunk. Sync/upload only stores text + BM25 tokens.

## Embedding index

`buildContextIndex()`:

1. Resolve an OpenAI or OpenRouter API key (`provider === 'openai' | 'openrouter'`)
2. Embed chunks missing `embedding` (or all, if `rebuild: true`)
3. `putChunks` with `embedding` + `embeddedAt`

`ensureContextEmbeddings()` is the quiet wrapper (returns `null` instead of throwing) that keeps the index current without anyone clicking anything: the background worker fires it after generate / save-answer (not on scan — that read competed with injecting the page), and the options page fires it after adding a story, uploading a file, and finishing a Drive or GitHub sync. When every chunk already has `embeddedAt`, this is two counts. **Build context** on the Data tab calls `buildContextIndex()` directly and reports; it remains the backfill for corpora ingested before auto-embed existed and the manual rebuild.

Anthropic has no embeddings API — with an Anthropic-only setup every auto-embed quietly declines and retrieval stays keyword-only. Generation falls back to BM25-only if the query embed fails, and flags the draft with `GeneratedAnswer.degradedRetrieval` when vectors existed but could not be used.

## Source tags and boosts

| Source | Tag | Boost | Comes from |
|--------|-----|-------|------------|
| `story` | `[MY STORY]` | 1.30 | Typed into the Data tab |
| `document` | `[MY DOCUMENT]` | 1.15 | Uploaded PDF / txt / md |
| `drive` | `[GOOGLE DRIVE]` | 1.10 | Synced Drive folder |
| `github` | `[GITHUB]` | 1.00 | Synced repo description + README |
| `generated` | `[PRIOR DRAFT]` | 0.85 | Saved side-panel answers (RAG only if `includeGeneratedInRag`) |
| `distilled` | `[DISTILLED NOTES]` | 1.15 | **Distill stories** on the Data tab: one LLM call per doc → typed story cards |

Tags go into the chunk text so the model knows what it is reading. Boosts favor material the user wrote deliberately over material that happened to be lying in a folder or repo. Prior drafts rank below human sources so they steer without drowning out stories.

## Retrieval

`retrieve(query, chunks, { limit, minScore, queryEmbedding, includeGenerated, rotate, steer })`:

- When `includeGenerated` is false (default), drop `source: 'generated'` before scoring
- Always score with BM25 (`K1=1.5`, `B=0.75`) × query-term weight × source boost
- When `queryEmbedding` is set and chunks have vectors: cosine × boost, then reciprocal rank fusion (RRF) with BM25, with the vector channel weighted `VECTOR_RRF_WEIGHT` (1.5) — paraphrase understanding outranks keyword overlap when they disagree, while an exact keyword hit near the top still makes the window
- Drop BM25 scores ≤ `minScore` (default `0.01`) and below `RELATIVE_FLOOR` (0.25) of that query's best hit, keeping at least `MIN_RESULTS` (3); drop cosine &lt; `0.2`
- Return top `limit` (default 8), windowed by `rotate`
- When `steer` is set, its top `STEER_PINS` (2) hits are pinned to the front, marked `steered: true`

### Weighted queries

`query` is a string **or** `QueryPart[]` (`{ text, weight }`). Terms are deduped and take the highest weight any part gave them — never a sum, or a word repeated forty times in a job description would outrank the question itself.

Weighting is not optional in practice. A question label is ~5 unique terms and 1200 characters of job description is ~80, so a flat string is a search for the job description: every question on a page retrieves near-identical excerpts, and the chunk that actually answers the question ranks below the résumé. `generate.ts` weights the label 10, the title 2, the JD 1. On a realistic corpus that moved shared context across five different questions from 86% to 41%.

### Query-side variants

Stored chunk tokens are exact words — stemming them means migrating IndexedDB — so inflection bridging happens at query time: every term also contributes its morphological family (`termVariants`: suffix strips and re-suffixing, including the `-ion` verb/noun bridge) at `VARIANT_DISCOUNT` (0.5) of its weight. That is what lets "disagreed with a teammate" retrieve the story titled "Disagreement", and "migrating" match "migration". Half weight was chosen by sweep: it fixes those misses without flipping the top hit of any query that already worked; exact matches always beat stem matches. Junk variants ("disagreedion") exist in no chunk and cost one document-frequency lookup. Irregular forms (won/win) are out of scope — that is the embeddings channel's job.

### Relevance floor

BM25 scores are only comparable within one query, so the useful cutoff is relative: chunks under a quarter of that query's best hit are dropped. `minScore` alone cannot do this — nearly everything clears an absolute floor once the JD is in the query, which is how a 12-chunk index returned 8 chunks for every question. Pointed questions now come back with 2-4 excerpts and vague ones still come back broad. `MIN_RESULTS` keeps a runaway top hit from starving the answer, and leaves `rotate` something to work with.

Each channel ranks `CANDIDATE_POOL` (20) candidates and the window takes `limit` of them. `rotate` is the regenerate count: it keeps the top `ANCHORS` (2) and walks the remaining slots that many steps down the pool, wrapping at the end. That is what makes a regenerate say something new instead of rephrasing the same excerpts — with `limit: 8` the first pass reads ranks 1-8 and the first retry reads 1-2 plus 9-14. A pool no bigger than the window is returned unrotated.

### Distilled notes

The corpus problem retrieval cannot fix alone: behavioral questions are phrased in words the material never uses ("a conflict at work" for a story that says "argued in review comments"), and stories sit buried inside near-identical cover letters. `distill.ts` has the LLM rewrite each document once into markdown notes — `## Story:` cards with a `Type:` line drawn from question vocabulary (conflict, missed deadline, leadership, mentoring…) plus a `## Key facts` list — stored as ordinary docs under `source: 'distilled'` (id `distilled:{parentId}`) in the same flat index, so plain search picks the right altitude per query (the collapsed-pool result from the RAPTOR line of work; a summary tree would be invalidated by every sync).

Because a card is written to be found, it often outranks the document it condenses — so `retrieve` chains every distilled hit's **parent** in directly behind it (`chainParents`, the small-to-big pattern): the card names the story, the original supplies its texture, and the tail of the window pays. A parent pulled in by a steered pin inherits the `steered` mark. Measured on the adversarial corpus: four of five hard-vocabulary behavioral questions went from miss to card-plus-original at the top, shared context across five questions fell 69% → 39%, no easy case regressed.

Distillation is manual (**Distill stories**, one chat call per document, any provider), skips `generated` docs and fresh notes (`createdAt` comparison), prunes notes whose parent is gone, and re-distills stale notes after a re-sync. The prompt forbids invention outright and the model may answer `SKIP`; the context skill in `prompt.ts` tells the drafting model to prefer the original's wording when both appear.

### Steering

`steer` is the user's per-answer direction ("focus on the CubeSat work"). It is searched as its own BM25 query and its best `STEER_PINS` (2) hits take the front of the window, marked `steered: true`, ahead of `rotate` — so a steered regenerate keeps the asked-for material while the other slots reground. The pins pay with the tail of the question's window, never its head.

The steer deliberately does **not** join the keyword query. The relevance floor is relative to the query's best hit, and a steer naming rare terms *becomes* that best hit — measured at every weight from 5 to 30, merging the steer cut the question's own evidence out of the window. Steers that name nothing in the index (tone or length asks, material the user never wrote down) match nothing and leave retrieval untouched; the direction still reaches the model through the prompt. The embed query in `generate.ts` does carry the steer, because rank fusion cannot starve the way score floors do — that is what catches a steer that paraphrases the material instead of naming it.

Empty query or empty corpus → `[]`. Callers must handle "no excerpts" (the prompt has a fallback that tells the model to mark facts as `[NEED INPUT]` rather than invent a story).

## Smoke test

```bash
npm run smoke:retrieval
```

Runs `scripts/smoke-retrieval.ts` against a tiny in-memory corpus (BM25, a fake-vector hybrid check, query weighting, the relevance floor, rotation, and steering). Use it when changing tokenize / chunk / retrieve.

## What not to do

- Do not add Transformers.js / local embedding models without an explicit request (BYOK OpenAI embeddings only).
- Do not mutate chunks in place during retrieve — return new scored wrappers.
- Keep this folder free of Chrome APIs; persistence stays in `lib/db.ts` (build-index may call `db` + `settings`).
- Do not add a MongoDB / cloud vector store — IndexedDB is intentional.
