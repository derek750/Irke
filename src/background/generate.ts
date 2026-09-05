import { fingerprintQuestion, generatedDocId, rememberAnswer } from '@/lib/answer-bank'
import { embeddingApiKey, embedTexts, resolveEmbeddingProvider } from '@/lib/context/embed'
import { retrieve, type QueryPart } from '@/lib/context/retrieve'
import { findAnswer, listChunks } from '@/lib/db'
import { complete } from '@/lib/llm'
import {
  NEEDS_INPUT_MARKER,
  buildReviseSystemPrompt,
  buildReviseUserPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from '@/lib/prompt'
import { getSettings } from '@/lib/settings'
import type { ContextChunk, DetectedQuestion, GeneratedAnswer, JobContext } from '@/lib/types'

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
  /**
   * Text the user wrote or edited themselves. When set, this call is a refine: the draft is the
   * base to build on (its facts and story kept, prompt told so, its vocabulary joins retrieval),
   * there is no rejected list, and the temperature stays put — fidelity over variety.
   */
  currentDraft?: string
}

const JD_QUERY_CHARS = 1200
/**
 * The job description is vocabulary, not the question. Left unweighted its ~80 terms bury the
 * handful that say what is actually being asked, and every question on the page retrieves the
 * same excerpts. These are the multipliers that keep the question in charge of its own search.
 */
const QUESTION_WEIGHT = 10
const TITLE_WEIGHT = 2
const JD_WEIGHT = 1
/** Embeddings cannot be term-weighted, so the vector query carries far less of the JD instead. */
const JD_EMBED_CHARS = 400
/**
 * A hand-edited draft is supporting vocabulary for retrieval, JD-like: its rare terms (the
 * project it talks about) lift the matching material, its common words wash out against the
 * question's weight-10 terms. Weight 2 measured safe — no relevance-floor starvation.
 */
const DRAFT_WEIGHT = 2
const DRAFT_EMBED_CHARS = 400
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
  currentDraft,
}: GenerateInput): Promise<GeneratedAnswer> {
  // Always draft via the LLM. Saved answers live in the index as `generated` docs and
  // only enter retrieval when Settings.includeGeneratedInRag is on (never pasted as-is).
  const settings = await getSettings()

  // A hand-edited draft flips the meaning of "regenerate": the user has committed to a
  // direction, so the retry refines their text instead of avoiding it.
  const baseDraft = currentDraft?.trim() || undefined

  // The JD adds vocabulary the question alone lacks, which is what surfaces the right stories —
  // but it is the same on every card, so it supports the question rather than outvoting it.
  // A base draft joins the same way: what it talks about is what the retry must ground.
  const query: QueryPart[] = [
    { text: question.label, weight: QUESTION_WEIGHT },
    { text: job.title, weight: TITLE_WEIGHT },
    { text: job.descriptionText.slice(0, JD_QUERY_CHARS), weight: JD_WEIGHT },
    ...(baseDraft ? [{ text: baseDraft, weight: DRAFT_WEIGHT }] : []),
  ]

  const includeGenerated = settings.includeGeneratedInRag
  // How many answers this question has already burned through. Drives the retrieval window, the
  // do-not-repeat list, and whether this question's own prior draft is allowed to be evidence.
  // A refine has no rejected answers — the base draft is the direction, not a failure.
  const previous = regenerate && !baseDraft ? unique(previousAnswers) : []

  // On a refine, this question's banked prior draft is (nearly) the base draft itself —
  // retrieving it would hand the model the same text twice.
  const chunks = await searchableChunks(
    question.label,
    includeGenerated && (previous.length > 0 || Boolean(baseDraft)),
  )
  const searchable = includeGenerated ? chunks : chunks.filter((chunk) => chunk.source !== 'generated')

  const direction = steer?.trim() || undefined

  let queryEmbedding: number[] | undefined
  const hasEmbeddings = searchable.some((chunk) => chunk.embedding?.length)
  if (hasEmbeddings) {
    try {
      const provider = resolveEmbeddingProvider(settings)
      // The steer leads the embed text so the vector channel follows it even when it shares no
      // words with the material — the paraphrase case BM25 pinning cannot catch. A base draft
      // rides along for the same reason: the retry grounds what the user's text talks about.
      const embedQuery = [
        direction,
        question.label,
        baseDraft?.slice(0, DRAFT_EMBED_CHARS),
        job.title,
        job.descriptionText.slice(0, JD_EMBED_CHARS),
      ]
        .filter(Boolean)
        .join('\n')
      const [vector] = await embedTexts(embeddingApiKey(settings), [embedQuery], provider)
      queryEmbedding = vector
    } catch {
      // Fall back to BM25 when the embed key is missing or the request fails.
      queryEmbedding = undefined
    }
  }

  const retrieved = retrieve(query, chunks, {
    queryEmbedding,
    includeGenerated,
    rotate: previous.length,
    steer: direction,
  })
  // The steer does not join these standing instructions — it is moment-specific, so it rides in
  // the user prompt next to the question (and it already shaped retrieval above).
  const instructions = (extraInstructions ?? settings.extraInstructions).trim()

  // Fresh excerpts change what the answer is about; a hotter sample changes how it is written.
  // A refine wants neither — it wants fidelity to the base draft at the normal temperature.
  const draftSettings =
    regenerate && !baseDraft
      ? {
          ...settings,
          temperature: Math.min(MAX_RETRY_TEMPERATURE, settings.temperature + RETRY_TEMPERATURE_STEP),
        }
      : settings

  // Pass 1: draft with the context-reading and writing skills in the system prompt.
  const draft = await complete({
    settings: draftSettings,
    system: buildSystemPrompt(instructions),
    user: buildUserPrompt({ job, question, retrieved, previous, steer: direction, baseDraft }),
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
        user: buildReviseUserPrompt({ job, question, retrieved, draft, previous, steer: direction, baseDraft }),
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

  const steeredSources = [
    ...new Set(retrieved.filter((entry) => entry.steered).map((entry) => entry.chunk.docTitle)),
  ]

  return {
    fieldId: question.fieldId,
    answer,
    source: 'llm',
    sources: [...new Set(retrieved.map((entry) => entry.chunk.docTitle))],
    steeredSources: steeredSources.length ? steeredSources : undefined,
    // Vectors exist but the query embed failed — this draft ran keyword-only when it should
    // not have. (No vectors at all is the normal keyword mode, not a degradation.)
    degradedRetrieval: hasEmbeddings && !queryEmbedding ? true : undefined,
    needsInput: answer.includes(NEEDS_INPUT_MARKER),
  }
}

/**
 * Everything in the index, minus this question's own prior draft when regenerating. With
 * `includeGeneratedInRag` on, the answer the user just rejected is itself a `generated` chunk that
 * matches this question better than anything else — retrieving it hands the model the very text it
 * was asked to replace. Prior drafts of *other* questions are still fair evidence.
 */
async function searchableChunks(label: string, dropPriorDraft: boolean): Promise<ContextChunk[]> {
  const chunks = await listChunks()
  if (!dropPriorDraft) return chunks

  const entry = await findAnswer(fingerprintQuestion(label))
  if (!entry) return chunks

  const docId = generatedDocId(entry.id)
  return chunks.filter((chunk) => chunk.docId !== docId)
}

function unique(answers: string[] | undefined): string[] {
  return [...new Set((answers ?? []).map((answer) => answer.trim()).filter(Boolean))]
}
