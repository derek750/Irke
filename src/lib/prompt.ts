import type { DetectedQuestion, JobContext, RetrievedChunk, StoryTopic } from './types'

export const NEEDS_INPUT_MARKER = '[NEED INPUT]'

const MAX_JD_CHARS = 4000

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

export function buildSystemPrompt(extraInstructions: string): string {
  const base = [
    'You are drafting the open-ended, story-style questions on a job application, on behalf of a candidate.',
    'Write in first person, as the candidate, in their own voice and at their own level of plainness.',
    'Ground every factual claim in the provided context excerpts or the job description. The excerpts are the candidate own material: stories they wrote, their documents, their Google Drive files, and their GitHub projects.',
    `Never invent employers, job titles, dates, degrees, certifications, metrics, or anecdotes. If the story needs a fact you were not given, write ${NEEDS_INPUT_MARKER} where it belongs.`,
    'Prefer one concrete example over several vague ones. No corporate filler, no "I am passionate about" openers.',
    'Return only the answer text. No preamble, no quotes, no field label, no markdown headings.',
  ].join('\n')

  const trimmed = extraInstructions.trim()
  return trimmed ? `${base}\n\nAdditional instructions from the candidate:\n${trimmed}` : base
}

export function buildUserPrompt(input: {
  job: JobContext
  question: DetectedQuestion
  retrieved: RetrievedChunk[]
}): string {
  const { job, question, retrieved } = input
  const sections: string[] = []

  sections.push(
    ['## Role', `Title: ${job.title || 'unknown'}`, `Company: ${job.company || 'unknown'}`].join('\n'),
  )

  if (job.descriptionText.trim()) {
    sections.push(`## Job description\n${job.descriptionText.slice(0, MAX_JD_CHARS)}`)
  }

  if (retrieved.length) {
    const excerpts = retrieved.map((entry, index) => `### Excerpt ${index + 1}\n${entry.chunk.text}`)
    sections.push(`## Context excerpts (the candidate own material)\n${excerpts.join('\n\n')}`)
  } else {
    sections.push(
      `## Context excerpts\nNothing matched this question. Do not invent a story — sketch the shape of an answer and mark every missing fact with ${NEEDS_INPUT_MARKER}.`,
    )
  }

  sections.push(`## Question to answer\n${question.label}`)
  sections.push(`## How to answer\n${TOPIC_GUIDANCE[question.topic]}`)
  sections.push(`## Constraints\n${describeConstraints(question)}`)

  return sections.join('\n\n')
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
