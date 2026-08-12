# `src/content/`

Content scripts injected into every frame (`all_frames: true`, `document_idle`). Pure DOM work: scrape the job, detect the story questions, write drafts into controlled inputs.

## Files

| File | Responsibility |
|------|----------------|
| `index.ts` | Message listener for `content:scan` / `content:fill` / `content:highlight` |
| `adapters.ts` | ATS-specific selectors (Greenhouse, Lever, Ashby, Workable, SmartRecruiters) + generic fallback |
| `scrape.ts` | Job title, company, description text from the adapter |
| `detect.ts` | Eligible controls → `DetectedQuestion[]`; story classification; blocked-field denylist |
| `fill.ts` | Write values through native setters (React-safe), highlight flash |

## Scan payload

`content:scan` returns a **frame-local** scan (`job` + `questions` + `scannedAt`). The service worker adds `frameId`. Do not invent a frame id here — the content script cannot know it.

## Detection rules

Irke detects **story questions only**: cover letters, "tell us about a time", "why this company". Everything else on an application form — name, email, salary, work authorization, demographics — is deliberately ignored, because Irke has no profile to answer them from and guessing is the failure mode this design exists to avoid.

Eligible controls: visible `textarea`, visible `input[type=text]`, and `input[type=file]` **labelled as a cover letter**. Skip disabled / readonly / aria-hidden. Selects, radios, and checkboxes are never detected — a story does not fit in one.

A cover-letter upload is detected because Irke can typeset that document itself; resume, transcript, and portfolio uploads are somebody else's file and stay invisible. Uploads carry `control: 'file'` on `DetectedQuestion`, which means draft it, export it, never write to it — `fillField` throws if asked. ATS upload widgets hide the real input behind a styled button, so visibility is judged on the nearest visible ancestor (up to four levels) rather than the input.

Classification lives in `classifyLabel` and `classify`:

1. `SPECIFICS_PATTERN` matches → reject outright
2. `TOPIC_PATTERNS` matches → that `StoryTopic` (ordered: `why_role` before `why_company`, since "why do you want to work in this role" is about the job)
3. A `textarea` with no topic match still counts as `open_ended` — the control type is signal enough
4. A bare text input needs an explicit topic match; `open_ended` is too loose there
5. A `textarea` with `maxLength` under 120 is a one-liner, not a story
6. A file input needs `cover_letter` exactly; any other topic, or none, is rejected

**Hard denylist** (never detect, never fill) — `BLOCKED_PATTERN`:

- captcha / recaptcha / hcaptcha / turnstile / honeypot
- password / otp / verification
- credit card / SSN

Labels resolve via `aria-label` → `aria-labelledby` → `<label for>` → wrapping `<label>` → `<legend>` → nearby text → placeholder.

Each control gets a stable-for-this-page `data-irke-field` id used by fill/highlight.

### Smoke test

```bash
npm run smoke:detect
```

`scripts/smoke-detect.ts` runs `classifyLabel` over real Greenhouse / Lever / Workday / Ashby labels and asserts the expected topic or `null`. Add cases here whenever you touch the patterns — over-filtering silently makes the extension detect nothing.

## Fill rules

- Write via the native `value` setter, then dispatch `input` + `change` (required for React / Vue controlled inputs).
- Always scroll into view and flash outline; never click Submit.
- File inputs are never written to; the side panel hides **Fill field** for them and the user attaches the downloaded PDF.

## ATS adapters

Add a new adapter in `ADAPTERS` when a site has stable selectors for description / company / title / form. Matching is hostname-based. Unknown hosts use `GENERIC_ADAPTER` (still detects fields; JD quality may be weaker).

## Invariants

- Never auto-submit.
- Never touch denylisted fields.
- Keep this layer free of LLM / IndexedDB / chrome.storage calls — those belong in background / options.
- Prefer small, testable helpers (`classifyLabel`, `resolveLabel`, `isEligible`) over one giant scanner function.
