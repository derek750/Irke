# `scripts/`

Dev-only utilities. Not shipped in the extension bundle.

```bash
npm run smoke # both scripts below
```

## `smoke-retrieval.ts`

Builds a tiny in-memory context index (two written stories, a Drive resume, a GitHub repo), chunks it, prints BM25 rankings for sample queries, then asserts hybrid RRF retrieval with fake vectors and the regenerate rotation over a 24-doc pool.

```bash
npm run smoke:retrieval
```

Use after changing `src/lib/context/*`. Expected signals:

- "Why … payments" → the written story ranks first
- "A time a project did not go as planned" → the narrative story beats the resume
- Off-topic (e.g. pizza) → no match
- Hybrid ownership/slip query with fake embeddings → migration story ranks first
- Rotation → the top 2 hits anchor every regenerate while the other 6 slots are disjoint across rotations, wrap at the end of the pool, and are left alone when the pool is smaller than the window

## `smoke-detect.ts`

Runs `classifyLabel` from `src/content/detect.ts` over real Greenhouse / Lever / Workday / Ashby field labels and asserts each maps to the expected `StoryTopic` or to `null`. Exits non-zero on any mismatch.

```bash
npm run smoke:detect
```

Use after changing the patterns in `detect.ts`, and add cases alongside any new pattern. This is the only guard against the two silent failure modes: over-filtering (the panel detects nothing) and under-filtering (Irke starts trying to answer "what is your phone number").

Do not put production logic here. Keep the scripts dependency-light (esbuild-bundled via the npm scripts).
