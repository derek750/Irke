import type { DetectedQuestion, JobContext, RetrievedChunk, StoryTopic } from './types'

export const NEEDS_INPUT_MARKER = '[NEED INPUT]'

const MAX_JD_CHARS = 4000
/** Enough of a rejected answer to recognize its angle without paying for the whole thing twice. */
const MAX_PREVIOUS_CHARS = 1500
/** Past this the oldest attempts cost more in tokens than they save in repetition. */
const MAX_PREVIOUS_ATTEMPTS = 4
/** A base draft is the whole point of a refine — carry it generously, but not unboundedly. */
const MAX_BASE_DRAFT_CHARS = 3000

const TOPIC_GUIDANCE: Record<StoryTopic, string> = {
  cover_letter:
    'Write a short cover letter. Open with why this role, spend the middle on one or two concrete things you have actually done, and close on what you want to work on next.',
  why_company:
    'Say what specifically about this company or its work pulls you in, and tie it to something you have already done or care about. No flattery that could be pasted into any other application.',
  why_role:
    'Connect what the role asks for to work you have actually done. Be concrete about the part of the job you want most.',
  behavioral:
    'Tell one real story from the excerpts: the situation, what you personally did, and how it turned out. One story, not a summary of several.',
  strengths:
    'Name the strength plainly, then earn it with a specific example from the excerpts rather than adjectives.',
  project:
    'Pick one project from the excerpts. Cover what it was, the part you owned, the interesting decision or obstacle, and where it ended up.',
  open_ended:
    'Answer directly and personally, grounded in a specific example from the excerpts rather than generalities.',
}

/**
 * Skill: how to read the retrieved excerpts. They are evidence about who the
 * candidate is (experiences and motivations), not text to copy.
 */
const CONTEXT_SKILL = [
  '## Skill: reading the context excerpts',
  'The excerpts are evidence about who the candidate is, not text to reuse. Never copy or lightly rephrase their sentences; retell everything in fresh words.',
  'Read across all the excerpts before writing. Beyond the surface facts, notice what they reveal: what the candidate chooses to work on, what problems pull them in, what they are proud of, how they make decisions. Let that shape the angle of the answer, not just its evidence.',
  'When the question asks about motivation, values, or fit, answer from the person the excerpts describe (their patterns and choices), supported by one concrete experience, rather than listing accomplishments.',
  'Facts (names, employers, dates, numbers, technologies) must come from the excerpts or the job description exactly as given. Interpreting motivation from the material is your job; inventing facts is forbidden.',
  'Each excerpt is raw material from a life, often written for another purpose. Take what answers this question and ignore the rest.',
  'Excerpts tagged [PRIOR DRAFT] are earlier application answers the candidate saved. Treat them as memory of which story and angle worked — rewrite in fresh words for this role and company. Never paste or lightly edit a prior draft into the new answer.',
  'Excerpts tagged [DISTILLED NOTES] are the candidate\'s own material condensed for search. Their facts are trustworthy, but when the original excerpt appears alongside, take detail and voice from the original rather than the notes.',
].join('\n')

/**
 * Skill: register rules that keep the draft from reading as machine-generated.
 * Sourced from the common statistical/stylistic tells AI detectors and human
 * readers key on.
 */
const WRITING_SKILL = [
  '## Skill: writing like the candidate, not like a model',
  'Vary sentence length on purpose: put short sentences next to long ones. Uniform medium-length sentences are the clearest machine tell.',
  'Plain words only. Never use: passionate, delve, leverage, utilize, foster, honed, spearheaded, showcase, testament, tapestry, landscape, journey, align, resonate, thrilled, excited to, eager to, robust, seamless, innovative, dynamic, cutting-edge, "I am confident that", "I believe my skills".',
  'No formal connectors (moreover, furthermore, additionally, consequently, ultimately). Connect ideas by echoing a word from the previous sentence, or just start the next thought.',
  'Never use the frame "not just X, but Y" or "not only ... but also". No rule-of-three lists ("fast, reliable, and scalable"). No em-dash asides.',
  'Concrete nouns and verbs over abstractions: say what was built, broken, decided, or shipped, never "impactful solutions" or "valuable experience".',
  'One real specific beats three vague claims. If a sentence could appear in anyone else\'s application, cut it or make it particular.',
  'Do not open with "I am writing to express". Close on a concrete point, not a summary of what was already said.',
  'Contractions are fine. An occasional sentence fragment is fine when it adds emphasis.',
].join('\n')

export function buildSystemPrompt(extraInstructions: string): string {
  const base = [
    'You are drafting the open-ended, story-style questions on a job application, on behalf of a candidate.',
    'Write in first person, as the candidate, in their own voice and at their own level of plainness.',
    'Ground every factual claim in the provided context excerpts or the job description. The excerpts are the candidate own material: stories they wrote, their documents, their Google Drive files, and their GitHub projects.',
    `Never invent employers, job titles, dates, degrees, certifications, metrics, or anecdotes. If the story needs a fact you were not given, write ${NEEDS_INPUT_MARKER} where it belongs.`,
    'Prefer one concrete example over several vague ones. No corporate filler, no "I am passionate about" openers.',
    'Return only the answer text. No preamble, no quotes, no field label, no markdown headings.',
    '',
    CONTEXT_SKILL,
    '',
    WRITING_SKILL,
  ].join('\n')

  const trimmed = extraInstructions.trim()
  return trimmed ? `${base}\n\nAdditional instructions from the candidate:\n${trimmed}` : base
}

export function buildReviseSystemPrompt(extraInstructions: string): string {
  const base = [
    "You are the candidate's editor. You receive a first-person draft answer to a job-application question, plus the source excerpts it was drafted from. Rewrite the draft so it reads like the candidate typed it, and keep it honest. You may not add facts.",
    '',
    'Audit the draft against this checklist and fix everything that fails:',
    '1. AI tells: uniform sentence cadence; the words passionate, delve, leverage, utilize, foster, honed, spearheaded, showcase, testament, journey, align, resonate, thrilled, robust, seamless, innovative, dynamic; connectors like moreover, furthermore, additionally, ultimately; "not just X, but Y" or "not only ... but also" frames; rule-of-three lists; em-dash asides; a generic opener or a closing sentence that summarizes the answer.',
    '2. Copied phrasing: sentences lifted or lightly rephrased from the excerpts (including [PRIOR DRAFT] excerpts). Retell them in fresh words; the excerpts are evidence about the candidate, not text to reuse.',
    '3. Grounding: any employer, title, date, metric, technology, or anecdote that the excerpts and job facts do not support. Remove it or replace it with the literal marker ' +
      NEEDS_INPUT_MARKER +
      `. Keep every ${NEEDS_INPUT_MARKER} already in the draft. Never invent a fact to fill one in.`,
    '4. Genericness: sentences that could sit in anyone else\'s application. Make them particular to this candidate and this company, using only the material given, or cut them.',
    '5. Motivation: the answer should sound like a person with reasons, not a list of qualifications. If the excerpts show why the candidate does this kind of work, let that come through.',
    '6. Prior drafts: if [PRIOR DRAFT] excerpts appear, keep the underlying story when it fits, but the wording must be new for this application — not a copy of the saved answer.',
    '7. Constraints: respect the stated length limit.',
    '',
    'Vary sentence length as you rewrite; short sentences next to long ones. Contractions are fine. If the draft already passes the checklist, tighten it lightly instead of rewriting for its own sake.',
    'Return only the final answer text. No commentary, no preamble, no markdown, no quotes around the answer.',
  ].join('\n')

  const trimmed = extraInstructions.trim()
  return trimmed ? `${base}\n\nAdditional instructions from the candidate:\n${trimmed}` : base
}

export function buildReviseUserPrompt(input: {
  job: JobContext
  question: DetectedQuestion
  retrieved: RetrievedChunk[]
  draft: string
  /** Answers the candidate has already rejected, oldest first, when this call is a regenerate. */
  previous?: string[]
  /** The candidate's direction for this one answer; the rewrite must keep honoring it. */
  steer?: string
  /** The candidate's own written or edited draft that the draft under edit grew from. */
  baseDraft?: string
}): string {
  const { job, question, retrieved, draft, previous, steer, baseDraft } = input
  const sections: string[] = []

  sections.push(
    ['## Role', `Title: ${job.title || 'unknown'}`, `Company: ${job.company || 'unknown'}`].join('\n'),
  )

  if (job.descriptionText.trim()) {
    sections.push(`## Job description (for grounding checks)\n${job.descriptionText.slice(0, MAX_JD_CHARS)}`)
  }

  sections.push(excerptsSection(retrieved, `Every factual claim in the draft that is not from the job description must become ${NEEDS_INPUT_MARKER}.`))

  sections.push(`## Question being answered\n${question.label}`)
  if (steer) {
    sections.push(
      [
        "## The candidate's direction for this answer",
        steer,
        '',
        `The rewrite must keep following this direction — do not edit away the material or the register it asked for. If it asked for facts the excerpts do not support, the draft should carry ${NEEDS_INPUT_MARKER} there, not an invention.`,
      ].join('\n'),
    )
  }
  if (baseDraft) {
    sections.push(
      [
        "## The candidate's own draft this grew from",
        baseDraft.slice(0, MAX_BASE_DRAFT_CHARS),
        '',
        'The candidate wrote this themselves and the draft below builds on it. Preserve their story choice, their facts, and their phrasing wherever the draft kept them — the candidate\'s own words are not AI tells to edit away.',
      ].join('\n'),
    )
  }
  sections.push(`## Constraints\n${describeConstraints(question)}`)
  sections.push(`## Draft to edit\n${draft}`)

  // Without this the editor pass quietly normalizes every retry back onto one answer.
  const rejected = rejectedSection(
    previous,
    'Do not edit the draft back toward any attempt above. Any sentence that closely matches one needs rewriting.',
  )
  if (rejected) sections.push(rejected)

  return sections.join('\n\n')
}

export function buildUserPrompt(input: {
  job: JobContext
  question: DetectedQuestion
  retrieved: RetrievedChunk[]
  /** Answers the candidate has already rejected, oldest first, when this call is a regenerate. */
  previous?: string[]
  /** The candidate's direction for this one answer; outranks the topic guidance. */
  steer?: string
  /** The candidate's own written or edited draft — the base a refine builds on, never avoids. */
  baseDraft?: string
}): string {
  const { job, question, retrieved, previous, steer, baseDraft } = input
  const sections: string[] = []

  sections.push(
    ['## Role', `Title: ${job.title || 'unknown'}`, `Company: ${job.company || 'unknown'}`].join('\n'),
  )

  if (job.descriptionText.trim()) {
    sections.push(`## Job description\n${job.descriptionText.slice(0, MAX_JD_CHARS)}`)
  }

  sections.push(excerptsSection(retrieved, `Do not invent a story — sketch the shape of an answer and mark every missing fact with ${NEEDS_INPUT_MARKER}.`))

  sections.push(`## Question to answer\n${question.label}`)
  if (steer) {
    sections.push(
      [
        "## The candidate's direction for this answer",
        steer,
        '',
        `Follow this direction; where it conflicts with the general guidance below, the direction wins. Excerpts marked "pulled in for this direction" were retrieved because of it. If the direction asks for facts no excerpt provides, write ${NEEDS_INPUT_MARKER} rather than inventing them.`,
      ].join('\n'),
    )
  }
  if (baseDraft) {
    sections.push(
      [
        "## The candidate's current draft — build on this",
        baseDraft.slice(0, MAX_BASE_DRAFT_CHARS),
        '',
        `The candidate wrote or edited this themselves. It is the base to improve, not an attempt to avoid: keep its story choice, its facts, and the lines that already work; complete and polish it into a full answer. Apply the direction above (if any) to this draft. Anything new must still come from the excerpts or the job description — write ${NEEDS_INPUT_MARKER} for facts you were not given.`,
      ].join('\n'),
    )
  }
  sections.push(`## How to answer\n${TOPIC_GUIDANCE[question.topic]}`)
  sections.push(`## Constraints\n${describeConstraints(question)}`)

  // A steered retry must keep what the direction asked for — "lead with different material"
  // would countermand the very steer the candidate just typed.
  const rejected = rejectedSection(
    previous,
    steer
      ? "Write an answer unlike every attempt above while still following the candidate's direction: keep the material the direction asks for, but change the angle, the structure, and every sentence."
      : 'Write an answer unlike every attempt above. The facts stay the same, the angle does not: start somewhere else, lead with different material from the excerpts, and reuse none of that phrasing or structure.',
  )
  if (rejected) sections.push(rejected)

  return sections.join('\n\n')
}

/**
 * Numbered excerpts for either pass. Excerpts the steer pulled in are labeled so the model can
 * connect the candidate's direction to the material retrieved for it — and so it does not treat
 * an excerpt that merely collided with a common steer word as an instruction.
 */
function excerptsSection(retrieved: RetrievedChunk[], emptyText: string): string {
  if (!retrieved.length) return `## Context excerpts\n${emptyText}`

  const excerpts = retrieved.map((entry, index) => {
    const marker = entry.steered ? ' (pulled in for this direction)' : ''
    return `### Excerpt ${index + 1}${marker}\n${entry.chunk.text}`
  })
  return `## Context excerpts (the candidate's own material)\n${excerpts.join('\n\n')}`
}

/**
 * Lists the answers already thrown away. Naming only the most recent one lets the model circle
 * back to the attempt before it, which reads as "the same answer again" to the person clicking.
 */
function rejectedSection(previous: string[] | undefined, closing: string): string | null {
  const attempts = (previous ?? [])
    .map((attempt) => attempt.trim())
    .filter(Boolean)
    .slice(-MAX_PREVIOUS_ATTEMPTS)
  if (!attempts.length) return null

  const heading =
    attempts.length === 1
      ? '## Answer the candidate rejected'
      : `## ${attempts.length} answers the candidate rejected`
  const body = attempts
    .map((attempt, index) => `### Rejected ${index + 1}\n${attempt.slice(0, MAX_PREVIOUS_CHARS)}`)
    .join('\n\n')

  return [heading, body, '', closing].join('\n')
}

function describeConstraints(question: DetectedQuestion): string {
  const constraints: string[] = []

  constraints.push(
    question.maxLength
      ? `Stay under ${question.maxLength} characters.`
      : question.topic === 'cover_letter'
        ? 'Aim for 200-300 words.'
        : 'Aim for 100-180 words.',
  )
  constraints.push('Use short paragraphs. No bullet lists unless the question asks for a list.')

  return constraints.join('\n')
}
