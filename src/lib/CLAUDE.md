# `src/lib/`

Shared domain logic used by background, content (types/messages only), side panel, and options. No React. Side effects are limited to Chrome storage, IndexedDB, and `fetch` to AI providers.

## Modules

| Path | Role |
|------|------|
| `types.ts` | Canonical domain types |
| `messages.ts` | Typed message unions + `sendToBackground` / `sendToTab` |
| `settings.ts` | Profile + Settings get/set via `chrome.storage.local`; defaults and field labels |
| `db.ts` | IndexedDB (`irke`): brain docs, chunks, answer bank |
| `answer-bank.ts` | Question fingerprinting, lookup, remember |
| `prompt.ts` | System / user prompt builders; `[NEED INPUT]` contract |
| `llm.ts` | BYOK OpenAI + Anthropic chat completions |
| `brain/` | Chunking, tokenization, BM25 retrieval (see `brain/CLAUDE.md`) |

## Storage keys / stores

- Settings key: `irke:settings`
- Profile key: `irke:profile`
- IndexedDB stores: `brain_docs`, `brain_chunks`, `answer_bank`

Schema upgrades go through `DB_VERSION` + `onupgradeneeded` in `db.ts`. Bump the version when adding stores or indexes.

## Prompt contract

`buildSystemPrompt` / `buildUserPrompt` must keep these rules:

- First person, as the candidate
- Facts only from profile, brain excerpts, or JD
- No invented employers / titles / dates / degrees / metrics
- Missing facts → literal `[NEED INPUT]` (`NEEDS_INPUT_MARKER`)
- Return answer text only (no preamble)

## LLM

- Providers: `openai` | `anthropic` (extend `LlmProvider` + `call*` together)
- Empty / missing API key → clear user-facing error
- Anthropic browser calls need `anthropic-dangerous-direct-browser-access: true` (already set)
- Do not proxy keys through a server

## Answer bank fingerprints

`fingerprintQuestion` lowercases, strips `(required)` / `(optional)` / punctuation, collapses whitespace. Exact fingerprint match only — similar-but-different questions are separate entries (same behavior as Simplify).

## Conventions

- Pure helpers where possible (`brain/tokenize`, `brain/retrieve`, fingerprinting).
- Async storage wrappers return Promises; callers handle errors.
- Prefer updating `types.ts` once over ad-hoc interfaces in callers.
