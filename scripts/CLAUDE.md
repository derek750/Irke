# `scripts/`

Dev-only utilities. Not shipped in the extension bundle.

## `smoke-retrieval.ts`

Builds a tiny in-memory brain (resume + past answer + about-me), chunks it, and prints BM25 rankings for sample queries.

```bash
npm run smoke
```

Use after changing `src/lib/brain/*`. Expected signals:

- "Why … payments" → past application answer ranks first
- "TypeScript / React" → resume chunk
- Off-topic (e.g. pizza) → no match

Do not put production logic here. Keep the script dependency-light (esbuild-bundled via the `smoke` npm script).
