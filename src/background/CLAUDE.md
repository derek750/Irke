# `src/background/`

Manifest V3 service worker. Owns multi-frame scanning, answer generation, fill routing, and answer-bank writes.

## Files

| File | Responsibility |
|------|----------------|
| `index.ts` | Message router, install hook (open options + side-panel-on-action), `scanTab`, `activeTabId` |
| `scan-frames.ts` | Which iframes to inject/scan (ATS first, ads last, cap 10) |
| `generate.ts` | Retrieve → LLM (draft; optional revise when polished); returns `GeneratedAnswer` |
| `letterhead.ts` | Reads the candidate's name out of the context index when the Letterhead setting is blank |

## Flows

### Scan (`bg:scanActiveTab`)

1. Resolve the active tab id.
2. `chrome.webNavigation.getAllFrames` → `selectScanFrames` (`scan-frames.ts`): top frame + ATS / same-origin form frames, skip ads/analytics/CAPTCHA, cap at 10. A job page with 40 tracker iframes must not inject or message all of them.
3. Inject the content script only into those frame ids (`chrome.scripting.executeScript`, the `?script&iife` build imported as `contentScript`). There is no static content script — this is the only way it reaches a page, a guard inside makes re-injection a no-op, and the IIFE registers its listener before `executeScript` resolves so the scan message cannot race it.
4. `content:scan` those frames.
5. Pick the frame with the most detected questions.
6. If that frame's JD text is thin, borrow job context from the top frame (`frameId === 0`).
7. Attach the winning `frameId` onto `PageScan` so later fills hit the same document.

Embedding backfill does **not** run on scan — loading the chunk store (vectors included) competed with the scan for the worker and froze the machine. `ensureContextEmbeddings()` still runs after generate / save-answer, and from the options page after ingest. An already-current index is a count, not a full read.

### Generate (`bg:generate`)

Delegates to `generateAnswer` in `generate.ts`. Always LLM — saved answers are never pasted.

Two instruction inputs, deliberately different. `extraInstructions` **replaces** `Settings.extraInstructions` (the dashboard dry-run); whichever applies is standing policy, so it rides in the **system prompt** of both passes. `steer` from a side-panel card is moment-specific and travels three ways instead: it is `retrieve`'s `steer` (its best two hits are pinned to the front of the window, marked `steered`), it leads the embed query so the vector channel follows paraphrase, and it becomes a "candidate's direction" section next to the question in the **user prompt** of both passes — never merged into the standing instructions. `GeneratedAnswer.steeredSources` reports which documents the steer pulled in, so the panel can show the nudge landed.
The retrieval query is **weighted**, not concatenated: question label 10, job title 2, JD prefix 1. As one string the JD's ~80 terms bury the label's ~5 and every question on the page retrieves the same excerpts, so any change here should keep the label in charge. The steer is pinned rather than weighted in — merged into the query it becomes the best hit and the relevance floor cuts the question's own evidence (measured at weights 5 through 30). Embeddings cannot be term-weighted, so the vector query carries only `JD_EMBED_CHARS` of the description instead. Chunks with `source: 'generated'` are included only when `Settings.includeGeneratedInRag` is true.

LLM generation is **two passes** with the same provider/model when `generationMode` is `polished` (default):

1. **Draft** — `buildSystemPrompt` (grounding rules + context-reading and writing skills) + `buildUserPrompt`.
2. **Revise** — `buildReviseSystemPrompt` / `buildReviseUserPrompt`: an editor pass that audits the draft against an AI-tell checklist, copied-from-excerpt phrasing, and ungrounded claims, then rewrites. If the revise call fails, the draft is returned as-is.

When `generationMode` is `fast`, only the draft pass runs (half the latency/cost for iteration).

A regenerate has two meanings, split by `currentDraft`. When the panel sends it (the user typed or hand-edited the text on screen), the call is a **refine**: the draft becomes the base to build on — a "current draft" section in both passes, its vocabulary a weight-`DRAFT_WEIGHT` (2) query part and part of the embed text so the retry grounds what it talks about, `previousAnswers` ignored, temperature unbumped, and this question's banked prior draft dropped from retrieval (it nearly equals the base). Without `currentDraft`, a regenerate is a **rejection** and `previousAnswers` (every answer already rejected, oldest first) drives three things:

- **Regrounding** — its length becomes `retrieve`'s `rotate`, walking the window down the candidate pool so the retry reads different excerpts. A rewrite of the same eight excerpts is the same answer with new adjectives.
- **Temperature** — the draft pass samples at `temperature + 0.35`, capped at 1.
- **Do-not-repeat** — both passes get the rejected answers verbatim. The revise pass needs them too, or the editor normalizes every retry back onto one answer.
- **Self-reference** — with `includeGeneratedInRag` on, the rejected answer is itself an indexed `generated` chunk that matches this question better than anything else. `searchableChunks` drops that one doc on a regenerate, or retrieval hands the model the text it was asked to replace. Prior drafts of *other* questions stay available.

Listing all of them, not just the newest, is what stops attempt three from circling back to attempt one.

After the answer is banked, the handler fires `ensureContextEmbeddings()` (as does `bg:saveAnswer`) so the new `generated` chunks get vectors. When the index is already current this is two IndexedDB counts; when a handful of chunks are new it keyed-reads those instead of cloning every vector. When the index **has** vectors but the query embed fails, the draft still ships on keyword retrieval and carries `degradedRetrieval: true`, which the panel renders as a **Keyword only** badge — an index with no vectors at all is normal keyword mode, not a degradation.

Context syncing does **not** happen here. Drive and GitHub sync from the options page, where a DOM is available for PDF parsing and the worker cannot be evicted mid-run.

### Fill (`bg:fill`)

Forwards `content:fill` to the **exact** `frameId` from the last scan. Never fill the top frame when the form lives in an iframe.

### Attach (`bg:attach`)

Forwards `content:attach` (filename + base64 PDF bytes, built in the panel) to the same exact `frameId`, where the content script sets the file on the detected cover-letter input. Same frame rule as fill; the worker only relays.

### Save (`bg:saveAnswer`)

Calls `rememberAnswer` in `lib/answer-bank.ts` (fingerprint upsert + mirror into the context index as `source: 'generated'`). `bg:generate` already banks its own output, so the side panel only sends this after a draft has been edited by hand. Every distinct answer is appended to `AnswerBankEntry.versions`; only the current one is indexed.

### Letterhead name (`bg:resolveLetterheadName`)

A cover letter has to be signed, but Irke stores no profile. When the Letterhead name in Settings is blank, `resolveLetterheadName` retrieves resume-like chunks and asks the model for the name or `UNKNOWN`, returning `null` when it cannot tell. Hits are cached under `irke:letterheadName` so it costs one call ever; misses are not cached, so adding a resume later just works. An empty index short-circuits before any network call.

## Invariants

- Message handlers must `return true` and resolve via `sendResponse` asynchronously (already the pattern in `index.ts`).
- On install (`reason === 'install'`), open the options page so the user can add a key and connect context before scanning.
- Do not import React or DOM APIs here.
- Catch and surface errors as `{ ok: false, error }` — never throw across the message channel.

## Changing generation

1. Prompt / constraints → `lib/prompt.ts`
2. Retrieval → `lib/context/retrieve.ts` (hybrid BM25 + embeddings when chunks are embedded; `includeGenerated` gate)
3. Provider HTTP → `lib/llm.ts`
4. Pipeline / settings wiring → `generate.ts`
