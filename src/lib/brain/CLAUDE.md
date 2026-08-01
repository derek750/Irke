# `src/lib/brain/`

Local retrieval over the user's documents. No embeddings in v1 — BM25 over pre-tokenized chunks kept in IndexedDB.

## Files

| File | Responsibility |
|------|----------------|
| `tokenize.ts` | Lowercase tokenize + stop-word filter; `termFrequencies` for ingest |
| `chunk.ts` | Split docs into passages; prefix with kind tags (`[RESUME]`, etc.); build `BrainChunk`s |
| `retrieve.ts` | BM25 scoring with kind boosts; returns `RetrievedChunk[]` |

## Ingest path

Options UI (`BrainTab`) → `putDoc` + `chunkDoc` → `replaceChunksForDoc`. Replacing a doc always deletes old chunks for that `docId` first.

Chunking packs paragraphs toward ~900 chars (hard wrap ~1400) so one job / one answer tends to stay in one chunk.

## Kind tags and boosts

| Kind | Tag | Boost |
|------|-----|-------|
| `resume` | `[RESUME]` | 1.25 |
| `app_answer` | `[PAST APPLICATION ANSWER]` | 1.20 |
| `about_me` | `[ABOUT ME]` | 1.15 |
| `project` | `[PROJECT]` | 1.05 |
| `writing` | `[MY WRITING]` | 1.00 |

Tags go into the chunk text so the model knows what it is reading. Boosts bias retrieval toward personal material when the JD dominates the query string.

## Retrieval

`retrieve(query, chunks, { limit, minScore })`:

- Tokenize the query, score with BM25 (`K1=1.5`, `B=0.75`), multiply by kind boost
- Drop scores ≤ `minScore` (default `0.01`)
- Return top `limit` (default 8)

Empty query or empty corpus → `[]`. Callers must handle "no excerpts" (prompt already has a fallback section).

## Smoke test

```bash
npm run smoke
```

Uses `scripts/smoke-retrieval.ts` against a tiny in-memory brain. Use it when changing tokenize / chunk / retrieve — expected behavior: role/why questions hit past answers, skill questions hit resume, off-topic queries return no match.

## What not to do

- Do not add embedding models / Transformers.js without an explicit request (v1 is keyword-only on purpose).
- Do not mutate chunks in place during retrieve — return new scored wrappers.
- Keep this folder free of Chrome APIs; persistence stays in `lib/db.ts`.
