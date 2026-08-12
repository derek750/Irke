# `src/background/`

Manifest V3 service worker. Owns multi-frame scanning, answer generation, fill routing, and answer-bank writes.

## Files

| File | Responsibility |
|------|----------------|
| `index.ts` | Message router, install hook (open options + side-panel-on-action), `scanTab`, `activeTabId` |
| `generate.ts` | Retrieve → LLM (draft; optional revise when polished); returns `GeneratedAnswer` |
| `letterhead.ts` | Reads the candidate's name out of the context index when the Letterhead setting is blank |

## Flows

### Scan (`bg:scanActiveTab`)

1. Resolve the active tab id.
2. `chrome.webNavigation.getAllFrames` → scan every frame via `content:scan`.
3. Pick the frame with the most detected questions.
4. If that frame's JD text is thin, borrow job context from the top frame (`frameId === 0`).
5. Attach the winning `frameId` onto `PageScan` so later fills hit the same document.

### Generate (`bg:generate`)

Delegates to `generateAnswer` in `generate.ts`. Always LLM — saved answers are never pasted.

Two instruction inputs, deliberately different: `extraInstructions` **replaces** `Settings.extraInstructions` (the dashboard dry-run), while `steer` from a side-panel card is **appended** to whichever of those applies, so a per-question nudge cannot silently discard the user's standing instructions. Both passes see the combined text.
Retrieval query is `question + title + JD prefix`. Chunks with `source: 'generated'` are
included only when `Settings.includeGeneratedInRag` is true.

LLM generation is **two passes** with the same provider/model when `generationMode` is `polished` (default):

1. **Draft** — `buildSystemPrompt` (grounding rules + context-reading and writing skills) + `buildUserPrompt`.
2. **Revise** — `buildReviseSystemPrompt` / `buildReviseUserPrompt`: an editor pass that audits the draft against an AI-tell checklist, copied-from-excerpt phrasing, and ungrounded claims, then rewrites. If the revise call fails, the draft is returned as-is.

When `generationMode` is `fast`, only the draft pass runs (half the latency/cost for iteration).

`regenerate: true` is what makes a second click return a second answer. Nothing else about the call differs, so `previousAnswers` (every answer already rejected, oldest first) drives three things:

- **Regrounding** — its length becomes `retrieve`'s `rotate`, walking the window down the candidate pool so the retry reads different excerpts. A rewrite of the same eight excerpts is the same answer with new adjectives.
- **Temperature** — the draft pass samples at `temperature + 0.35`, capped at 1.
- **Do-not-repeat** — both passes get the rejected answers verbatim. The revise pass needs them too, or the editor normalizes every retry back onto one answer.

Listing all of them, not just the newest, is what stops attempt three from circling back to attempt one.

Context syncing does **not** happen here. Drive and GitHub sync from the options page, where a DOM is available for PDF parsing and the worker cannot be evicted mid-run.

### Fill (`bg:fill`)

Forwards `content:fill` to the **exact** `frameId` from the last scan. Never fill the top frame when the form lives in an iframe.

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
