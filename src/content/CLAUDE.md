# `src/content/`

Content scripts injected into every frame (`all_frames: true`, `document_idle`). Pure DOM work: scrape the job, detect fillable questions, write values into controlled inputs.

## Files

| File | Responsibility |
|------|----------------|
| `index.ts` | Message listener for `content:scan` / `content:fill` / `content:highlight` |
| `adapters.ts` | ATS-specific selectors (Greenhouse, Lever, Ashby, Workable, SmartRecruiters) + generic fallback |
| `scrape.ts` | Job title, company, description text from the adapter |
| `detect.ts` | Eligible form controls → `DetectedQuestion[]`; profile-field regex matching; blocked-field denylist |
| `fill.ts` | Write values through native setters (React-safe), select/radio/checkbox handling, highlight flash |

## Scan payload

`content:scan` returns a **frame-local** scan (`job` + `questions` + `scannedAt`). The service worker adds `frameId`. Do not invent a frame id here — the content script cannot know it.

## Detection rules

Eligible controls: visible `input` (text-like, radio, checkbox), `textarea`, `select`. Skip disabled / readonly / aria-hidden.

**Hard denylist** (never detect, never fill) — pattern in `detect.ts` `BLOCKED_PATTERN`:

- captcha / recaptcha / hcaptcha / turnstile / honeypot
- password / otp / verification
- credit card / SSN

Labels resolve via `aria-label` → `aria-labelledby` → `<label for>` → wrapping `<label>` → `<legend>` → nearby text → placeholder.

`profileKey` is set when the label matches `PROFILE_PATTERNS` so the background can fill without an LLM call.

Each control gets a stable-for-this-page `data-irke-field` id used by fill/highlight.

## Fill rules

- Text fields: write via the native `value` setter, then dispatch `input` + `change` (required for React / Vue controlled inputs).
- Select / radio: match option label or value (normalized), never invent an option.
- Checkbox: treat yes/true/on/agree-style strings as checked.
- Always scroll into view and flash outline; never click Submit.

## ATS adapters

Add a new adapter in `ADAPTERS` when a site has stable selectors for description / company / title / form. Matching is hostname-based. Unknown hosts use `GENERIC_ADAPTER` (still detects fields; JD quality may be weaker).

## Invariants

- Never auto-submit.
- Never touch denylisted fields.
- Keep this layer free of LLM / IndexedDB / chrome.storage calls — those belong in background / options.
- Prefer small, testable helpers (`resolveLabel`, `isEligible`) over one giant scanner function.
