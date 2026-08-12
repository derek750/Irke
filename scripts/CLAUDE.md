# `scripts/`

Dev-only utilities. Not shipped in the extension bundle.

```bash
npm run smoke # both scripts below
```

## `smoke-retrieval.ts`

Builds a tiny in-memory context index (two written stories, a Drive resume, a GitHub repo), chunks it, prints BM25 rankings for sample queries, then asserts hybrid RRF retrieval with fake vectors, weighted-query separation, the relevance floor, the regenerate rotation over a 24-doc pool, and steering.

```bash
npm run smoke:retrieval
```

Use after changing `src/lib/context/*`. Expected signals:

- "Why … payments" → the written story ranks first
- "A time a project did not go as planned" → the narrative story beats the resume
- Off-topic (e.g. pizza) → no match
- Hybrid ownership/slip query with fake embeddings → migration story ranks first
- Query weighting → a flat `label + title + JD` string collapses every question onto the same first hit; the weighted form gives each question its own
- Relevance floor → a pointed question comes back with part of the corpus, not all of it
- Query-side variants → "migrating" retrieves the story that only says "migration"
- Distilled notes → a question in card vocabulary finds the card, its parent document chains in directly behind it, and the chunk carries the `[DISTILLED NOTES]` tag
- Rotation → the top 2 hits anchor every regenerate while the other 6 slots are disjoint across rotations, wrap at the end of the pool, and are left alone when the pool is smaller than the window
- Steering → a steer pins its material first (marked `steered`) without costing the question its best excerpt, works as a single keyword, beats the vector channel, survives rotation, and is a no-op when it names nothing in the index (tone / absent-material steers)

## `smoke-prompt.ts`

Asserts the prompt contract in `src/lib/prompt.ts` with fixture data: the steer's direction section sits beside the question in both passes (and never in the system prompt), steered excerpts are labeled, the no-excerpts fallback demands `[NEED INPUT]`, the rejected-answers block caps at the four most recent, a base draft renders as material to build on in both passes (and its instruction inverts the rejected framing), standing instructions land in both system prompts, and constraints render. Also covers the distillation prompt (`lib/context/distill.ts`): invention forbidden, the `SKIP` contract, and story types phrased in question vocabulary.

```bash
npm run smoke:prompt
```

Use after changing `prompt.ts`. These are structural checks on the assembled text — how the model responds to it still needs a real generate from the panel.

## `smoke-generate.ts`

Runs the real `generateAnswer` pipeline under Node, with `stubs/` aliased in for `db` (an in-memory corpus, fake vectors on demand), `llm` (records every call, answers canned text), `settings`, `answer-bank` (no-op persistence), and `embed` (always fails, deterministically) — the aliases live in the npm script. This is the only check on the pipeline's wiring rather than its parts: the steer reaches retrieval pins, the labeled excerpts, and a direction section in both passes (never the system prompt); standing instructions still reach both system prompts; `steeredSources` lands on the result; a regenerate drafts hotter, lists the rejected answers, and keeps the pinned excerpt through rotation; a refine (`currentDraft`) carries the base draft in both prompts at normal temperature with no rejected list while its vocabulary lifts matching material into retrieval; a failed query embed over an embedded index flags `degradedRetrieval` and still ships a keyword-grounded draft.

```bash
npm run smoke:generate
```

Use after changing `generate.ts` or the shape of what it passes to `prompt.ts` / `retrieve.ts`. If the bundle fails because a stub is missing an export, `db.ts` grew a function — add it to `stubs/db.ts`.

## `smoke-detect.ts`

Runs `classifyLabel` from `src/content/detect.ts` over real Greenhouse / Lever / Workday / Ashby field labels and asserts each maps to the expected `StoryTopic` or to `null`. Exits non-zero on any mismatch.

```bash
npm run smoke:detect
```

Use after changing the patterns in `detect.ts`, and add cases alongside any new pattern. This is the only guard against the two silent failure modes: over-filtering (the panel detects nothing) and under-filtering (Irke starts trying to answer "what is your phone number").

Do not put production logic here. Keep the scripts dependency-light (esbuild-bundled via the npm scripts).
