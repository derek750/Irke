# `src/options/`

Options page React UI. Opens on first install and from the side panel **Brain** button. This is where the user loads context and configures the provider — not where generation runs.

## Files

| File | Responsibility |
|------|----------------|
| `index.html` / `main.tsx` | Vite entry |
| `Options.tsx` | Tab shell: Brain / Profile / Answer bank / AI provider |
| `BrainTab.tsx` | Add/list/delete brain docs; chunk + index on save |
| `ProfileTab.tsx` | Repeat autofill facts → `chrome.storage.local` |
| `AnswersTab.tsx` | Edit / delete saved answer-bank entries |
| `AiTab.tsx` | Provider, model, API key, temperature, extra instructions |
| `options.css` | Layout |

## Tabs

| Tab | Persistence | Notes |
|-----|-------------|-------|
| Brain | IndexedDB via `db.ts` + `chunkDoc` | Text / Markdown upload only; PDF → tell user to paste |
| Profile | `saveProfile` | Keys must stay aligned with `PROFILE_FIELD_LABELS` / content `PROFILE_PATTERNS` |
| Answer bank | IndexedDB | Fingerprints are immutable keys; editing updates answer text only |
| AI provider | `saveSettings` | Switching provider resets model to `DEFAULT_MODELS[provider]` |

## Brain ingest

On **Add to brain**:

1. Build `BrainDoc` (`crypto.randomUUID`, kind, title, text, `createdAt`)
2. `putDoc`
3. `replaceChunksForDoc(doc.id, chunkDoc(doc))`

On **Remove**: `deleteDocAndChunks` (doc + all chunks for that `docId`).

Do not leave orphan chunks. Do not call the LLM from this page.

## Conventions

- Local React state + explicit Save buttons (no autosave) for profile / AI settings.
- Reuse `theme.css` primitives; keep copy calm and instructional.
- User-facing errors via `.notice.error` — never dump stack traces.
- When adding a profile field: update `Profile` in `types.ts`, labels in `settings.ts`, patterns in `content/detect.ts`, and the Profile tab grid (it iterates keys automatically once labels exist).

## What not to do

- Do not store API keys in IndexedDB or log them.
- Do not add a cloud sync backend from this page.
- Avoid new form libraries — native inputs match the rest of the extension.
