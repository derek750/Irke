# `src/lib/`

Shared domain logic used by background, content (types/messages only), side panel, and options. No React. Side effects are limited to Chrome storage, IndexedDB, and `fetch` to AI providers, Google Drive, and GitHub.

## Modules

| Path | Role |
|------|------|
| `types.ts` | Canonical domain types |
| `messages.ts` | Typed message unions + `sendToBackground` / `sendToTab` |
| `settings.ts` | Settings get/set via `chrome.storage.local`; defaults (`generationMode`: polished vs fast) |
| `connections.ts` | Google Drive + GitHub connection state via `chrome.storage.local` |
| `connectors/` | Drive API, GitHub API, PDF text extraction, and the sync jobs that feed the index (see `connectors/CLAUDE.md`) |
| `db.ts` | IndexedDB (`irke`): context docs, chunks, answer bank |
| `answer-bank.ts` | Question fingerprinting, lookup, remember |
| `prompt.ts` | Draft + revise prompt builders; context-reading and writing skills; per-topic guidance; `[NEED INPUT]` contract |
| `llm.ts` | BYOK OpenAI + Anthropic chat completions |
| `context/` | Chunking, tokenization, BM25 + optional embedding hybrid retrieval (see `context/CLAUDE.md`) |

## Storage keys / stores

- Settings key: `irke:settings`
- Connections key: `irke:connections`
- IndexedDB stores: `context_docs`, `context_chunks` (optional `embedding` on chunks after Build index), `answer_bank`

Schema upgrades go through `DB_VERSION` + `onupgradeneeded` in `db.ts`. Bump the version when adding stores or indexes. v2 dropped the v1 `brain_docs` / `brain_chunks` stores outright — their records carried the retired profile-era shape.

## Connectors

See `connectors/CLAUDE.md` for auth, sync contract, and what gets indexed. Short version: syncs are authoritative per source (`replaceDocsForSource`), run from the **options page** (not the worker), and never pull GitHub source files.

## Prompt contract

`buildSystemPrompt` / `buildUserPrompt` (draft pass) and `buildReviseSystemPrompt` / `buildReviseUserPrompt` (revise pass) must keep these rules:

- First person, as the candidate
- Facts only from context excerpts or the JD
- No invented employers / titles / dates / degrees / metrics / anecdotes
- Missing facts → literal `[NEED INPUT]` (`NEEDS_INPUT_MARKER`)
- Return answer text only (no preamble)

Two skill blocks live in the draft system prompt and are mirrored in the revise checklist:

- **Context skill** — excerpts are evidence about the candidate (experiences *and* motivations), never text to copy or lightly rephrase.
- **Writing skill** — register rules against known AI tells: varied sentence length, banned stock vocabulary, no "not just X, but Y", no rule-of-three lists, no formal connectors, no em-dash asides, concrete over abstract. Keep the two lists in sync when editing either.

`TOPIC_GUIDANCE` maps each `StoryTopic` to how that kind of question should be answered. Add a topic there and in `content/detect.ts` together.

## LLM

- Providers: `openai` | `anthropic` | `openrouter` (extend `LlmProvider` + `call*` together)
- OpenRouter uses the OpenAI-compatible chat completions API at `openrouter.ai`
- Empty / missing API key → clear user-facing error
- Anthropic browser calls need `anthropic-dangerous-direct-browser-access: true` (already set)
- Do not proxy keys through a server

## Answer bank fingerprints

`fingerprintQuestion` lowercases, strips `(required)` / `(optional)` / punctuation, collapses whitespace. Exact fingerprint match only — similar-but-different questions are separate entries.

## Conventions

- Pure helpers where possible (`context/tokenize`, `context/retrieve`, fingerprinting).
- Async storage wrappers return Promises; callers handle errors.
- Prefer updating `types.ts` once over ad-hoc interfaces in callers.
- Never log tokens, API keys, or document text.
