# `src/lib/context/`

Local retrieval over the user's own material. Keyword BM25 always; optional OpenAI chunk embeddings for hybrid search after **Build index**.

## Files

| File | Responsibility |
|------|----------------|
| `tokenize.ts` | Lowercase tokenize + stop-word filter; `termFrequencies` for ingest |
| `chunk.ts` | Split docs into passages; prefix with source tags (`[MY STORY]`, etc.); build `ContextChunk`s |
| `retrieve.ts` | BM25 (+ cosine via RRF when embeddings exist); returns `RetrievedChunk[]` |
| `embed.ts` | BYOK OpenAI / OpenRouter `text-embedding-3-small`; `embeddingApiKey` guard |
| `build-index.ts` | Embed missing chunk vectors and write them back to IndexedDB |

## Ingest path

Options UI (`DataTab` / `ConnectorsTab`) → `saveDoc` in `lib/db.ts` → `putDoc` + `chunkDoc` → `replaceChunksForDoc`. Replacing a doc always deletes old chunks for that `docId` first (embeddings for that doc are dropped with them).

Chunking packs paragraphs toward ~900 chars (hard wrap ~1400) so one story tends to stay in one chunk. Sync/upload only stores text + BM25 tokens.

## Embedding index

**Build index** on the Data tab calls `buildContextIndex()`:

1. Resolve an OpenAI or OpenRouter API key (`provider === 'openai' | 'openrouter'`)
2. Embed chunks missing `embedding` (or all, if `rebuild: true`)
3. `putChunks` with `embedding` + `embeddedAt`

Anthropic has no embeddings API — Build index requires the AI provider set to OpenAI or OpenRouter. Generation falls back to BM25-only if the query embed fails.

## Source tags and boosts

| Source | Tag | Boost | Comes from |
|--------|-----|-------|------------|
| `story` | `[MY STORY]` | 1.30 | Typed into the Data tab |
| `document` | `[MY DOCUMENT]` | 1.15 | Uploaded PDF / txt / md |
| `drive` | `[GOOGLE DRIVE]` | 1.10 | Synced Drive folder |
| `github` | `[GITHUB]` | 1.00 | Synced repo description + README |
| `generated` | `[PRIOR DRAFT]` | 0.85 | Saved side-panel answers (RAG only if `includeGeneratedInRag`) |

Tags go into the chunk text so the model knows what it is reading. Boosts favor material the user wrote deliberately over material that happened to be lying in a folder or repo. Prior drafts rank below human sources so they steer without drowning out stories.

## Retrieval

`retrieve(query, chunks, { limit, minScore, queryEmbedding, includeGenerated, rotate })`:

- When `includeGenerated` is false (default), drop `source: 'generated'` before scoring
- Always score with BM25 (`K1=1.5`, `B=0.75`) × source boost
- When `queryEmbedding` is set and chunks have vectors: cosine × boost, then reciprocal rank fusion (RRF) with BM25
- Drop BM25 scores ≤ `minScore` (default `0.01`); drop cosine &lt; `0.2`
- Return top `limit` (default 8), windowed by `rotate`

Each channel ranks `CANDIDATE_POOL` (20) candidates and the window takes `limit` of them. `rotate` is the regenerate count: it keeps the top `ANCHORS` (2) and walks the remaining slots that many steps down the pool, wrapping at the end. That is what makes a regenerate say something new instead of rephrasing the same excerpts — with `limit: 8` the first pass reads ranks 1-8 and the first retry reads 1-2 plus 9-14. A pool no bigger than the window is returned unrotated.

Empty query or empty corpus → `[]`. Callers must handle "no excerpts" (the prompt has a fallback that tells the model to mark facts as `[NEED INPUT]` rather than invent a story).

## Smoke test

```bash
npm run smoke:retrieval
```

Runs `scripts/smoke-retrieval.ts` against a tiny in-memory corpus (BM25 + a fake-vector hybrid check). Use it when changing tokenize / chunk / retrieve.

## What not to do

- Do not add Transformers.js / local embedding models without an explicit request (BYOK OpenAI embeddings only).
- Do not mutate chunks in place during retrieve — return new scored wrappers.
- Keep this folder free of Chrome APIs; persistence stays in `lib/db.ts` (build-index may call `db` + `settings`).
- Do not add a MongoDB / cloud vector store — IndexedDB is intentional.
