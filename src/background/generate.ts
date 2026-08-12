import { rememberAnswer } from '@/lib/answer-bank'
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
  /** Added on top of whatever instructions apply, to steer this one answer. */
  steer?: string
  /** Answers already rejected for this question, oldest first, so a retry lands on none of them. */
  previousAnswers?: string[]
}

const JD_QUERY_CHARS = 1200
/** A retry samples hotter, or the same prompt returns the same answer. */
const RETRY_TEMPERATURE_STEP = 0.35
const MAX_RETRY_TEMPERATURE = 1

export async function generateAnswer({
  job,
  question,
  regenerate,
  extraInstructions,
  steer,
  previousAnswers,
}: GenerateInput): Promise<GeneratedAnswer> {
  // Always draft via the LLM. Saved answers live in the index as `generated` docs and
  // only enter retrieval when Settings.includeGeneratedInRag is on (never pasted as-is).
  const settings = await getSettings()
  const chunks = await listChunks()
  // The JD adds vocabulary the question alone lacks, which is what surfaces the right stories.
  const query = `${question.label}\n${job.title}\n${job.descriptionText.slice(0, JD_QUERY_CHARS)}`

  const includeGenerated = settings.includeGeneratedInRag
  const searchable = includeGenerated ? chunks : chunks.filter((chunk) => chunk.source !== 'generated')

  let queryEmbedding: number[] | undefined
  const hasEmbeddings = searchable.some((chunk) => chunk.embedding?.length)
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

  // How many answers this question has already burned through. Drives both the retrieval window
  // and the do-not-repeat list, so a retry is regrounded as well as reworded.
  const previous = regenerate ? unique(previousAnswers) : []
  const retrieved = retrieve(query, chunks, {
    queryEmbedding,
    includeGenerated,
    rotate: previous.length,
  })
  // A per-question steer adds to the standing instructions rather than replacing them, so the
  // user's defaults survive; only the dashboard dry-run overrides them outright.
  const instructions = [extraInstructions ?? settings.extraInstructions, steer]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('\n\n')

  // Fresh excerpts change what the answer is about; a hotter sample changes how it is written.
  const draftSettings = regenerate
    ? {
        ...settings,
        temperature: Math.min(MAX_RETRY_TEMPERATURE, settings.temperature + RETRY_TEMPERATURE_STEP),
      }
    : settings

  // Pass 1: draft with the context-reading and writing skills in the system prompt.
  const draft = await complete({
    settings: draftSettings,
    system: buildSystemPrompt(instructions),
    user: buildUserPrompt({ job, question, retrieved, previous }),
  })

  // Fast mode skips the editor pass — half the latency/cost when iterating.
  let answer = draft
  if (settings.generationMode !== 'fast') {
    // Pass 2: editor audits the draft against the AI-tell checklist and the
    // excerpts (copied phrasing, ungrounded claims) and rewrites it.
    try {
      answer = await complete({
        settings,
        system: buildReviseSystemPrompt(instructions),
        user: buildReviseUserPrompt({ job, question, retrieved, draft, previous }),
      })
    } catch {
      // A failed polish pass should not throw away a usable draft.
    }
  }

  // Always mirror into Context → Generated. Regenerates are appended as versions, never
  // overwritten, so nothing the user might want back is lost to another click.
  await rememberAnswer({
    question: question.label,
    answer,
    company: job.company,
  })

  return {
    fieldId: question.fieldId,
    answer,
    source: 'llm',
    sources: [...new Set(retrieved.map((entry) => entry.chunk.docTitle))],
    needsInput: answer.includes(NEEDS_INPUT_MARKER),
  }
}

function unique(answers: string[] | undefined): string[] {
  return [...new Set((answers ?? []).map((answer) => answer.trim()).filter(Boolean))]
}
