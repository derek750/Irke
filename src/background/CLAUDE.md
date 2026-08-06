# `src/background/`

Manifest V3 service worker. Owns multi-frame scanning, answer generation, fill routing, and answer-bank writes.

## Files

| File | Responsibility |
|------|----------------|
| `index.ts` | Message router, install hook (open options + side-panel-on-action), `scanTab`, `activeTabId` |
| `generate.ts` | Answer bank → retrieve → two-pass LLM pipeline (draft, then revise); returns `GeneratedAnswer` |

## Flows

### Scan (`bg:scanActiveTab`)

1. Resolve the active tab id.
2. `chrome.webNavigation.getAllFrames` → scan every frame via `content:scan`.
3. Pick the frame with the most detected questions.
4. If that frame's JD text is thin, borrow job context from the top frame (`frameId === 0`).
5. Attach the winning `frameId` onto `PageScan` so later fills hit the same document.

### Generate (`bg:generate`)

Delegates to `generateAnswer` in `generate.ts`. See `src/CLAUDE.md` for source priority. Retrieval query is `question + title + JD prefix` so the user's stories match role vocabulary.

LLM generation is **two passes** with the same provider/model:

1. **Draft** — `buildSystemPrompt` (grounding rules + context-reading and writing skills) + `buildUserPrompt`.
2. **Revise** — `buildReviseSystemPrompt` / `buildReviseUserPrompt`: an editor pass that audits the draft against an AI-tell checklist, copied-from-excerpt phrasing, and ungrounded claims, then rewrites. If the revise call fails, the draft is returned as-is.

Context syncing does **not** happen here. Drive and GitHub sync from the options page, where a DOM is available for PDF parsing and the worker cannot be evicted mid-run.

### Fill (`bg:fill`)

Forwards `content:fill` to the **exact** `frameId` from the last scan. Never fill the top frame when the form lives in an iframe.

### Save (`bg:saveAnswer`)

Calls `rememberAnswer` in `lib/answer-bank.ts` (fingerprint + upsert).

## Invariants

- Message handlers must `return true` and resolve via `sendResponse` asynchronously (already the pattern in `index.ts`).
- On install (`reason === 'install'`), open the options page so the user can add a key and connect context before scanning.
- Do not import React or DOM APIs here.
- Catch and surface errors as `{ ok: false, error }` — never throw across the message channel.

## Changing generation

1. Prompt / constraints → `lib/prompt.ts`
2. Retrieval → `lib/context/retrieve.ts` (hybrid BM25 + embeddings when chunks are embedded)
3. Provider HTTP → `lib/llm.ts`
4. Source-priority logic → `generate.ts` only
