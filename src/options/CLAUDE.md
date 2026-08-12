# `src/options/`

Dashboard UI (Chrome options page). Opens on first install and from the side panel **Dashboard** button. Connect material, configure the provider, and optionally dry-run generation against the local index.

## Files

| File | Responsibility |
|------|----------------|
| `index.html` / `main.tsx` | Vite entry |
| `Options.tsx` | Top nav shell: Generate / Context / Connectors / Bank · Settings (trailing) |
| `DataTab.tsx` | Context: story composer, file upload, Build index, indexed-doc list |
| `ConnectorsTab.tsx` | Hosts Drive and GitHub connection cards |
| `DriveConnection.tsx` | Google OAuth, folder picker, sync, disconnect |
| `DriveFolderPicker.tsx` | Navigable Drive folder browser (browse + search) |
| `GithubConnection.tsx` | GitHub OAuth sign-in, repo selection, sync, disconnect |
| `SyncStatus.tsx` | Last-synced line + "indexed N, skipped M" summary |
| `AnswersTab.tsx` | Bank: edit / delete saved answer-bank entries |
| `GenerateTab.tsx` | Dry-run generation: question context, instructions, draft preview |
| `AiTab.tsx` | Settings: provider, model, API key, temperature, generation mode, extra instructions, letterhead |
| `options.css` | Dashboard shell + layout |

## Nav

| Nav | Persistence | Notes |
|-----|-------------|-------|
| Generate | Calls `bg:generate` (always `regenerate: true`, passing the current draft as `previousAnswers` so repeat clicks reground and vary) | Question + optional JD/role; instructions override for the call; Save as default writes `extraInstructions`; retrieved documents sit behind the shared `SourcesPopover` |
| Context | IndexedDB via `db.ts` + `chunkDoc` | Stories, uploads, indexed list, Build index (was Data) |
| Connectors | Connection state in `chrome.storage.local`; sync writes IndexedDB | Syncs run here, not in the worker |
| Bank | IndexedDB + mirrored `generated` context docs | Saved side-panel answers; never auto-pasted on generate |
| Settings (right) | `saveSettings` | Three collapsible groups: Model, Instructions, Letterhead. Switching provider resets model to `DEFAULT_MODELS[provider]`, and pasting an `sk-or-` key switches the provider to OpenRouter in front of the user (`reconcileProvider`) so the dropdown cannot claim a destination the key will be rejected by; generation mode is `polished` / `fast`; `includeGeneratedInRag` gates prior drafts in retrieval |

There is no Profile tab. Irke does not answer name / email / salary / work-authorization questions on a form, so it has nothing to store for them.

**Letterhead is the one exception, and a narrow one.** A cover letter has to be signed and addressed, so Settings holds a name, email, phone, location, and links used *only* to typeset a generated document. Nothing in it is ever written into a form field. Blank entries are simply left off the letter, so partial info is fine.

The name field is special: leave it blank and `bg:resolveLetterheadName` reads it out of your own indexed material (one model call, cached in `chrome.storage.local`). The Settings field shows what it found as the placeholder, so you can see and override it. Opening the Letterhead group is what triggers the lookup.

## Context ingest

Four ways in, all landing in the same index via `saveDoc` (`putDoc` + `replaceChunksForDoc`):

1. **Story** — typed on the Data tab, `source: 'story'`
2. **Upload** — PDF / txt / md through `readUploadedFile`, `source: 'document'`
3. **Google Drive** — `syncDrive()` over one picked folder (Connectors tab), `source: 'drive'`
4. **GitHub** — `syncGithub()` over the selected repos (Connectors tab), `source: 'github'`
5. **Prior draft** — side-panel Save answer → answer bank + `source: 'generated'` (RAG only when AI setting is on)

Connection syncs go through `replaceDocsForSource`, which clears that source first. Never leave orphan chunks. Synced docs show up on the Data tab Indexed list.

**Build index** (on the Data tab Indexed list) calls `buildContextIndex()` to embed chunks via OpenAI or OpenRouter and store vectors on IndexedDB chunks. Requires AI provider set to OpenAI or OpenRouter. The **Generate** tab calls `bg:generate` for a dry-run draft (chat completion, not embeddings).

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
