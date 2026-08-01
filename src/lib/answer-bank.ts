import { findAnswer, putAnswer } from './db'
import type { AnswerBankEntry } from './types'

/**
 * Collapses cosmetic differences (casing, punctuation, "(required)" markers, whitespace)
 * so the same question phrased identically by two ATS templates hits one entry.
 */
export function fingerprintQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/\(\s*(required|optional)\s*\)/g, ' ')
    .replace(/[*✱]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function lookupAnswer(question: string): Promise<AnswerBankEntry | null> {
  const fingerprint = fingerprintQuestion(question)
  if (!fingerprint) return null
  return findAnswer(fingerprint)
}

export async function rememberAnswer(input: {
  question: string
  answer: string
  company: string
}): Promise<void> {
  const fingerprint = fingerprintQuestion(input.question)
  if (!fingerprint || !input.answer.trim()) return

  const existing = await findAnswer(fingerprint)
  await putAnswer({
    id: existing?.id ?? crypto.randomUUID(),
    fingerprint,
    question: input.question,
    answer: input.answer,
    company: input.company,
    updatedAt: Date.now(),
    useCount: (existing?.useCount ?? 0) + 1,
  })
}
