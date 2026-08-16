# `src/sidepanel/`

Side panel React UI. Opened from the toolbar action (`sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`). This is the main apply-time surface: scan the active tab, review questions, generate, edit, fill, save.

## Files

| File | Responsibility |
|------|----------------|
| `index.html` / `main.tsx` | Vite entry |
| `SidePanel.tsx` | Scan, question list, footer |
| `PageContextCard.tsx` | Collapsible card showing what the scan picked up, including the full JD text |
| `QuestionCard.tsx` | Per-question accordion: draft textarea, collapsible extra instructions, generate / fill or attach / copy / download |
| `CopyButton.tsx` | Copies the current answer, with transient "Copied" feedback |
| `ExportButton.tsx` | Ghost button: download the cover-letter PDF (a copy, or the fallback when attaching fails) |
| `cover-letter.ts` | Reads the letterhead (resolving a blank name via the background) and builds the PDF |
| `export.ts` | Filename slugs, PDF blob download, base64 for the attach message, clipboard |
| `useDrafts.ts` | Draft map keyed by `fieldId`; wraps background messages |
| `sidepanel.css` | Panel layout |

Shared theme tokens come from `ui/theme.css`.

## State model

- **Scan** — `PageScan | null` from `bg:scanActiveTab` (includes `frameId`)
- **Drafts** — `Record<fieldId, DraftState>` via `useDrafts`; `history` holds this session's attempts for the version stepper and the do-not-repeat list
- **Expanded** — one open question card at a time

`DraftState.status`: `idle` → `generating` → `ready` → `filled`.

`PageContextCard` keeps its own open/closed boolean rather than joining the `expanded` fieldId, so reading the job description does not collapse the question you are working on.

There is no filter. Detection already drops everything Irke will not answer, so every card in the list is one it is meant to answer. An empty list means the page had no such questions, not that a filter is hiding them — the empty state says so.

## User flows to preserve

1. Mount / Rescan → clear drafts → list questions → expand the first one.
2. Generate → background pipeline → show sources + `[NEED INPUT]` badge when present. Anything typed into **Extra instructions** on the card rides along as `steer`; the background pins matching material into retrieval and gives the model the direction next to the question, without touching the user's standing instructions. Documents the steer pulled in come back as `steeredSources` and show a **requested** badge in the sources popover, so the user can see the nudge landed. The steer lives in `DraftState.steer`, survives collapsing the card, and applies to every regenerate until the next scan. A draft flagged `degradedRetrieval` (the semantic index existed but could not be reached) shows a muted **Keyword only** badge whose tooltip says regenerating retries.
3. Regenerate / Refine → once a draft exists the button sends `regenerate: true`, and what rides along depends on whether the text on screen was touched. **Untouched** (the value matches a history entry): the button reads **Regenerate** and sends `previousAnswers` — every attempt in `DraftState.history` plus the screen value — so the background rotates retrieval and forbids all of them; each click is regrounded and reworded. **Edited or hand-typed** (the value matches no history entry): the button reads **Refine** and sends the text as `currentDraft` instead — the background builds on it (keeps its story and facts, grounds what it talks about, normal temperature) rather than avoiding it. Attempts are never discarded — the card shows **Version n of m** with ‹ › to page back through them, and a hand-edited draft (matching no version) reads **Edited** with ‹ returning to the newest. The answer bank keeps the same history in `AnswerBankEntry.versions`.
4. Fill → `bg:fill` with the scan's `frameId` (critical for iframe ATS forms).
5. Attach → uploads only: build the PDF in the panel (`buildCoverLetterFile`), base64 it, and send `bg:attach` with the scan's `frameId`; the content script sets it on the file input. Success shows the same **Filled** state as a text fill; failures (input gone, `accept` excludes PDF) surface in the card's error notice, and **Download PDF** remains the fallback.
6. Edit → blurring the textarea banks the edited draft (`commit`). There is no Save button: `bg:generate` already banks its own output, and `DraftState.savedValue` keeps an untouched draft from being rewritten.
7. Copy → the bare answer for that question, for pasting into the form yourself.
8. Download → cover letters only: the typeset PDF, built in the panel from `lib/documents/cover-letter.ts`.

A question whose `control` is `'file'` shows **Attach PDF** in place of **Fill field** — the draft is typeset and set on the input on your click, never on generate.

Footer copy: **"Irke never submits for you"** — keep that invariant in UX and code.

## Conventions

- Talk to the page only through `sendToBackground` — never `chrome.tabs` from the panel.
- Keep generation / retrieval / LLM out of this folder; the panel is a thin client. Document typesetting is the exception: it is pure and runs where the download happens.
- Prefer existing button classes (`primary`, `ghost`, `danger`) and badges from `theme.css`.
- Functional components + hooks only; colocate draft logic in `useDrafts`.

## Pitfalls

- The content script is injected at scan time. If a fill/attach cannot reach the page (navigation since the scan, or a page Chrome refuses), surface the background's "rescan to reconnect" error as-is — rescanning re-injects.
- `scan` can be null; guard `frameId` / `job` before fill/save (already done — keep it that way).
- Saving indexes a prior draft; generation always calls the LLM (no answer-bank paste).
- `commit` runs on blur, so an edit made and then abandoned without leaving the textarea is not banked.
- `.question-card` deliberately does **not** clip its overflow, so the sources popover in the tag row can open past the card edge. `.question-head` carries its own top radius to keep the hover fill inside the rounded border; do not reintroduce `overflow: hidden`.
- Copy and export fall back to `question.currentValue` when there is no draft (`resolveAnswer`), so text the user typed on the page is not silently dropped.
- Building a PDF is async and may hit the background for the letterhead name; the download button shows **Building…** and swallows nothing — a failure surfaces as **Export failed**, and an attach failure lands in the card's error notice.
