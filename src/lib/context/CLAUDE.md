# `src/lib/context/`

Local retrieval over the user's own material. No embeddings in v1 — BM25 over pre-tokenized chunks kept in IndexedDB.

## Files

| File | Responsibility |
|------|----------------|
| `tokenize.ts` | Lowercase tokenize + stop-word filter; `termFrequencies` for ingest |
| `chunk.ts` | Split docs into passages; prefix with source tags (`[MY STORY]`, etc.); build `ContextChunk`s |
| `retrieve.ts` | BM25 scoring with source boosts; returns `RetrievedChunk[]` |

## Ingest path

Options UI (`ContextTab` / connections) → `saveDoc` in `lib/db.ts` → `putDoc` + `chunkDoc` → `replaceChunksForDoc`. Replacing a doc always deletes old chunks for that `docId` first.

Chunking packs paragraphs toward ~900 chars (hard wrap ~1400) so one story tends to stay in one chunk.

## Source tags and boosts

| Source | Tag | Boost | Comes from |
|--------|-----|-------|------------|
| `story` | `[MY STORY]` | 1.30 | Typed into the Context tab |
| `document` | `[MY DOCUMENT]` | 1.15 | Uploaded PDF / txt / md |
| `drive` | `[GOOGLE DRIVE]` | 1.10 | Synced Drive folder |
| `github` | `[GITHUB]` | 1.00 | Synced repo description + README |

Tags go into the chunk text so the model knows what it is reading. Boosts favor material the user wrote deliberately over material that happened to be lying in a folder or repo.

## Retrieval

`retrieve(query, chunks, { limit, minScore })`:

- Tokenize the query, score with BM25 (`K1=1.5`, `B=0.75`), multiply by source boost
- Drop scores ≤ `minScore` (default `0.01`)
- Return top `limit` (default 8)

Empty query or empty corpus → `[]`. Callers must handle "no excerpts" (the prompt has a fallback that tells the model to mark facts as `[NEED INPUT]` rather than invent a story).

## Smoke test

```bash
npm run smoke:retrieval
```

Runs `scripts/smoke-retrieval.ts` against a tiny in-memory corpus. Use it when changing tokenize / chunk / retrieve — expected behavior: "why this company" hits the written stories, "a time it went wrong" hits the narrative story over the resume, off-topic queries return no match.

## What not to do

- Do not add embedding models / Transformers.js without an explicit request (v1 is keyword-only on purpose).
- Do not mutate chunks in place during retrieve — return new scored wrappers.
- Keep this folder free of Chrome APIs; persistence stays in `lib/db.ts`.
