# `src/lib/connectors/`

Remote and local ingest that feeds the context index. Runs from the **options page** (DOM + durable session), not the service worker. Connection state lives in `chrome.storage.local` via `lib/connections.ts`; docs land in IndexedDB via `lib/db.ts`.

## Files

| File | Responsibility |
|------|----------------|
| `drive.ts` | Google OAuth (`chrome.identity.getAuthToken`), folder browse/search, recursive file list, text export |
| `github.ts` | GitHub OAuth (`launchWebAuthFlow` + PKCE), repo list, description + topics + README only |
| `pdf.ts` | `pdfjs-dist` text extraction with a **bundled** worker (extension CSP forbids CDN workers) |
| `sync.ts` | `syncDrive` / `syncGithub` / `readUploadedFile` → `ContextDoc[]` → `replaceDocsForSource` |

## Auth

| Provider | Mechanism | Config | Token storage |
|----------|-----------|--------|---------------|
| Google Drive | `getAuthToken` + manifest `oauth2` | `VITE_GOOGLE_CLIENT_ID` → manifest | Chrome holds the token; Irke never persists it |
| GitHub | `launchWebAuthFlow` + PKCE; secret still required on code exchange | `VITE_GITHUB_CLIENT_ID` + `VITE_GITHUB_CLIENT_SECRET` | Access token in `connections.github` |

`isDriveConfigured()` / `isGithubConfigured()` gate the UI so missing env vars show a notice instead of a dead button.

Drive scope is read-only. GitHub scope is `read:user repo` so private READMEs work — still never fetch source trees.

## Sync contract

`syncDrive` / `syncGithub` are **authoritative for their source**:

1. Pull remote material
2. Skip empty / unreadable files (`MIN_USEFUL_CHARS`, catch → `skipped`)
3. `replaceDocsForSource(source, docs)` — wipes that source first, then writes
4. Patch `syncedAt` on the connection

Unchecking a repo or deleting a Drive file therefore removes it from the index on the next sync. Never leave orphan chunks for a source you just replaced.

Doc ids: `drive:{fileId}`, `github:{fullName}`. Uploads and typed stories are handled in the options Data tab via `saveDoc`, not these sync jobs.

## What gets indexed

| Source | Content |
|--------|---------|
| Drive | Google Docs (export), PDF (pdf.js), plain text / markdown in the picked folder tree |
| GitHub | Repo description + topics + README (capped ~20k chars) — **never** source files |
| Upload | Same PDF / txt / md path via `readUploadedFile` |

## Invariants

- Call sync only from options (or another DOM context). PDF workers and long fetches do not belong in the service worker.
- Never log OAuth tokens, the GitHub client secret, or document text.
- Do not add write scopes or upload-to-Drive without an explicit product request.
- Keep ATS / LLM / retrieval out of this folder — produce `ContextDoc` text only.
