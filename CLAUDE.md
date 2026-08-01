# Irke

Chrome Manifest V3 extension that reads job descriptions and application questions on the page, then drafts answers grounded in the user's own documents (resume, past answers, about-me). Simplify-style in-browser copilot with a personal RAG brain and bring-your-own API key.

There is **no Irke backend**. Profile and settings live in `chrome.storage.local`; brain documents and the answer bank live in IndexedDB. The only network traffic is the browser talking directly to OpenAI or Anthropic.

## Repository layout

| Path | Role |
|------|------|
| `src/background/` | Service worker: scan orchestration, generate pipeline, fill/save |
| `src/content/` | Content scripts: JD scrape, field detect, ATS adapters, fill |
| `src/lib/` | Shared types, messaging, storage, brain, prompts, LLM clients |
| `src/sidepanel/` | Review / generate / fill UI (opened from the toolbar icon) |
| `src/options/` | Brain, profile, answer bank, and AI provider settings |
| `src/ui/` | Shared dark theme CSS |
| `scripts/` | Dev smoke tests (retrieval) |
| `manifest.config.ts` | CRXJS manifest source of truth |
| `dist/` | Built extension — load this as unpacked in Chrome |

Read nested guides before editing each area:

- `src/CLAUDE.md` — message protocol, storage boundaries, answer-source priority
- `src/background/CLAUDE.md` — service worker flows
- `src/content/CLAUDE.md` — DOM scraping, detection, fill safety
- `src/lib/CLAUDE.md` — brain, prompts, LLM, IndexedDB
- `src/sidepanel/CLAUDE.md` — panel UI and draft state
- `src/options/CLAUDE.md` — settings pages

## Development

```bash
npm install
npm run build      # typecheck + vite → dist/
npm run dev        # Vite + CRXJS HMR; still load dist/ in Chrome
npm run typecheck
npm run smoke      # BM25 retrieval against a sample brain
```

Load in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`. After code changes that touch the content script, reload the extension **and** the job application tab.

## Architecture

```
Job page
  └── content script (all frames)
        ├── scrape JD / company / title
        ├── detect form questions
        └── fill controlled inputs
              ▲
              │ chrome.tabs.sendMessage
              │
side panel / options ──▶ service worker
                              ├── answer bank hit?     → reuse
                              ├── profile field match? → fill instantly
                              └── retrieve chunks → BYOK LLM → draft
```

Answer sources, cheapest first: **profile → answer bank → brain + LLM**. Never invent facts; missing required facts become `[NEED INPUT]`.

## Agent guidelines

1. **Minimize scope** — Match existing patterns; no drive-by refactors.
2. **Privacy** — Never log API keys, resume text, or answer-bank contents. No Irke server; do not add one without an explicit request.
3. **Safety** — Never auto-submit forms. Never touch CAPTCHA, honeypot, password, OTP, SSN, or payment fields (`src/content/detect.ts`).
4. **Message contract** — Request/response unions live in `src/lib/messages.ts`. Keep background, content, and UI in sync when changing them.
5. **No commits** unless the user asks. Do not commit `node_modules/`, `dist/`, or user data.
6. **Tests** — Prefer `npm run smoke` / small pure-function checks over heavy harnesses. The repo has little automated coverage.

## Configuration

- Manifest: `manifest.config.ts` (permissions, content scripts, side panel, options page)
- Build: `vite.config.ts` + `@crxjs/vite-plugin`
- TypeScript: `tsconfig.json` (strict, path alias `@/*` → `src/*`)
- Default models: `src/lib/settings.ts` (`DEFAULT_MODELS`)
