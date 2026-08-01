# Irke

A Chrome extension that drafts the hard questions on a job application — cover letters, "tell us
about a time you failed", "why do you want to work here" — grounded in your own material. Think
Simplify Copilot, but narrowed to the questions that actually take thought, with a knowledge layer
you own and an API key that is yours.

Irke does not fill in your name, email, salary expectation, or work authorization. Those take ten
seconds to type and are the worst possible thing for a language model to guess at. It only answers
questions that ask for a story.

Everything stays in your browser. There is no Irke server. The only network calls are the ones your
browser makes directly to your AI provider, Google Drive, and GitHub.

## How it works

```
Job page  ──▶  content script (scrape JD + detect story questions)
                      │
                      ▼
             service worker  ──▶  answer bank hit?        ──▶ reuse
                      │       ──▶  retrieve your context  ──▶ your LLM ──▶ draft
                      ▼
              side panel (review, edit, fill, save)
```

Two answer sources, cheapest first:

1. **Answer bank** — an answer you already approved for the same question. No AI call.
2. **Context + LLM** — BM25 retrieval over your chunked material, then a grounded draft.

The prompt forbids inventing employers, titles, dates, degrees, metrics, or anecdotes. When a
required fact is missing, the draft contains `[NEED INPUT]` and the side panel flags it.

## Where context comes from

The **Context** tab in settings feeds one local index from four places:

| Source | What Irke reads |
| --- | --- |
| **Google Drive** | One folder you pick, read-only. Google Docs, PDFs, and text files. |
| **GitHub** | Description, topics, and README of the repos you select. Never your source code. |
| **Your stories** | Written straight into the tab. The things no document captures. |
| **File upload** | A PDF, `.txt`, or `.md` — text is extracted locally. |

Stories you write yourself are weighted highest during retrieval, since they were written
deliberately rather than found lying in a folder.

## Install (development)

```bash
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the `dist/` folder.
3. The options page opens on first install. Add your API key and connect your context.
4. Open a job application, click the Irke toolbar icon to open the side panel, then **Rescan**.

For live reloading during development use `npm run dev` and load `dist/` the same way.

### Enabling Google Drive

Drive needs an OAuth client that belongs to you, because there is no Irke server to hold one:

1. In the Google Cloud console, enable the **Google Drive API**.
2. Create an **OAuth client ID** with application type **Chrome Extension**, using your unpacked
   extension's ID from `chrome://extensions`.
3. Put it in `.env` as `VITE_GOOGLE_CLIENT_ID`, then rebuild.

Skip this and everything else still works — the Drive card just explains what is missing.

Folder picking uses Irke's own Drive browser (browse + search). Google's official Picker UI cannot
run inside a Chrome extension — sandboxed pages get a `null` origin and Google blocks them with CORS.

### Enabling GitHub

1. Create an **OAuth App** at `github.com/settings/developers`.
2. Set the Authorization callback URL to `https://<your-extension-id>.chromiumapp.org/`
   (the ID is on `chrome://extensions` with Developer mode on).
3. Put the client ID and client secret in `.env` as `VITE_GITHUB_CLIENT_ID` and
   `VITE_GITHUB_CLIENT_SECRET`, then rebuild.

Skip this and everything else still works — the GitHub card just explains what is missing.

## Setup order that works best

1. **AI provider** — pick OpenAI or Anthropic and paste your key.
2. **Your stories** — write 5–10 real ones. These do more work than anything else.
3. **Google Drive / GitHub** — connect them for resume and project detail you would otherwise retype.

## Supported sites

Dedicated adapters for Greenhouse, Lever, Ashby, Workable, and SmartRecruiters improve job
description and company detection. Every other site falls back to a generic scanner that reads
form labels, so the side panel still works — it just knows less about the role.

Forms rendered in an iframe are handled: all frames are scanned and the one with the most fields
wins, with job context borrowed from the top frame when the form frame has none.

## Safety rules baked in

- Never submits a form. You always click Submit yourself.
- Never touches CAPTCHA, honeypot, password, OTP, SSN, or payment fields.
- Never uploads files, and never reads Drive or GitHub outside the folder and repos you chose.
- Your API key and OAuth tokens live in `chrome.storage.local`; context and saved answers live in
  IndexedDB. Neither is ever logged.

## Project layout

| Path | Role |
| --- | --- |
| `src/background/` | Service worker: orchestrates answer sources, multi-frame scanning |
| `src/content/` | JD scraping, story-question detection, ATS adapters, controlled-input filling |
| `src/sidepanel/` | Review and fill UI |
| `src/options/` | Context connections, answer bank, and provider settings |
| `src/lib/context/` | Chunking and BM25 retrieval |
| `src/lib/connectors/` | Google Drive, GitHub, PDF extraction, sync jobs |
| `src/lib/` | Types, messaging, storage, prompt construction, LLM clients |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with extension HMR |
| `npm run build` | Typecheck, then build `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run smoke` | Retrieval rankings + question-detection assertions |
| `npm run smoke:retrieval` | Retrieval rankings against a sample context index |
| `npm run smoke:detect` | Asserts which application labels count as story questions |
