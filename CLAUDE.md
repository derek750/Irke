# Irke

Chrome Manifest V3 extension that reads a job description and the **story questions** on an application — cover letters, "tell us about a time", "why this company" — then drafts answers grounded in the user's own material. Local retrieval index, bring-your-own API key. No Irke backend.

Irke deliberately ignores the specifics: name, email, phone, salary, start date, work authorization, demographics. Those are quick to type and disastrous to guess at. It only handles the questions that ask for a story.

There is **no Irke backend**. Settings and connection state live in `chrome.storage.local`; context documents and the answer bank live in IndexedDB. The only network traffic is the browser talking directly to OpenAI or Anthropic, Google Drive, and GitHub.

## Repository layout

| Path | Role |
|------|------|
| `src/background/` | Service worker: scan orchestration, generate pipeline, fill/save |
| `src/content/` | Content scripts: JD scrape, story-question detection, ATS adapters, fill |
| `src/lib/` | Shared types, messaging, storage, context index, connectors, prompts, LLM clients |
| `src/sidepanel/` | Review / generate / fill UI (opened from the toolbar icon) |
| `src/options/` | Dashboard: data, connectors, answer bank, AI provider |
| `src/ui/` | Shared dark theme CSS |
| `scripts/` | Dev smoke tests (retrieval, question detection) |
| `manifest.config.ts` | CRXJS manifest source of truth |
| `dist/` | Built extension — load this as unpacked in Chrome |

Read nested guides before editing each area:

- `src/CLAUDE.md` — message protocol, storage boundaries, answer-source priority
- `src/background/CLAUDE.md` — service worker flows
- `src/content/CLAUDE.md` — DOM scraping, story detection, fill safety
- `src/lib/CLAUDE.md` — shared types, storage, prompts, LLM, IndexedDB
- `src/lib/context/CLAUDE.md` — chunking, BM25 / hybrid retrieval, Build index
- `src/lib/connectors/CLAUDE.md` — Drive, GitHub, PDF, sync jobs
- `src/sidepanel/CLAUDE.md` — panel UI and draft state
- `src/options/CLAUDE.md` — Dashboard (Data / Connectors / Answer bank / AI)
- `src/ui/CLAUDE.md` — shared theme tokens
- `scripts/CLAUDE.md` — smoke tests

## Development

```bash
npm install
npm run build # typecheck + vite → dist/
npm run dev # Vite + CRXJS HMR; still load dist/ in Chrome
npm run typecheck
npm run smoke # BM25 retrieval + question-detection checks
```

Load in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`. After code changes that touch the content script, reload the extension **and** the job application tab.

For the Google Drive connection, copy `.env.example` to `.env.local` and add a Google OAuth client id (application type: Chrome Extension) tied to your unpacked extension's id. Everything else works without it.

## Architecture

```
Job page
 └── content script (all frames)
 ├── scrape JD / company / title
 ├── detect story questions (drop every specific)
 └── fill controlled inputs
 ▲
 │ chrome.tabs.sendMessage
 │
side panel ──▶ service worker
 ├── answer bank hit? → reuse
 └── retrieve chunks → BYOK LLM → draft

options page ──▶ Google Drive folder ─┐
 ├─▶ GitHub repo READMEs ────────────┼─▶ chunk + BM25 index (IndexedDB)
 ├─▶ typed stories ──────────────────┤
 └─▶ uploaded PDF / txt / md ────────┘
```

Answer sources, cheapest first: **answer bank → context + LLM**. Never invent facts; missing required facts become `[NEED INPUT]`.

## Agent guidelines

1. **Minimize scope** — Match existing patterns; no drive-by refactors.
2. **Privacy** — Never log API keys, the GitHub token, document text, or answer-bank contents. No Irke server; do not add one without an explicit request.
3. **Safety** — Never auto-submit forms. Never touch CAPTCHA, honeypot, password, OTP, SSN, or payment fields (`src/content/detect.ts`).
4. **Stay in scope** — Do not reintroduce profile autofill or detection of non-story fields without an explicit product change.
5. **Message contract** — Request/response unions live in `src/lib/messages.ts`. Keep background, content, and UI in sync when changing them.
6. **No commits** unless the user asks. Do not commit `node_modules/`, `dist/`, `.env.local`, or user data.
7. **Tests** — Prefer `npm run smoke` / small pure-function checks over heavy harnesses. The repo has little automated coverage.

## Configuration

- Manifest: `manifest.config.ts` (permissions, content scripts, side panel, options page, Google OAuth)
- Build: `vite.config.ts` + `@crxjs/vite-plugin`
- TypeScript: `tsconfig.json` (strict, path alias `@/*` → `src/*`)
- Default models: `src/lib/settings.ts` (`DEFAULT_MODELS`)
- Google OAuth client id: `VITE_GOOGLE_CLIENT_ID` in `.env.local` (see `.env.example`)
