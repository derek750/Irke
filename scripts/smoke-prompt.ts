/**
 * Asserts the prompt contract in `src/lib/prompt.ts`: section order, the grounding fallback,
 * the rejected-answers block, and how a per-answer steer travels (a direction section beside
 * the question in both passes, steered excerpts labeled, system prompt untouched).
 *
 * Run: npm run smoke:prompt
 */
import { buildDistillSystemPrompt, buildDistillUserPrompt } from '../src/lib/context/distill.ts'
import {
  NEEDS_INPUT_MARKER,
  buildReviseSystemPrompt,
  buildReviseUserPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from '../src/lib/prompt.ts'
import type { ContextDoc, DetectedQuestion, JobContext, RetrievedChunk } from '../src/lib/types.ts'

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
  descriptionText: 'Build payment services in Go. Care for correctness in production.',
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

const chunk = (id: string, text: string, steered?: boolean): RetrievedChunk => ({
  chunk: {
    id,
    docId: id,
    docTitle: id,
    source: 'story',
    text,
    tokens: {},
  },
  score: 1,
  ...(steered ? { steered } : {}),
})

const retrieved = [
  chunk('cubesat', '[MY STORY] CubeSat power budget\nI rebuilt the power budget.', true),
  chunk('letter', '[GOOGLE DRIVE] Cover letter\nDear team, I like building software.'),
]

const steer = 'focus on the CubeSat work'

// --- Draft pass -------------------------------------------------------------

const draftPrompt = buildUserPrompt({ job, question, retrieved, steer })

ok(
  draftPrompt.includes("## The candidate's direction for this answer\nfocus on the CubeSat work"),
  'draft prompt carries the direction section with the steer text',
)
ok(
  draftPrompt.indexOf('## Question to answer') < draftPrompt.indexOf("## The candidate's direction"),
  'direction follows the question it applies to',
)
ok(
  draftPrompt.indexOf("## The candidate's direction") < draftPrompt.indexOf('## How to answer'),
  'direction outranks (precedes) the topic guidance',
)
ok(
  draftPrompt.includes('### Excerpt 1 (pulled in for this direction)'),
  'the steered excerpt is labeled',
)
ok(
  draftPrompt.includes('### Excerpt 2\n') && !draftPrompt.includes('### Excerpt 2 (pulled'),
  'unsteered excerpts carry no label',
)

const plainPrompt = buildUserPrompt({ job, question, retrieved: [retrieved[1]] })
ok(!plainPrompt.includes("candidate's direction"), 'no steer, no direction section')
ok(!plainPrompt.includes('pulled in for this direction'), 'no steer, no excerpt labels')

const emptyPrompt = buildUserPrompt({ job, question, retrieved: [] })
ok(
  emptyPrompt.includes('## Context excerpts\n') && emptyPrompt.includes(NEEDS_INPUT_MARKER),
  'no excerpts → the do-not-invent fallback with the marker',
)

console.log(`ok  draft user prompt (direction placement, excerpt labels, fallback)`)

// --- Revise pass ------------------------------------------------------------

const revisePrompt = buildReviseUserPrompt({
  job,
  question,
  retrieved,
  draft: 'A draft answer.',
  steer,
  previous: ['First rejected attempt.'],
})

ok(
  revisePrompt.includes("## The candidate's direction for this answer\nfocus on the CubeSat work"),
  'revise prompt carries the direction section',
)
ok(
  revisePrompt.includes('must keep following this direction'),
  'revise pass is told not to edit the direction away',
)
ok(revisePrompt.includes('## Draft to edit\nA draft answer.'), 'revise prompt contains the draft')
ok(
  revisePrompt.includes('## Answer the candidate rejected'),
  'revise prompt lists the rejected answer',
)
ok(
  revisePrompt.includes('### Excerpt 1 (pulled in for this direction)'),
  'revise pass sees the same excerpt labels',
)

console.log('ok  revise user prompt (direction survives the editor, rejected answers listed)')

// --- Rejected answers block --------------------------------------------------

const manyRejected = buildUserPrompt({
  job,
  question,
  retrieved,
  previous: ['one', 'two', 'three', 'four', 'five'],
})
ok(
  manyRejected.includes('## 4 answers the candidate rejected'),
  'rejected list caps at the 4 most recent attempts',
)
ok(!manyRejected.includes('### Rejected 5'), 'older attempts beyond the cap are dropped')
ok(manyRejected.includes('two') && !manyRejected.match(/### Rejected 1\none/), 'oldest attempt is the one dropped')
ok(
  manyRejected.includes('lead with different material'),
  'an unsteered retry is told to reach for different material',
)

// A steered retry is the most common steered call: the user disliked an answer, typed a steer,
// and clicked Regenerate. "Lead with different material" would countermand the steer.
const steeredRetry = buildUserPrompt({ job, question, retrieved, steer, previous: ['one'] })
ok(
  steeredRetry.includes("while still following the candidate's direction"),
  'a steered retry keeps the steered material and varies everything else',
)
ok(
  !steeredRetry.includes('lead with different material'),
  'a steered retry is not told to abandon the steered material',
)

console.log('ok  rejected-answers block (cap, recency, steer-aware retry)')

// --- Base draft (refine) --------------------------------------------------------

const refinePrompt = buildUserPrompt({
  job,
  question,
  retrieved,
  steer,
  baseDraft: 'My own words about the CubeSat.',
})
ok(
  refinePrompt.includes("## The candidate's current draft — build on this\nMy own words about the CubeSat."),
  'the base draft rides in the draft pass as material to build on',
)
ok(
  refinePrompt.includes('base to improve, not an attempt to avoid'),
  'the base draft instruction inverts the rejected-answer framing',
)
ok(
  refinePrompt.indexOf("candidate's direction") < refinePrompt.indexOf("candidate's current draft") &&
    refinePrompt.indexOf("candidate's current draft") < refinePrompt.indexOf('## How to answer'),
  'direction, then draft, then general guidance',
)
ok(
  !buildUserPrompt({ job, question, retrieved }).includes('current draft'),
  'no base draft, no section',
)

const refineRevise = buildReviseUserPrompt({
  job,
  question,
  retrieved,
  draft: 'The improved answer.',
  baseDraft: 'My own words.',
})
ok(
  refineRevise.includes("## The candidate's own draft this grew from\nMy own words.") &&
    refineRevise.includes('## Draft to edit\nThe improved answer.'),
  'the revise pass separates the candidate\'s base from the draft under edit',
)
ok(
  refineRevise.includes('not AI tells to edit away'),
  'the editor is told the candidate\'s own words are protected',
)

console.log('ok  base draft (refine builds on the candidate\'s text in both passes)')

// --- System prompts ----------------------------------------------------------

const system = buildSystemPrompt('Always sign off as Derek.')
ok(
  system.includes('Additional instructions from the candidate:\nAlways sign off as Derek.'),
  'standing instructions land in the draft system prompt',
)
ok(!buildSystemPrompt('').includes('Additional instructions'), 'no instructions, no block')
ok(
  !system.includes('direction for this answer'),
  'the steer never rides in the system prompt (it is moment-specific)',
)

const reviseSystem = buildReviseSystemPrompt('Always sign off as Derek.')
ok(
  reviseSystem.includes('Additional instructions from the candidate:'),
  'standing instructions land in the revise system prompt',
)
ok(
  buildSystemPrompt('').includes('[DISTILLED NOTES]'),
  'the context skill teaches the model what distilled notes are',
)

console.log('ok  system prompts (standing instructions only)')

// --- Distillation prompt -------------------------------------------------------

const distillSystem = buildDistillSystemPrompt()
ok(distillSystem.includes('Never add, infer, or embellish'), 'distillation forbids invention')
ok(distillSystem.includes('return exactly SKIP'), 'empty documents have an explicit out')
ok(
  distillSystem.includes('conflict') && distillSystem.includes('missed deadline') && distillSystem.includes('mentoring'),
  'story types use the vocabulary questions are phrased in',
)
ok(distillSystem.includes('## Story:') && distillSystem.includes('## Key facts'), 'output format is pinned down')

const sourceDoc: ContextDoc = {
  id: 'doc-1',
  source: 'story',
  title: 'The migration that slipped',
  createdAt: 1,
  text: 'We planned two months and it took five.',
}
const distillUser = buildDistillUserPrompt(sourceDoc)
ok(
  distillUser.includes('# The migration that slipped') && distillUser.includes('We planned two months'),
  'distillation user prompt carries title and text',
)

console.log('ok  distillation prompt (no invention, SKIP contract, typed cards)')

// --- Constraints ---------------------------------------------------------------

const capped = buildUserPrompt({
  job,
  question: { ...question, maxLength: 500 },
  retrieved,
})
ok(capped.includes('Stay under 500 characters.'), 'maxLength becomes a stated constraint')

const letter = buildUserPrompt({
  job,
  question: { ...question, topic: 'cover_letter' },
  retrieved,
})
ok(letter.includes('Aim for 200-300 words.'), 'cover letters get the length default')

console.log('ok  constraints (character caps and defaults)')

console.log(`\n${checks} prompt assertions passed`)
