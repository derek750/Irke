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

## Scope

Irke answers **story questions only** — cover letters, "tell us about a time", "why this company", "what are you proud of". It deliberately does not touch name, email, phone, salary, start date, work authorization, or demographics. There is no profile and no autofill of specifics. `content/detect.ts` drops those fields before they ever reach the UI.

A cover-letter **file upload** counts as a story question, since Irke can typeset that document (`lib/documents/cover-letter.ts`). It carries `control: 'file'`, which means draft and export it but never write to it. Contact details for the letterhead live in Settings and are used only to typeset the document — never typed into a form.

## Message protocol

All cross-context messages are typed in `lib/messages.ts`:

- **`BackgroundRequest` / `BackgroundResponse`** — side panel / options → service worker (`chrome.runtime.sendMessage`)
- **`ContentRequest` / `ContentResponse`** — service worker → content script (`chrome.tabs.sendMessage` with `frameId`)

Helpers: `sendToBackground`, `sendToTab`, `errorMessage`. Prefer these over raw Chrome messaging.

When adding a message type:

1. Extend the unions in `messages.ts`
2. Handle it in `background/index.ts` and/or `content/index.ts`
3. Call it from the UI via `sendToBackground`

## Answer sources

Generation (`background/generate.ts`) always drafts via the LLM over retrieved context.
Saved answers are **not** pasted back as-is.

Every generated answer is stored in the answer bank **and** mirrored into the context index
as `source: 'generated'` (`[PRIOR DRAFT]`); editing a draft re-banks it on blur. Regenerating appends to
`AnswerBankEntry.versions` rather than overwriting, so no attempt is lost to another click, but only the
current answer is mirrored into the index. Those chunks only enter retrieval
when Settings.`includeGeneratedInRag` is on (off by default). Embeddings still require a
manual **Build index** on the Data tab.

## Storage boundaries

| Store | API | Contents |
|-------|-----|----------|
| `chrome.storage.local` | `lib/settings.ts` | Settings (provider, API key, model, temperature, generation mode, includeGeneratedInRag, extra instructions, letterhead) |
| `chrome.storage.local` | `lib/connections.ts` | Drive folder + GitHub OAuth session / repo selection |
| IndexedDB `irke` | `lib/db.ts` | Context docs, chunks, answer-bank entries |

UI pages that touch IndexedDB (options Data / Answers tabs) call `db.ts` directly. Generation and answer-bank lookups run in the service worker so the side panel stays thin. Drive and GitHub syncs run in the options page, not the worker.

## Types

Canonical domain types live in `lib/types.ts` (`ContextDoc`, `ContextSource`, `StoryTopic`, `DetectedQuestion`, `PageScan`, `GeneratedAnswer`, etc.). Import from there — do not duplicate shapes in UI files.

## Conventions

- Strict TypeScript; named exports preferred.
- Functional style; no classes.
- Early returns / guard clauses.
- Keep React out of `background/`, `content/`, and `lib/` (except types that UI also uses).
- CSS: shared tokens in `ui/theme.css`; surface-specific rules in `sidepanel/sidepanel.css` and `options/options.css`.
