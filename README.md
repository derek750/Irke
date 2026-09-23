<p align="center">
  <img src="src/assets/logo.png" alt="Irke" width="128">
</p>

<h1 align="center"><a href="https://chromewebstore.google.com/detail/irke/baeafmkcbebgjcccblamomncjcfhpkic">Irke</a></h1>

<p align="center">
  Drafts the questions about you on a job application from your own notes, Drive, and GitHub.<br>
  Local retrieval, bring-your-own API key.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/irke/baeafmkcbebgjcccblamomncjcfhpkic"><img src="https://img.shields.io/badge/extension-live-2ea44f?style=flat-square&logo=googlechrome&logoColor=white" alt="extension: live"></a>
  <a href="https://chromewebstore.google.com/detail/irke/baeafmkcbebgjcccblamomncjcfhpkic"><img src="https://img.shields.io/chrome-web-store/users/baeafmkcbebgjcccblamomncjcfhpkic?style=flat-square&label=downloads" alt="downloads"></a>
  <a href="https://github.com/derek750/Irke/releases"><img src="https://img.shields.io/github/package-json/v/derek750/Irke?label=release&style=flat-square" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License: MIT"></a>
</p>

---

## Overview

Applications still ask you to write. Cover letters, “tell us about a time,” why this company. The rest — name, email, salary, start date — is fast to type and disastrous to guess at.

**Irke** is a Chrome extension that reads the job description and those questions about you, then drafts answers grounded in material you already have. It never submits the form. It never invents employers, dates, or metrics. Missing facts show up as `[NEED INPUT]`.

There is no Irke server. Settings live in `chrome.storage.local`. Your documents and answer bank live in IndexedDB. The only network traffic is the browser talking directly to OpenAI or OpenRouter, Google Drive, and GitHub.

---



## Features

- **Questions about you** — cover letters, behavioral prompts, “why us.” Name, email, salary, and the rest are ignored on purpose.
- **Local index** — stories you type, PDF / txt / md uploads, a Drive folder, GitHub README prose. Chunked and searched in the browser (BM25, optional embeddings).
- **Bring-your-own key** — OpenAI or OpenRouter. Keys stay in Chrome storage; they are never sent through an Irke backend.
- **Side panel** — scan the page, generate, edit, fill the field, or copy. Typed questions work when the scan misses one.
- **Cover-letter PDF** — drafts the letter, typesets it `moderncv`-style (Latin Modern), and on **Attach PDF** sets that file on the detected upload. **Download PDF** keeps a copy. Never attached without a click.
- **Answer bank** — saved drafts are yours to reuse as retrieval context if you opt in. They are never pasted back as-is.
- **Never submits** — fill and attach are explicit. CAPTCHA, passwords, OTP, SSN, and payment fields are never touched.

---



## How it works

```
Job page
 └── content script (injected on scan)
      scrape JD / company / title
      detect questions about you (drop every specific)
      fill a controlled input / attach the PDF on click
           ▲
           │ chrome.tabs.sendMessage
side panel ──▶ service worker
                retrieve chunks → your LLM → draft

Dashboard ──▶ Drive folder / GitHub READMEs / stories / uploads
                └── chunk + BM25 index (IndexedDB)
```

1. Load context in the dashboard (stories, files, Drive, GitHub). Optionally distill stories so a “conflict” question can find a write-up that never used that word.
2. Open Irke on an application. Scan injects a content script for that tab only.
3. Generate retrieves matching excerpts and drafts in first person from those facts.
4. You edit. Fill writes the text into the field, or Attach PDF sets the typeset letter. You submit.

---



## Tech stack


| Layer      | Technologies                                             |
| ---------- | -------------------------------------------------------- |
| Extension  | Chrome Manifest V3, CRXJS, Vite 6, TypeScript            |
| UI         | React 19, shared dark theme (`src/ui/theme.css`)         |
| Retrieval  | IndexedDB, BM25, optional OpenAI / OpenRouter embeddings |
| LLM        | OpenAI or OpenRouter (BYOK)                              |
| Documents  | pdf-lib, Latin Modern, pdf.js for ingest                 |
| Connectors | Google Drive (readonly OAuth), GitHub OAuth              |


---



## Getting started



### Prerequisites

- **Node.js** 18+
- **Chrome** (Developer mode)
- An **OpenAI** or **OpenRouter** API key for generation
- Optional: Google OAuth client (Chrome Extension type) for Drive, GitHub OAuth app for GitHub



### Setup

```bash
npm install
npm run build    # typecheck + vite → dist/
npm run dev      # Vite + CRXJS HMR; still load dist/ in Chrome
```



### Load in Chrome (unpacked)

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the `dist/` folder.

The toolbar icon opens the side panel. The content script is injected at scan time, so after reloading the extension a **Rescan** is enough — no tab refresh.

### Environment variables

Copy `.env.example` to `.env` and fill in what you need, then rebuild. Leave a value unset and that connection stays unavailable; everything else still works.


| Variable                    | Required | Description                                                                                                               |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `VITE_GOOGLE_CLIENT_ID`     | No       | Google Cloud OAuth client (application type: Chrome Extension), tied to your unpacked extension ID. Enable the Drive API. |
| `VITE_GITHUB_CLIENT_ID`     | No       | GitHub OAuth App client ID. Callback: `https://<extension-id>.chromiumapp.org/`                                           |
| `VITE_GITHUB_CLIENT_SECRET` | No       | GitHub still requires the secret on token exchange                                                                        |


Provider keys are entered in the dashboard (Settings), not in `.env`.

---



## Chrome Web Store

[Irke on the Chrome Web Store](https://chromewebstore.google.com/detail/irke/baeafmkcbebgjcccblamomncjcfhpkic).

Listing copy, permission justifications, privacy-practices answers, and the screenshot checklist live in `[store/listing.md](store/listing.md)`. The privacy policy URL for the console is `[PRIVACY.md](PRIVACY.md)`.

```bash
npm run pack   # production build → store/irke.zip (source maps omitted)
```

Upload `store/irke.zip` at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). After the first upload, copy the item ID into your Google / GitHub OAuth clients and pack again if Drive or GitHub should work for store users.

---



## Development

```bash
npm run typecheck
npm run smoke    # retrieval, question detection, prompt contract, generate pipeline, scan frames
```

---



## Repo layout

```
.
├── src/
│   ├── background/   Service worker: scan, generate, fill / attach
│   ├── content/      JD scrape, story detection, ATS adapters, fill
│   ├── lib/          Types, messaging, storage, retrieval, connectors, LLM, cover-letter PDF
│   ├── sidepanel/    Review / generate / fill UI
│   ├── options/      Dashboard: context, connectors, answer bank, AI
│   └── ui/           Shared theme, fonts, SourcesPopover
├── scripts/          Dev smoke tests
├── manifest.config.ts
└── dist/             Built extension — load this unpacked
```

---



## Privacy

- No Irke backend.
- API keys, GitHub tokens, document text, and the answer bank are not logged.
- Letterhead (name, email, phone, location, links) exists only to typeset a generated document. It is never written into a form field.

