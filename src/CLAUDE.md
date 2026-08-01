# `src/`

Chrome extension source. Four surfaces share one TypeScript package via path alias `@/*`.

## Surfaces

| Surface | Entry | Runs in |
|---------|-------|---------|
| Background | `background/index.ts` | Extension service worker |
| Content | `content/index.ts` | Every frame on `<all_urls>` |
| Side panel | `sidepanel/main.tsx` | Extension side panel |
| Options | `options/main.tsx` | Extension options page |

Shared code lives under `lib/` and `ui/`. UI surfaces are React 19 + Vite; background and content are plain TypeScript modules (no React).

## Message protocol

All cross-context messages are typed in `lib/messages.ts`:

- **`BackgroundRequest` / `BackgroundResponse`** — side panel / options → service worker (`chrome.runtime.sendMessage`)
- **`ContentRequest` / `ContentResponse`** — service worker → content script (`chrome.tabs.sendMessage` with `frameId`)

Helpers: `sendToBackground`, `sendToTab`, `errorMessage`. Prefer these over raw Chrome messaging.

When adding a message type:

1. Extend the unions in `messages.ts`
2. Handle it in `background/index.ts` and/or `content/index.ts`
3. Call it from the UI via `sendToBackground`

## Answer-source priority

Generation (`background/generate.ts`) always tries, in order:

1. **Profile** — if `question.profileKey` is set and the profile has a value (zero cost)
2. **Answer bank** — exact fingerprint match unless `regenerate: true`
3. **Brain + LLM** — BM25 over IndexedDB chunks + BYOK completion

Do not reorder this without an explicit product change.

## Storage boundaries

| Store | API | Contents |
|-------|-----|----------|
| `chrome.storage.local` | `lib/settings.ts` | Settings (provider, API key, model, temperature, extra instructions), Profile |
| IndexedDB `irke` | `lib/db.ts` | Brain docs, chunks, answer-bank entries |

UI pages that touch IndexedDB (options Brain / Answers tabs) call `db.ts` directly. Generation and answer-bank lookups run in the service worker so the side panel stays thin.

## Types

Canonical domain types live in `lib/types.ts` (`Profile`, `BrainDoc`, `DetectedQuestion`, `PageScan`, `GeneratedAnswer`, etc.). Import from there — do not duplicate shapes in UI files.

## Conventions

- Strict TypeScript; named exports preferred.
- Functional style; no classes.
- Early returns / guard clauses.
- Keep React out of `background/`, `content/`, and `lib/` (except types that UI also uses).
- CSS: shared tokens in `ui/theme.css`; surface-specific rules in `sidepanel/sidepanel.css` and `options/options.css`.
