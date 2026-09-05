# `src/lib/`

Shared domain logic used by background, content (types/messages only), side panel, and options. No React. Side effects are limited to Chrome storage, IndexedDB, and `fetch` to AI providers, Google Drive, and GitHub.

## Modules

| Path | Role |
|------|------|
| `types.ts` | Canonical domain types |
| `messages.ts` | Typed message unions + `sendToBackground` / `sendToTab` |
| `settings.ts` | Settings get/set via `chrome.storage.local`; defaults (`generationMode`, `includeGeneratedInRag`, `letterhead`); `reconcileProvider` |
| `connections.ts` | Google Drive + GitHub connection state via `chrome.storage.local` |
| `connectors/` | Drive API, GitHub API, PDF text extraction, and the sync jobs that feed the index (see `connectors/CLAUDE.md`) |
| `db.ts` | IndexedDB (`irke`): context docs, chunks, answer bank |
| `answer-bank.ts` | Question fingerprinting, save/update/delete, version history; mirrors the current answer into a `source: 'generated'` index doc |
| `prompt.ts` | Draft + revise prompt builders; context-reading and writing skills; per-topic guidance; `[NEED INPUT]` contract; optional `previous` section for regenerates |
| `llm.ts` | BYOK OpenAI + Anthropic chat completions |
| `context/` | Chunking, tokenization, BM25 + optional embedding hybrid retrieval (see `context/CLAUDE.md`) |
| `documents/` | `cover-letter.ts`: a draft plus a letterhead typeset as a `moderncv`-style PDF |

## Storage keys / stores

- Settings key: `irke:settings`
- Connections key: `irke:connections`
- Cached letterhead name: `irke:letterheadName`
- IndexedDB stores: `context_docs`, `context_chunks` (optional `embedding` on chunks after Build index), `answer_bank`

Schema upgrades go through `DB_VERSION` + `onupgradeneeded` in `db.ts`. Bump the version when adding stores or indexes. v2 dropped the v1 `brain_docs` / `brain_chunks` stores outright — their records carried the retired profile-era shape. v4 adds an `embeddedAt` index on chunks so coverage and auto-embed can count/fetch missing vectors without cloning every embedding into JS.

## Connectors

See `connectors/CLAUDE.md` for auth, sync contract, and what gets indexed. Short version: syncs are authoritative per source (`replaceDocsForSource`), run from the **options page** (not the worker), and never pull GitHub source files.

## Prompt contract

`buildSystemPrompt` / `buildUserPrompt` (draft pass) and `buildReviseSystemPrompt` / `buildReviseUserPrompt` (revise pass) must keep these rules:

- First person, as the candidate
- Facts only from context excerpts or the JD
- No invented employers / titles / dates / degrees / metrics / anecdotes
- Missing facts → literal `[NEED INPUT]` (`NEEDS_INPUT_MARKER`)
- Return answer text only (no preamble)
- `[PRIOR DRAFT]` excerpts are story memory to adapt from — never paste
- A per-answer `steer` becomes a "candidate's direction" section beside the question in **both** user prompts (it outranks topic guidance; unsupported asks become `[NEED INPUT]`), and excerpts retrieval pinned for it are labeled "pulled in for this direction". Standing `extraInstructions` stay in the system prompt — do not merge the two
- A `baseDraft` (text the user wrote or edited, sent on a refine) is a "current draft — build on this" section in the draft pass and "the candidate's own draft this grew from" in the revise pass: kept story, kept facts, the candidate's words protected from the AI-tell edit. Never render it and a rejected-answers block in the same prompt

Two skill blocks live in the draft system prompt and are mirrored in the revise checklist:

- **Context skill** — excerpts are evidence about the candidate (experiences *and* motivations), never text to copy or lightly rephrase. Prior drafts are explicitly called out.
- **Writing skill** — register rules against known AI tells: varied sentence length, banned stock vocabulary, no "not just X, but Y", no rule-of-three lists, no formal connectors, no em-dash asides, concrete over abstract. Keep the two lists in sync when editing either.

`TOPIC_GUIDANCE` maps each `StoryTopic` to how that kind of question should be answered. Add a topic there and in `content/detect.ts` together.

## LLM

- Providers: `openai` | `anthropic` | `openrouter` (extend `LlmProvider` + `call*` together)
- `reconcileProvider` in `settings.ts` routes an `sk-or-` key to OpenRouter whatever the dropdown says, and swaps a bare model name for a `vendor/model` slug. Every surface reads settings through `getSettings`, so none of them can disagree about where a key is posted
- OpenRouter uses the OpenAI-compatible chat completions API at `openrouter.ai`
- Empty / missing API key → clear user-facing error
- Anthropic browser calls need `anthropic-dangerous-direct-browser-access: true` (already set)
- Do not proxy keys through a server

## Documents

`documents/cover-letter.ts` is pure and React-free. `buildCoverLetterPdf` draws a `moderncv`-style classic letter with `pdf-lib`: name, contact line, rule, date, recipient, salutation, justified body at 11pt on US Letter with 1 inch margins, then the signature. Single column, no tables, no icons — ATS parsers read it fine.

Latin Modern Roman (`ui/fonts/`) is what makes the page read as LaTeX; if embedding fails it falls back to the built-in Times-Roman. Because that fallback encodes WinAnsi and throws on anything outside it, text is sanitized once at the boundary in `prepare()` — accents stripped and unencodable characters dropped for the fallback only. Justification is manual: wrap with `widthOfTextAtSize`, then spread the slack across the gaps on every line but a paragraph's last.

## Answer bank

`fingerprintQuestion` lowercases, strips `(required)` / `(optional)` / punctuation, collapses whitespace. Saves upsert by fingerprint and mirror into the context index as `source: 'generated'`. Generation does **not** auto-paste bank hits — prior drafts only enter RAG when `includeGeneratedInRag` is on.

One row per question, but every distinct answer it has ever had is kept in `versions` (oldest first, current last, capped at 20). Regenerating and hand-editing both append; re-picking an older version moves it to the end rather than duplicating it. Rows written before versioning seed their history from the answer they already hold. Only `answer` is mirrored into the index — five near-identical drafts of one question would crowd real material out of retrieval. The `fingerprint` index in `db.ts` is `unique`, so attempts cannot become separate rows without a migration.

## Conventions

- Pure helpers where possible (`context/tokenize`, `context/retrieve`, fingerprinting).
- Async storage wrappers return Promises; callers handle errors.
- Prefer updating `types.ts` once over ad-hoc interfaces in callers.
- Never log tokens, API keys, or document text.
