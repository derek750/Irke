import { lookupAnswer } from '@/lib/answer-bank'
import { embeddingApiKey, embedTexts } from '@/lib/context/embed'
import { retrieve } from '@/lib/context/retrieve'
import { listChunks } from '@/lib/db'
import { complete } from '@/lib/llm'
import { NEEDS_INPUT_MARKER, buildSystemPrompt, buildUserPrompt } from '@/lib/prompt'
import { getSettings } from '@/lib/settings'
import type { DetectedQuestion, GeneratedAnswer, JobContext } from '@/lib/types'

interface GenerateInput {
  job: JobContext
  question: DetectedQuestion
  regenerate: boolean
}

const JD_QUERY_CHARS = 1200

export async function generateAnswer({ job, question, regenerate }: GenerateInput): Promise<GeneratedAnswer> {
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
      const [vector] = await embedTexts(embeddingApiKey(settings), [query])
      queryEmbedding = vector
    } catch {
      // Fall back to BM25 when the embed key is missing or the request fails.
      queryEmbedding = undefined
    }
  }

  const retrieved = retrieve(query, chunks, { queryEmbedding })

  const answer = await complete({
    settings,
    system: buildSystemPrompt(settings.extraInstructions),
    user: buildUserPrompt({ job, question, retrieved }),
  })

  return {
    fieldId: question.fieldId,
    answer,
    source: 'llm',
    sources: [...new Set(retrieved.map((entry) => entry.chunk.docTitle))],
    needsInput: answer.includes(NEEDS_INPUT_MARKER),
  }
}
