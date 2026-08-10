# `src/sidepanel/`

Side panel React UI. Opened from the toolbar action (`sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`). This is the main apply-time surface: scan the active tab, review questions, generate, edit, fill, save.

## Files

| File | Responsibility |
|------|----------------|
| `index.html` / `main.tsx` | Vite entry |
| `SidePanel.tsx` | Scan, question list, footer |
| `QuestionCard.tsx` | Per-question accordion: draft textarea, generate / fill / save |
| `useDrafts.ts` | Draft map keyed by `fieldId`; wraps background messages |
| `sidepanel.css` | Panel layout |

Shared theme tokens come from `ui/theme.css`.

## State model

- **Scan** — `PageScan | null` from `bg:scanActiveTab` (includes `frameId`)
- **Drafts** — `Record<fieldId, DraftState>` via `useDrafts`
- **Expanded** — one open card at a time

`DraftState.status`: `idle` → `generating` → `ready` → `filled`.

There is no filter. Detection already returns story questions only, so every card in the list is one Irke is meant to answer. An empty list means the page had no story questions, not that a filter is hiding them — the empty state says so.

## User flows to preserve

1. Mount / Rescan → clear drafts → list questions → expand the first one.
2. Generate → background pipeline → show sources + `[NEED INPUT]` badge when present.
3. Fill → `bg:fill` with the scan's `frameId` (critical for iframe ATS forms).
4. Save → answer bank for that question label + company.

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
