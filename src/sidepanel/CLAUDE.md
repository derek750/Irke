# `src/sidepanel/`

Side panel React UI. Opened from the toolbar action (`sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`). This is the main apply-time surface: scan the active tab, review questions, generate, edit, fill, save.

## Files

| File | Responsibility |
|------|----------------|
| `index.html` / `main.tsx` | Vite entry |
| `SidePanel.tsx` | Scan, question list, footer |
| `PageContextCard.tsx` | Collapsible card showing what the scan picked up, including the full JD text |
| `QuestionCard.tsx` | Per-question accordion: draft textarea, generate / fill / save / export |
| `ExportMenu.tsx` | Ghost button + popover: copy to clipboard, download `.md`, download `.txt` |
| `export.ts` | Pure Markdown / plain-text builders, filename slugs, blob download, clipboard |
| `useDrafts.ts` | Draft map keyed by `fieldId`; wraps background messages |
| `sidepanel.css` | Panel layout |

Shared theme tokens come from `ui/theme.css`.

## State model

- **Scan** — `PageScan | null` from `bg:scanActiveTab` (includes `frameId`)
- **Drafts** — `Record<fieldId, DraftState>` via `useDrafts`
- **Expanded** — one open question card at a time

`DraftState.status`: `idle` → `generating` → `ready` → `filled`.

`PageContextCard` keeps its own open/closed boolean rather than joining the `expanded` fieldId, so reading the job description does not collapse the question you are working on.

There is no filter. Detection already drops everything Irke will not answer, so every card in the list is one it is meant to answer. An empty list means the page had no such questions, not that a filter is hiding them — the empty state says so.

## User flows to preserve

1. Mount / Rescan → clear drafts → list questions → expand the first one.
2. Generate → background pipeline → show sources + `[NEED INPUT]` badge when present.
3. Fill → `bg:fill` with the scan's `frameId` (critical for iframe ATS forms).
4. Save → answer bank for that question label + company.
5. Export → one question, or the whole application from the header. Everything is built in the panel from state it already holds; no new background messages.

Footer copy: **"Irke never submits for you"** — keep that invariant in UX and code.

## Conventions

- Talk to the page only through `sendToBackground` — never `chrome.tabs` from the panel.
- Keep generation / retrieval / LLM out of this folder; the panel is a thin client.
- Prefer existing button classes (`primary`, `ghost`, `danger`) and badges from `theme.css`.
- Functional components + hooks only; colocate draft logic in `useDrafts`.

## Pitfalls

- After extension reload, the content script is gone until the tab is refreshed — surface the background's "reload the tab" error as-is.
- `scan` can be null; guard `frameId` / `job` before fill/save (already done — keep it that way).
- Save answer indexes a prior draft; generation always calls the LLM (no answer-bank paste).
- `.question-card` sets `overflow: hidden`, so the per-question export popover opens upward. A downward menu is clipped.
- Export falls back to `question.currentValue` when there is no draft, so text the user typed on the page is not silently dropped.
