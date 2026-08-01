import { PROFILE_FIELD_LABELS } from './settings'
import type { DetectedQuestion, JobContext, Profile, RetrievedChunk } from './types'

export const NEEDS_INPUT_MARKER = '[NEED INPUT]'

const MAX_JD_CHARS = 4000

export function buildSystemPrompt(extraInstructions: string): string {
  const base = [
    'You are drafting job application answers on behalf of a candidate.',
    'Write in first person, as the candidate, in their own voice.',
    'Ground every factual claim in the provided profile, brain excerpts, or job description.',
    `Never invent employers, job titles, dates, degrees, certifications, or metrics. If a required fact is missing, write ${NEEDS_INPUT_MARKER} where it belongs.`,
    'Match the tone of the candidate past answers when excerpts are available.',
    'Return only the answer text. No preamble, no quotes, no field label, no markdown headings.',
  ].join('\n')

  const trimmed = extraInstructions.trim()
  return trimmed ? `${base}\n\nAdditional instructions from the candidate:\n${trimmed}` : base
}

export function buildUserPrompt(input: {
  job: JobContext
  question: DetectedQuestion
  profile: Profile
  retrieved: RetrievedChunk[]
}): string {
  const { job, question, profile, retrieved } = input
  const sections: string[] = []

  sections.push(
    ['## Role', `Title: ${job.title || 'unknown'}`, `Company: ${job.company || 'unknown'}`].join('\n'),
  )

  if (job.descriptionText.trim()) {
    sections.push(`## Job description\n${job.descriptionText.slice(0, MAX_JD_CHARS)}`)
  }

  const profileLines = (Object.keys(PROFILE_FIELD_LABELS) as (keyof Profile)[])
    .filter((key) => profile[key].trim())
    .map((key) => `${PROFILE_FIELD_LABELS[key]}: ${profile[key]}`)
  if (profileLines.length) sections.push(`## Candidate profile\n${profileLines.join('\n')}`)

  if (retrieved.length) {
    const excerpts = retrieved.map((entry, index) => `### Excerpt ${index + 1}\n${entry.chunk.text}`)
    sections.push(`## Brain excerpts (the candidate own documents)\n${excerpts.join('\n\n')}`)
  } else {
    sections.push(
      '## Brain excerpts\nNone matched this question. Rely on the profile only and mark missing facts.',
    )
  }

  sections.push(`## Question to answer\n${question.label}`)
  sections.push(`## Constraints\n${describeConstraints(question)}`)

  return sections.join('\n\n')
}

function describeConstraints(question: DetectedQuestion): string {
  const constraints: string[] = []

  if (question.inputKind === 'textarea') {
    const budget = question.maxLength
      ? `Stay under ${question.maxLength} characters.`
      : 'Aim for 100-180 words.'
    constraints.push(budget)
    constraints.push('Use short paragraphs. No bullet lists unless the question asks for a list.')
  } else if (question.inputKind === 'text') {
    constraints.push('Answer in one short line. No sentences longer than needed.')
  }

  if (question.options.length) {
    constraints.push(`Choose exactly one of these options, copied verbatim: ${question.options.join(' | ')}`)
  }

  return constraints.join('\n') || 'Answer concisely.'
}
