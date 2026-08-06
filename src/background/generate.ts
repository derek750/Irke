import { lookupAnswer } from '@/lib/answer-bank'
import { embeddingApiKey, embedTexts, resolveEmbeddingProvider } from '@/lib/context/embed'
import { retrieve } from '@/lib/context/retrieve'
import { listChunks } from '@/lib/db'
import { complete } from '@/lib/llm'
import {
  NEEDS_INPUT_MARKER,
  buildReviseSystemPrompt,
  buildReviseUserPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from '@/lib/prompt'
import { getSettings } from '@/lib/settings'
import type { DetectedQuestion, GeneratedAnswer, JobContext } from '@/lib/types'

interface GenerateInput {
  job: JobContext
  question: DetectedQuestion
  regenerate: boolean
  /** When set, overrides Settings.extraInstructions for this call only. */
  extraInstructions?: string
}

const JD_QUERY_CHARS = 1200

export async function generateAnswer({
  job,
  question,
  regenerate,
  extraInstructions,
}: GenerateInput): Promise<GeneratedAnswer> {
  if (!regenerate) {
    const remembered = await lookupAnswer(question.label)
    if (remembered) {
      return {
        fieldId: question.fieldId,
        answer: remembered.answer,
        source: 'answer_bank',
        sources: [`Answer bank${remembered.company ? ` (${remembered.company})` : ''}`],
        needsInput: false,
      }
    }
  }

  const settings = await getSettings()
  const chunks = await listChunks()
  // The JD adds vocabulary the question alone lacks, which is what surfaces the right stories.
  const query = `${question.label}\n${job.title}\n${job.descriptionText.slice(0, JD_QUERY_CHARS)}`

  let queryEmbedding: number[] | undefined
  const hasEmbeddings = chunks.some((chunk) => chunk.embedding?.length)
  if (hasEmbeddings) {
    try {
      const provider = resolveEmbeddingProvider(settings)
      const [vector] = await embedTexts(embeddingApiKey(settings), [query], provider)
      queryEmbedding = vector
    } catch {
      // Fall back to BM25 when the embed key is missing or the request fails.
      queryEmbedding = undefined
    }
  }

  const retrieved = retrieve(query, chunks, { queryEmbedding })
  const instructions = extraInstructions ?? settings.extraInstructions

  // Pass 1: draft with the context-reading and writing skills in the system prompt.
  const draft = await complete({
    settings,
    system: buildSystemPrompt(instructions),
    user: buildUserPrompt({ job, question, retrieved }),
  })

  // Fast mode skips the editor pass — half the latency/cost when iterating.
  if (settings.generationMode === 'fast') {
    return {
      fieldId: question.fieldId,
      answer: draft,
      source: 'llm',
      sources: [...new Set(retrieved.map((entry) => entry.chunk.docTitle))],
      needsInput: draft.includes(NEEDS_INPUT_MARKER),
    }
  }

  // Pass 2: editor audits the draft against the AI-tell checklist and the
  // excerpts (copied phrasing, ungrounded claims) and rewrites it.
  let answer = draft
  try {
    answer = await complete({
      settings,
      system: buildReviseSystemPrompt(instructions),
      user: buildReviseUserPrompt({ job, question, retrieved, draft }),
    })
  } catch {
    // A failed polish pass should not throw away a usable draft.
  }

  return {
    fieldId: question.fieldId,
    answer,
    source: 'llm',
    sources: [...new Set(retrieved.map((entry) => entry.chunk.docTitle))],
    needsInput: answer.includes(NEEDS_INPUT_MARKER),
  }
}
