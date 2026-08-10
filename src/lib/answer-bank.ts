import { deleteAnswer, deleteDocAndChunks, findAnswer, getDoc, listAnswers, putAnswer, saveDoc } from './db'
import type { AnswerBankEntry, ContextDoc } from './types'

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

/** Context-doc id for a saved answer — keeps answer bank and index in sync. */
export function generatedDocId(answerId: string): string {
  return `generated:${answerId}`
}

/**
 * Upsert the answer bank entry and mirror it into the context index as `source: 'generated'`.
 * Drafts are stored for optional RAG (Settings.includeGeneratedInRag); generation never
 * pastes them verbatim — the user must opt in and Rebuild index for embeddings.
 */
export async function rememberAnswer(input: {
  question: string
  answer: string
  company: string
}): Promise<void> {
  const fingerprint = fingerprintQuestion(input.question)
  if (!fingerprint || !input.answer.trim()) return

  const existing = await findAnswer(fingerprint)
  const entry: AnswerBankEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    fingerprint,
    question: input.question,
    answer: input.answer.trim(),
    company: input.company,
    updatedAt: Date.now(),
    useCount: (existing?.useCount ?? 0) + 1,
  }

  await putAnswer(entry)
  await syncGeneratedDoc(entry)
}

/** Update answer text (Answers tab) and keep the indexed prior-draft doc in sync. */
export async function updateSavedAnswer(entry: AnswerBankEntry): Promise<void> {
  const next: AnswerBankEntry = {
    ...entry,
    answer: entry.answer.trim(),
    updatedAt: Date.now(),
  }
  if (!next.answer) return

  await putAnswer(next)
  await syncGeneratedDoc(next)
}

/** Remove from the answer bank and drop the matching index doc/chunks. */
export async function forgetAnswer(id: string): Promise<void> {
  await deleteAnswer(id)
  await deleteDocAndChunks(generatedDocId(id))
}

async function syncGeneratedDoc(entry: AnswerBankEntry): Promise<void> {
  const id = generatedDocId(entry.id)
  const previous = await getDoc(id)
  await saveDoc(toGeneratedDoc(entry, previous?.createdAt ?? Date.now()))
}

/** Index any answer-bank rows that predate generated-doc mirroring (idempotent). */
export async function ensureAnswersIndexed(): Promise<void> {
  const answers = await listAnswers()
  for (const entry of answers) {
    const existing = await getDoc(generatedDocId(entry.id))
    if (!existing) await syncGeneratedDoc(entry)
  }
}

function toGeneratedDoc(entry: AnswerBankEntry, createdAt: number): ContextDoc {
  const title = entry.company.trim()
    ? `${entry.question} (${entry.company.trim()})`
    : entry.question

  const lines = [
    `Question: ${entry.question}`,
    entry.company.trim() ? `Company: ${entry.company.trim()}` : null,
    '',
    entry.answer,
  ].filter((line): line is string => line !== null)

  return {
    id: generatedDocId(entry.id),
    source: 'generated',
    title: title.slice(0, 200),
    text: lines.join('\n'),
    createdAt,
    externalId: entry.fingerprint,
  }
}
