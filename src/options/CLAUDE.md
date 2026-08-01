# `src/options/`

Options page React UI. Opens on first install and from the side panel **Context** button. This is where the user connects their material and configures the provider — not where generation runs.

## Files

| File | Responsibility |
|------|----------------|
| `index.html` / `main.tsx` | Vite entry |
| `Options.tsx` | Tab shell: Context / Answer bank / AI provider |
| `ContextTab.tsx` | Hosts both connections, the story composer, file upload, and the indexed-doc list |
| `DriveConnection.tsx` | Google OAuth, folder picker, sync, disconnect |
| `DriveFolderPicker.tsx` | Navigable Drive folder browser (browse + search) |
| `GithubConnection.tsx` | GitHub OAuth sign-in, repo selection, sync, disconnect |
| `SyncStatus.tsx` | Last-synced line + "indexed N, skipped M" summary |
| `AnswersTab.tsx` | Edit / delete saved answer-bank entries |
| `AiTab.tsx` | Provider, model, API key, temperature, extra instructions |
| `options.css` | Layout |

## Tabs

| Tab | Persistence | Notes |
|-----|-------------|-------|
| Context | IndexedDB via `db.ts` + `chunkDoc`; connection state in `chrome.storage.local` | Syncs run here, not in the worker |
| Answer bank | IndexedDB | Fingerprints are immutable keys; editing updates answer text only |
| AI provider | `saveSettings` | Switching provider resets model to `DEFAULT_MODELS[provider]` |

There is no Profile tab. Irke does not answer name / email / salary / work-authorization questions, so it has nothing to store for them.

## Context ingest

Four ways in, all landing in the same index via `saveDoc` (`putDoc` + `replaceChunksForDoc`):

1. **Story** — typed into the tab, `source: 'story'`
2. **Upload** — PDF / txt / md through `readUploadedFile`, `source: 'document'`
3. **Google Drive** — `syncDrive()` over one picked folder, `source: 'drive'`
4. **GitHub** — `syncGithub()` over the selected repos, `source: 'github'`

Connection syncs go through `replaceDocsForSource`, which clears that source first. Never leave orphan chunks; never call the LLM from this page.

## Google Drive / GitHub setup

Both connections use `chrome.identity` and need a client id compiled in via `.env.local`
(`VITE_GOOGLE_CLIENT_ID`, `VITE_GITHUB_CLIENT_ID` + `VITE_GITHUB_CLIENT_SECRET` — see `.env.example`). When missing,
`isDriveConfigured()` / `isGithubConfigured()` is false and the card shows a short notice instead
of a dead button. Drive also needs the manifest `oauth2` block; GitHub uses `launchWebAuthFlow`
(with PKCE + client secret — GitHub still requires the secret on token exchange).

## Conventions

- Local React state + explicit Save buttons (no autosave) for AI settings; connection edits save immediately since each is a single discrete choice.
- Reuse `theme.css` primitives; keep copy calm and instructional.
- User-facing errors via `.notice.error` — never dump stack traces.
- Long-running work (sync, PDF parse) sets a `busy` label and disables the card's buttons.

## What not to do

- Do not store API keys or OAuth tokens in IndexedDB, and never log either.
- Do not index repository source files — description and README prose only.
- Do not add a cloud sync backend from this page.
- Avoid new form libraries — native inputs match the rest of the extension.
