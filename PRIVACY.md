# Privacy policy

**Irke** is a Chrome extension that drafts answers to job-application questions about you, using material you supply. There is no Irke server. This policy describes what stays on your machine, what leaves it, and why.

Last updated: 19 September 2026.

## Who we are

Irke is published as an open-source Chrome extension ([github.com/derek750/Irke](https://github.com/derek750/Irke)). The developer does not operate a backend, analytics pipeline, or account system for Irke.

## What Irke stores on your computer

All of this lives in your browser profile (`chrome.storage.local` and IndexedDB). It is not uploaded to an Irke service.

| Data | Where | Purpose |
|------|--------|---------|
| AI provider, model, API key | `chrome.storage.local` | Call OpenAI or OpenRouter with *your* key |
| Extra instructions, generation settings | `chrome.storage.local` | How drafts are written |
| Letterhead (name, email, phone, location, links) | `chrome.storage.local` | Typeset a cover-letter PDF only — never typed into a form field by Irke |
| Google Drive folder choice | `chrome.storage.local` | Which folder to index |
| GitHub OAuth token and selected repos | `chrome.storage.local` | Index README prose you choose |
| Context documents, search index, answer bank | IndexedDB | Ground drafts in your own material |

You can remove this data by removing the extension, or by clearing site data for the extension in Chrome.

## What Irke reads from the current tab

When you click **Rescan** (or the panel scans on open), Irke injects a content script into the **active tab** (and a small set of its frames) to read the job description and questions about you. It does not run on every page in the background. It does not read passwords, CAPTCHA, payment, OTP, or SSN fields, and it does not submit forms.

## What leaves your computer

Irke has no backend. Network requests are only:

1. **OpenAI or OpenRouter** — if you paste an API key in Settings. Prompts include the question, job text, and retrieved excerpts from *your* index. The key is sent only to the provider you selected.
2. **Google Drive** — if you connect Drive. Chrome's OAuth token is used to read the folder you pick (read-only). Irke does not persist the Google token.
3. **GitHub** — if you connect GitHub. Used to list repos you select and fetch descriptions and READMEs.

Irke does not sell data, show ads, or use your material for our own model training (we do not receive it).

Provider privacy policies apply to those third-party APIs: [OpenAI](https://openai.com/policies/privacy-policy), [OpenRouter](https://openrouter.ai/privacy), [Google](https://policies.google.com/privacy), [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Children

Irke is not directed at children under 13.

## Changes

Updates to this policy will be posted in this file. Continued use after an update means you accept the revised policy.

## Contact

Open an issue on [github.com/derek750/Irke](https://github.com/derek750/Irke/issues).
