# `src/lib/`

Shared domain logic used by background, content (types/messages only), side panel, and options. No React. Side effects are limited to Chrome storage, IndexedDB, and `fetch` to AI providers, Google Drive, and GitHub.

## Modules

| Path | Role |
|------|------|
| `types.ts` | Canonical domain types |
| `messages.ts` | Typed message unions + `sendToBackground` / `sendToTab` |
| `settings.ts` | Settings get/set via `chrome.storage.local`; defaults |
| `connections.ts` | Google Drive + GitHub connection state via `chrome.storage.local` |
| `connectors/` | Drive API, GitHub API, PDF text extraction, and the sync jobs that feed the index |
| `db.ts` | IndexedDB (`irke`): context docs, chunks, answer bank |
| `answer-bank.ts` | Question fingerprinting, lookup, remember |
| `prompt.ts` | System / user prompt builders; per-topic guidance; `[NEED INPUT]` contract |
| `llm.ts` | BYOK OpenAI + Anthropic chat completions |
| `context/` | Chunking, tokenization, BM25 + optional embedding hybrid retrieval (see `context/CLAUDE.md`) |

## Storage keys / stores

- Settings key: `irke:settings`
- Connections key: `irke:connections`
- IndexedDB stores: `context_docs`, `context_chunks` (optional `embedding` on chunks after Build index), `answer_bank`

Schema upgrades go through `DB_VERSION` + `onupgradeneeded` in `db.ts`. Bump the version when adding stores or indexes. v2 dropped the v1 `brain_docs` / `brain_chunks` stores outright — their records carried the retired profile-era shape.

## Connectors

| File | Notes |
|------|-------|
| `connectors/drive.ts` | `chrome.identity.getAuthToken` for OAuth; read-only scope; one user-picked folder |
| `connectors/github.ts` | `chrome.identity.launchWebAuthFlow` + PKCE; description + topics + README only, never source files |
| `connectors/pdf.ts` | `pdfjs-dist` with a bundled worker (CSP forbids a CDN worker) |
| `connectors/sync.ts` | `syncDrive` / `syncGithub` / `readUploadedFile` — turn remote material into `ContextDoc`s |

A sync is authoritative for its source: `replaceDocsForSource` wipes that source first, so unchecking a repo or deleting a Drive file removes it from the index too.

Syncs run from the **options page**, not the service worker, because PDF extraction needs a DOM-capable context and the worker can be evicted mid-sync.

## Prompt contract

`buildSystemPrompt` / `buildUserPrompt` must keep these rules:

- First person, as the candidate
- Facts only from context excerpts or the JD
- No invented employers / titles / dates / degrees / metrics / anecdotes
- Missing facts → literal `[NEED INPUT]` (`NEEDS_INPUT_MARKER`)
- Return answer text only (no preamble)

`TOPIC_GUIDANCE` maps each `StoryTopic` to how that kind of question should be answered. Add a topic there and in `content/detect.ts` together.

## LLM

- Providers: `openai` | `anthropic` (extend `LlmProvider` + `call*` together)
- Empty / missing API key → clear user-facing error
- Anthropic browser calls need `anthropic-dangerous-direct-browser-access: true` (already set)
- Do not proxy keys through a server

## Answer bank fingerprints

`fingerprintQuestion` lowercases, strips `(required)` / `(optional)` / punctuation, collapses whitespace. Exact fingerprint match only — similar-but-different questions are separate entries (same behavior as Simplify).

## Conventions

- Pure helpers where possible (`context/tokenize`, `context/retrieve`, fingerprinting).
- Async storage wrappers return Promises; callers handle errors.
- Prefer updating `types.ts` once over ad-hoc interfaces in callers.
- Never log tokens, API keys, or document text.
