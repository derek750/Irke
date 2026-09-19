# Chrome Web Store listing

Paste-ready copy for every console field. Build the zip with `npm run pack` → `store/irke.zip`.

Store console: [https://chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)

---

## Item listing

| Field | Value |
|-------|--------|
| **Name** (75 chars max) | Irke |
| **Summary** (132 chars max; matches `package.json` `description`) | Drafts answers to questions about you on job applications from your own notes, Drive, and GitHub. |
| **Category** | Productivity |
| **Language** | English |
| **Visibility** | Public (or Unlisted while reviewing) |
| **Official URL** | https://github.com/derek750/Irke |
| **Support URL** | https://github.com/derek750/Irke/issues |
| **Privacy policy** | https://github.com/derek750/Irke/blob/main/PRIVACY.md |
| **Homepage** (manifest) | https://github.com/derek750/Irke |

Push `PRIVACY.md` to `main` before submitting so that URL resolves.

---

## Detailed description

Paste the block below into **Detailed description**. Plain text (Chrome does not render Markdown). Character count is well under the 16,000 limit.

```
Irke drafts the hard parts of a job application — cover letters, “tell us about a time,” why this company — from writing you already have.

It reads the job description and the questions about you on the page you have open, then drafts first-person answers grounded in your notes, uploads, Google Drive folder, and GitHub READMEs. You edit. You fill the field, or attach a typeset cover-letter PDF. You submit.

There is no Irke server. Your documents, API key, and answer bank stay in the browser. Generation talks only to the AI provider you choose (OpenAI or OpenRouter) with your own key.

WHAT IT HANDLES
• Cover letters, including file-upload fields
• Behavioral and “about you” prompts
• Why this company / why this role

WHAT IT IGNORES ON PURPOSE
Name, email, phone, salary, start date, work authorization, and demographics. Those are fast to type and disastrous to guess at. Irke never fills them.

WHAT IT NEVER DOES
• Never submits the application
• Never attaches a PDF until you click Attach PDF
• Never touches CAPTCHA, passwords, OTP, SSN, or payment fields
• Never invents employers, dates, or metrics. Missing facts show up as [NEED INPUT]

HOW IT WORKS
1. Open the dashboard (it opens on first install). Add context: typed stories, PDF / txt / md files, an optional Drive folder, optional GitHub repos. Paste your OpenAI or OpenRouter key under Settings.
2. On an application, click the Irke icon. Scan finds the questions about you on that tab only — nothing runs in the background on every site.
3. Generate retrieves matching excerpts from a local index in your browser, then drafts from those facts.
4. Edit the draft. Fill writes it into the field. For a cover letter, Attach PDF typesets a moderncv-style letter (Latin Modern) and sets that file on the upload control. Download PDF keeps a copy.

YOUR MATERIAL STAYS YOURS
Settings live in Chrome storage. Context and the answer bank live in IndexedDB. Saved drafts are yours to reuse as retrieval context if you opt in — they are never pasted back as-is. API keys are never sent through an Irke backend (there isn’t one).

OPTIONAL CONNECTIONS
Google Drive is read-only: Irke indexes a folder you pick. GitHub indexes README prose from repos you select. Both are optional; everything else works without them.

Irke is open source: https://github.com/derek750/Irke
Support: https://github.com/derek750/Irke/issues
Privacy policy: https://github.com/derek750/Irke/blob/main/PRIVACY.md
```

---

## Graphics

Chrome requires at least **one screenshot** at **1280×800** or **640×400**, JPEG or PNG, actual UI, no fake browser chrome. Promo tiles are optional.

Repo files (1280×800, 24-bit PNG, no alpha):

| Upload order | File | Caption (paste in console) |
|--------------|------|----------------------------|
| 1 | `store/screenshots/01-dashboard-generate.png` | Dashboard — paste a question and generate a draft from your own context. |
| 2 | `store/screenshots/02-sidepanel.png` | Side panel — scan an application, draft a cover letter, attach or download the PDF. You submit. |

Suggested extra shots if you recapture at 1280×800: Context tab with stories/files, a generated draft with sources, Settings / letterhead (empty of secrets).

| Asset | Size | Notes |
|-------|------|--------|
| Screenshots (required, 1–5) | 1280×800 or 640×400 | Captions above |
| Small promo tile | 440×280 | Optional |
| Marquee | 1400×560 | Optional |
| Store icon | 128×128 | From the zip (`icon-128.png`) |

---

## Privacy practices tab

This is the **Privacy** tab in the developer console. Paste each block into the matching field. Permissions listed here must match the uploaded zip’s manifest.

### Single purpose description

```
Draft first-person answers to job-application questions about the candidate (cover letters, behavioral prompts, why this company) from material the user already has. Irke does not autofill name, email, phone, salary, start date, work authorization, or demographics, and it never submits the form.
```

### Permission justifications

One field per permission. Paste the paragraph for that permission.

**storage**

```
Used with chrome.storage.local to save the user’s AI provider, model, API key, generation settings, extra instructions, cover-letter letterhead, and optional Drive/GitHub connection state. Context documents and the answer bank are stored in IndexedDB on the same device. This data is required so drafts can be grounded in the user’s material after Chrome restarts. Nothing is sent to an Irke server (there is none). Not used for sync, analytics, or advertising.
```

**sidePanel**

```
Used with chrome.sidePanel.setPanelBehavior and the side_panel manifest entry so the toolbar icon opens the side panel. The panel is the user-facing UI: scan the open application, review detected questions, generate and edit drafts, Fill a field, or Attach/Download a cover-letter PDF. No other UI surface replaces this.
```

**activeTab**

```
Used to resolve the tab the user is applying on (chrome.tabs.query of the active tab) so Scan, Fill, and Attach PDF target that tab only. Combined with on-demand scripting, this avoids a persistent content script on all sites. activeTab alone is not enough for ATS iframes or side-panel-initiated scans (see host permission and scripting).
```

**scripting**

```
Used with chrome.scripting.executeScript to inject the content script into selected frames of the active tab at scan time only. The script reads the job description and questions about the user, and later fills a chosen text field or sets a cover-letter PDF on a file input when the user clicks Fill or Attach PDF. There is no static content_scripts key in the manifest, so no code runs on pages until the user scans. Re-injection is a no-op. Restricted pages (chrome://, the Web Store) are not injected.
```

**webNavigation**

```
Used only with chrome.webNavigation.getAllFrames on the active tab during a user-initiated scan. Application forms often live in an ATS iframe (Greenhouse, Lever, and similar) while the job description is in the top frame. Frame listing lets Irke inject and scan a small set of candidate frames (top + ATS/same-origin, skip ads/analytics/CAPTCHA, cap of 10) instead of every iframe on the page. Not used to observe or record navigation history.
```

**identity**

```
Used only when the user connects an optional source in the dashboard. Google Drive uses chrome.identity.getAuthToken with the drive.readonly scope to list and export files in a folder the user picks; the token is not persisted by Irke. GitHub uses chrome.identity.launchWebAuthFlow and getRedirectURL to obtain a token, then fetches README prose from repos the user selects. Tokens are used only to build the local index. Identity is not used for sign-in to Irke (there is no Irke account).
```

**Host permission: `<all_urls>`** (sometimes labeled “Host permission” or the pattern itself)

```
Applications live on many career and ATS domains (Greenhouse, Lever, Ashby, Workday, others), often in cross-origin iframes, so origins cannot be listed in advance. Host access is used only when the user clicks Scan, Fill, or Attach PDF on the open tab: the worker injects a content script into a few frames, reads questions about the user, and on click writes one field or one cover-letter file. Unscanned sites get no script and no reads. There is no static content_scripts entry. activeTab is not enough: Scan starts from the side panel (not the toolbar grant), Fill/Attach happen after that grant expires, and it does not cover ATS iframes. Not used to load remote JavaScript or run in the background on every page.
```

### Remote code

Select **No, I am not using remote code.** If a justification box still appears:

```
Irke does not execute remotely hosted code. All JavaScript and WebAssembly ship in the extension package. There is no eval, no new Function, and no script loaded from a URL. Calls to OpenAI or OpenRouter are HTTPS fetch of JSON chat/completions (and optional embeddings) with the user’s own API key; the responses are treated as text drafts, never as code to run. Google Drive and GitHub are HTTPS JSON APIs used only to read files the user selected for the local index.
```

### Certify your data use practices

Check **Yes** that the item handles user data (it does, including data stored only on the device). Then:

**Data types collected** (check only these):

| Checkbox | Check? | What, for Irke |
|----------|--------|----------------|
| Personally identifiable information | Yes | Optional letterhead: name, email, phone, location, links — stored locally and used only to typeset a cover-letter PDF, never filled into a form. |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | Yes | User-pasted OpenAI/OpenRouter API key; optional GitHub OAuth token; Google Drive uses chrome.identity (token not persisted by Irke). |
| Personal communications | No | |
| Location | Yes | Optional letterhead location string for the PDF only. |
| Web history | No | No browsing-history API; no recording of sites visited. |
| User activity | Yes | On Scan: job title/company/description and question labels from the active tab. Used only to detect questions and draft answers. |
| Website content | Yes | Same scan: page text and form labels from selected frames of the active tab; Fill/Attach write back only on click. |

If the form also asks **user-generated content**: Yes — stories, uploads, Drive/GitHub text, drafts, and extra instructions the user adds to the local index.

**Certifications** (check all three if present):

- [x] I do not sell or transfer user data to third parties, except for the approved use cases below.
- [x] I do not use or transfer user data for purposes that are unrelated to my item’s single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

Approved third-party transfers (only if the user opts in by pasting a key or connecting an account): HTTPS to OpenAI or OpenRouter (prompts = question + job text + retrieved excerpts); HTTPS to Google Drive (read-only folder the user picked); HTTPS to GitHub (READMEs of repos the user picked). The Irke developer receives none of this.

**Encryption in transit:** Yes — those APIs are HTTPS only.

**Deletion:** Uninstall the extension, or disconnect Drive/GitHub in the dashboard. There is no Irke account to delete on a server.

**Privacy policy URL:** `https://github.com/derek750/Irke/blob/main/PRIVACY.md`

### Generative AI (if the console asks)

```
Irke calls a model the user configures (OpenAI or OpenRouter) with the user’s own API key. Prompts include the scanned question, job text, and retrieved excerpts from the user’s local index. Outputs are drafts the user must review before Fill or Attach PDF. Irke does not submit applications. Irke does not train a model; the developer never receives user prompts or documents. Provider privacy policies apply to those APIs.
```

---

## OAuth (Drive and GitHub)

The published item ID is assigned **after the first upload**. Unpacked IDs will not work in the store build.

1. Upload `store/irke.zip` (Drive can be omitted on this first zip if `VITE_GOOGLE_CLIENT_ID` is empty).
2. Copy **Item ID** from the developer console.
3. Google Cloud: OAuth client type **Chrome Extension**, item ID as the extension ID. Enable Drive API. Put the client ID in `.env` as `VITE_GOOGLE_CLIENT_ID`.
4. GitHub OAuth App: callback `https://<item-id>.chromiumapp.org/`
5. `npm run pack` again and upload a new version.

The GitHub client secret is compiled into the extension (GitHub still requires it on token exchange). Treat that OAuth app as public: restrict it to the callback above, no extra scopes beyond `read:user` and `repo`.

---

## Reviewer notes

Paste if the console asks for additional comments, or keep for the review reply.

```
Single purpose: drafting answers to questions about the applicant from their own material. Irke does not autofill identity, salary, or logistics fields.

No remote hosted code. No eval. LLM calls are fetch to the user’s chosen API (OpenAI or OpenRouter) with a key the user pastes in Settings.

Content scripts are not persistent. They are injected with chrome.scripting into the active tab at scan time only. Host permission <all_urls> is required because applications live on many ATS and career domains, including iframes.

Never auto-submits. Fill and Attach PDF are explicit clicks. CAPTCHA, password, OTP, SSN, and payment fields are denylisted.

Privacy policy: https://github.com/derek750/Irke/blob/main/PRIVACY.md
Source: https://github.com/derek750/Irke
```

---

## Checklist

1. [ ] `PRIVACY.md` is on `main` (privacy policy URL works).
2. [ ] Developer account is paid ($5 one-time) and 2SV is on.
3. [ ] `npm run pack` → `store/irke.zip` (no `.map` files, no `.env`).
4. [ ] Load the zip unpacked once more and smoke-scan a Greenhouse (or similar) page.
5. [ ] Screenshots uploaded (`store/screenshots/`, 1280×800); captions pasted.
6. [ ] Name, summary, detailed description, privacy practices, and permission justifications pasted.
7. [ ] Generative AI and remote-code answers filled as above.
8. [ ] After first publish: bind OAuth clients to the **item ID**, rebuild, upload 1.0.1 if Drive/GitHub should work for store users.
