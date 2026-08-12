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

/** Older attempts past this are dropped oldest-first; a question does not need 50 rewrites on file. */
const MAX_VERSIONS = 20

/**
 * Upsert the answer bank entry and mirror it into the context index as `source: 'generated'`.
 * Drafts are stored for optional RAG (Settings.includeGeneratedInRag); generation never
 * pastes them verbatim — the user must opt in and Rebuild index for embeddings.
 *
 * Every distinct answer is kept in `versions`. Only the current one is mirrored into the index:
 * five near-identical drafts of the same question would crowd real material out of retrieval.
 */
export async function rememberAnswer(input: {
  question: string
  answer: string
  company: string
}): Promise<void> {
  const fingerprint = fingerprintQuestion(input.question)
  if (!fingerprint || !input.answer.trim()) return

  const existing = await findAnswer(fingerprint)
  const answer = input.answer.trim()
  const entry: AnswerBankEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    fingerprint,
    question: input.question,
    answer,
    company: input.company,
    updatedAt: Date.now(),
    useCount: (existing?.useCount ?? 0) + 1,
    versions: appendVersion(existing, answer),
  }

  await putAnswer(entry)
  await syncGeneratedDoc(entry)
}

/**
 * History with `answer` moved to the end. Re-picking an older version reorders rather than
 * duplicates, so the list stays one entry per distinct answer.
 */
function appendVersion(existing: AnswerBankEntry | null, answer: string): string[] {
  const history = existing?.versions ?? (existing?.answer ? [existing.answer] : [])
  return [...history.filter((version) => version !== answer), answer].slice(-MAX_VERSIONS)
}

/** Update answer text (Answers tab) and keep the indexed prior-draft doc in sync. */
export async function updateSavedAnswer(entry: AnswerBankEntry): Promise<void> {
  const answer = entry.answer.trim()
  if (!answer) return

  const next: AnswerBankEntry = {
    ...entry,
    answer,
    updatedAt: Date.now(),
    versions: appendVersion(entry, answer),
  }

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

function titleFromAnswer(answer: string): string {
  const firstLine =
    answer
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? 'Generated answer'

  if (firstLine.length <= 60) return firstLine
  const clipped = firstLine.slice(0, 60)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${(lastSpace > 20 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`
}

function toGeneratedDoc(entry: AnswerBankEntry, createdAt: number): ContextDoc {
  const lines = [
    `Question: ${entry.question}`,
    entry.company.trim() ? `Company: ${entry.company.trim()}` : null,
    '',
    entry.answer,
  ].filter((line): line is string => line !== null)

  return {
    id: generatedDocId(entry.id),
    source: 'generated',
    title: titleFromAnswer(entry.answer),
    text: lines.join('\n'),
    createdAt,
    externalId: entry.fingerprint,
  }
}
