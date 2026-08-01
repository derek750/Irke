# Irke

A Chrome extension that reads the job description and application questions on the page, then
drafts answers grounded in your own documents — your resume, past application answers, and a
short about-me. Think Simplify Copilot, but the knowledge layer is a personal brain you own and
the API key is yours.

Everything stays in your browser. There is no Irke server. The only network calls are the ones
your browser makes directly to your chosen AI provider.

## How it works

```
Job page  ──▶  content script (scrape JD + detect questions)
                      │
                      ▼
             service worker  ──▶  answer bank hit?      ──▶ reuse
                      │       ──▶  profile field match?  ──▶ fill instantly
                      │       ──▶  retrieve brain chunks ──▶ your LLM ──▶ draft
                      ▼
              side panel (review, edit, fill, save)
```

Three answer sources, cheapest first:

1. **Profile** — name, email, work authorization, notice period, and other repeat fields. No AI call.
2. **Answer bank** — an answer you already approved for the same question. No AI call.
3. **Brain + LLM** — BM25 retrieval over your chunked documents, then a grounded draft.

The prompt forbids inventing employers, titles, dates, degrees, or metrics. When a required fact
is missing, the draft contains `[NEED INPUT]` and the side panel flags it.

## Install (development)

```bash
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the `dist/` folder.
3. The options page opens on first install. Add your API key, profile, and brain documents.
4. Open a job application, click the Irke toolbar icon to open the side panel, then **Rescan**.

For live reloading during development use `npm run dev` and load `dist/` the same way.

## Setup order that works best

1. **AI provider** — pick OpenAI or Anthropic and paste your key.
2. **Brain** — add your resume first, then 5–10 past application answers. These do the most work.
3. **Profile** — fill the repeat fields so they never cost an AI call.

Brain documents are plain text or Markdown. For a PDF resume, copy the text and paste it in.

## Supported sites

Dedicated adapters for Greenhouse, Lever, Ashby, Workable, and SmartRecruiters improve job
description and company detection. Every other site falls back to a generic scanner that reads
form labels, so the side panel still works — it just knows less about the role.

Forms rendered in an iframe are handled: all frames are scanned and the one with the most fields
wins, with job context borrowed from the top frame when the form frame has none.

## Safety rules baked in

- Never submits a form. You always click Submit yourself.
- Never touches CAPTCHA, honeypot, password, OTP, SSN, or payment fields.
- Never uploads files.
- Your API key lives in `chrome.storage.local`; brain documents and saved answers live in IndexedDB.

## Project layout

| Path | Role |
| --- | --- |
| `src/background/` | Service worker: orchestrates answer sources, multi-frame scanning |
| `src/content/` | JD scraping, field detection, ATS adapters, controlled-input filling |
| `src/sidepanel/` | Review and fill UI |
| `src/options/` | Brain, profile, answer bank, and provider settings |
| `src/lib/brain/` | Chunking and BM25 retrieval |
| `src/lib/` | Types, messaging, storage, prompt construction, LLM clients |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with extension HMR |
| `npm run build` | Typecheck, then build `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run smoke` | Prints retrieval rankings for sample questions against a sample brain |
