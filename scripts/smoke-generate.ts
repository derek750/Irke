/**
 * Runs the real `generateAnswer` pipeline under Node with `scripts/stubs/` aliased in for the
 * db, llm, settings, and answer-bank modules (see the aliases in the npm script). Asserts the
 * wiring the unit smokes cannot see: the steer flows end to end (retrieval pins → labeled
 * excerpts → a direction section in both passes → `steeredSources` on the result), standing
 * instructions stay in the system prompt, and a retry drafts hotter with the rejected answers
 * listed while the pinned excerpt survives rotation.
 *
 * Run: npm run smoke:generate
 */
import { generateAnswer } from '../src/background/generate.ts'
import type { DetectedQuestion, JobContext } from '../src/lib/types.ts'
import { enableFakeVectors } from './stubs/db.ts'
import { calls } from './stubs/llm.ts'

let checks = 0
function ok(condition: boolean, message: string): void {
  checks += 1
  if (condition) return
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

const job: JobContext = {
  url: 'https://example.com/apply',
  title: 'Software Engineer Intern',
  company: 'Northwind',
  descriptionText: 'Build payment services in Go and Postgres. Improve reconciliation tooling.',
  ats: 'greenhouse',
}

const question: DetectedQuestion = {
  fieldId: 'q1',
  label: 'Why do you want to work at Northwind?',
  required: true,
  maxLength: null,
  currentValue: '',
  topic: 'why_company',
  control: 'text',
}

// --- Steered first generate --------------------------------------------------

const steered = await generateAnswer({
  job,
  question,
  regenerate: false,
  steer: 'focus on the CubeSat power budget work',
})

ok(calls.length === 2, `polished mode makes two LLM calls, made ${calls.length}`)
const [draftCall, reviseCall] = calls

ok(
  draftCall.user.includes("## The candidate's direction for this answer\nfocus on the CubeSat power budget work"),
  'draft pass carries the direction section',
)
ok(
  reviseCall.user.includes("## The candidate's direction for this answer"),
  'revise pass carries the direction section',
)
ok(
  draftCall.user.includes('### Excerpt 1 (pulled in for this direction)'),
  'the first excerpt is a labeled steer pin',
)
ok(
  draftCall.user.includes('[MY STORY] CubeSat power budget') &&
    draftCall.user.includes('[DISTILLED NOTES] Notes — CubeSat power budget'),
  'the steer pulls the CubeSat story and its distilled notes together',
)
ok(
  !draftCall.system.includes('CubeSat'),
  'the steer stays out of the system prompt',
)
ok(
  draftCall.system.includes('Additional instructions from the candidate:\nAlways write plainly.'),
  'standing instructions still reach the system prompt',
)
ok(
  (steered.steeredSources ?? []).includes('CubeSat power budget'),
  `steeredSources names the pinned document, got ${JSON.stringify(steered.steeredSources)}`,
)
ok(
  steered.degradedRetrieval === undefined,
  'an index without vectors is normal keyword mode, not a degradation',
)
ok(
  steered.sources.includes('Resume.pdf'),
  `the question keeps its own best material alongside the steer, got ${JSON.stringify(steered.sources)}`,
)
ok(draftCall.temperature === 0.4, 'first generate samples at the configured temperature')

console.log('ok  steered generate (pins → prompt → steeredSources)')

// --- Unsteered generate ------------------------------------------------------

calls.length = 0
const plain = await generateAnswer({ job, question, regenerate: false })
ok(
  !calls[0].user.includes("candidate's direction"),
  'no steer, no direction section',
)
ok(plain.steeredSources === undefined, 'no steer, no steeredSources on the result')

console.log('ok  unsteered generate unchanged')

// --- Steered regenerate ------------------------------------------------------

calls.length = 0
const retry = await generateAnswer({
  job,
  question,
  regenerate: true,
  steer: 'focus on the CubeSat power budget work',
  previousAnswers: ['The answer the user rejected.'],
})

ok(
  Math.abs(calls[0].temperature - 0.75) < 1e-9,
  `retry drafts hotter (0.4 + 0.35), got ${calls[0].temperature}`,
)
ok(
  calls[0].user.includes('## Answer the candidate rejected'),
  'retry lists the rejected answer',
)
ok(
  calls[0].user.includes("while still following the candidate's direction"),
  'steered retry keeps the direction while varying the rest',
)
ok(
  calls[0].user.includes('### Excerpt 1 (pulled in for this direction)'),
  'steered retry still pins the steered excerpt despite rotation',
)
ok(
  (retry.steeredSources ?? []).includes('CubeSat power budget'),
  'retry reports the steered source',
)

console.log('ok  steered regenerate (hotter, rejected list, pins survive rotation)')

// --- Refine (regenerate over a hand-edited draft) -----------------------------
// The user's own text is the base to build on: normal temperature, no rejected list even when
// the panel sends one, the draft in both prompts, and its vocabulary lifting matching material.

calls.length = 0
const refined = await generateAnswer({
  job,
  question,
  regenerate: true,
  currentDraft: 'I lead the CubeSat power budget work and rebuilt it from telemetry after a brownout.',
  previousAnswers: ['An old attempt that must be ignored on a refine.'],
})

ok(calls[0].temperature === 0.4, `a refine drafts at the normal temperature, got ${calls[0].temperature}`)
ok(
  calls[0].user.includes("## The candidate's current draft — build on this") &&
    calls[0].user.includes('rebuilt it from telemetry'),
  'the draft pass carries the base draft as material to build on',
)
ok(
  !calls[0].user.includes('rejected'),
  'a refine has no rejected-answers section, even when previousAnswers were sent',
)
ok(
  calls[1].user.includes("## The candidate's own draft this grew from"),
  'the revise pass knows which text is the candidate\'s own',
)
ok(
  refined.sources.includes('CubeSat power budget'),
  `the base draft's vocabulary lifts its material into retrieval, got ${JSON.stringify(refined.sources)}`,
)
ok(
  refined.sources.includes('Resume.pdf'),
  'the question keeps its own best material alongside the draft lift',
)

console.log('ok  refine (base draft in both prompts, no rejected list, normal temperature, retrieval lift)')

// --- Degraded retrieval ------------------------------------------------------
// The index has vectors but the embeddings endpoint fails (the embed stub always throws):
// the draft must still be produced from keyword retrieval, flagged as degraded.

enableFakeVectors()
calls.length = 0
const degraded = await generateAnswer({ job, question, regenerate: false })
ok(
  degraded.degradedRetrieval === true,
  'vectors present + failed query embed → the draft is flagged keyword-only',
)
ok(degraded.answer.length > 0, 'the failed embed does not block the draft')
ok(degraded.sources.length > 0, 'keyword retrieval still grounds the draft')

console.log('ok  degraded retrieval (embed failure flags the draft, BM25 carries it)')

console.log(`\n${checks} pipeline assertions passed`)
