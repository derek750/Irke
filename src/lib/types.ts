export type LlmProvider = 'openai' | 'anthropic' | 'openrouter'

export interface Settings {
  provider: LlmProvider
  apiKey: string
  model: string
  temperature: number
  extraInstructions: string
}

/** Where a context document came from. Doubles as the tag prefixed onto every chunk. */
export type ContextSource = 'story' | 'document' | 'drive' | 'github'

export interface ContextDoc {
  id: string
  source: ContextSource
  title: string
  text: string
  createdAt: number
  /** Drive file id or `owner/repo`, so a resync updates in place instead of duplicating. */
  externalId?: string
  url?: string
}

export interface ContextChunk {
  id: string
  docId: string
  docTitle: string
  source: ContextSource
  text: string
  /** Lowercased token counts, precomputed at ingest so retrieval stays cheap. */
  tokens: Record<string, number>
  /** OpenAI embedding vector; filled by Build index. Absent until then — BM25 still works. */
  embedding?: number[]
  embeddedAt?: number
}

export interface RetrievedChunk {
  chunk: ContextChunk
  score: number
}

export interface AnswerBankEntry {
  id: string
  /** Normalized question text; the lookup key for reuse. */
  fingerprint: string
  question: string
  answer: string
  company: string
  updatedAt: number
  useCount: number
}

/**
 * The kind of story a question is fishing for. Drives the guidance handed to the model,
 * and is the reason a field was kept at all — Irke ignores everything that is not one of these.
 */
export type StoryTopic =
  | 'cover_letter'
  | 'why_company'
  | 'why_role'
  | 'behavioral'
  | 'strengths'
  | 'project'
  | 'open_ended'

export interface DetectedQuestion {
  /** Stable within a page session; used to target the field when filling. */
  fieldId: string
  label: string
  required: boolean
  maxLength: number | null
  currentValue: string
  topic: StoryTopic
}

export interface JobContext {
  url: string
  title: string
  company: string
  descriptionText: string
  ats: string
}

export interface PageScan {
  job: JobContext
  questions: DetectedQuestion[]
  scannedAt: number
  /** Frame the fields were found in, so fills target the same document. */
  frameId: number
}

export interface GeneratedAnswer {
  fieldId: string
  answer: string
  source: 'answer_bank' | 'llm'
  sources: string[]
  needsInput: boolean
}
