export type LlmProvider = 'openai' | 'openrouter'

/** Fast = draft only; polished = draft + revise pass (default). */
export type GenerationMode = 'fast' | 'polished'

/**
 * Contact details printed at the top of a generated cover letter. Documents only — Irke still
 * never types any of this into a form field. Blank entries are left off the letter.
 */
export interface Letterhead {
  name: string
  email: string
  phone: string
  location: string
  links: string
}

export interface Settings {
  provider: LlmProvider
  apiKey: string
  model: string
  temperature: number
  extraInstructions: string
  generationMode: GenerationMode
  /**
   * When true, saved AI drafts (`source: 'generated'`) are eligible for retrieval.
   * Off by default so the corpus stays human-authored until the user opts in.
   * Embeddings for new drafts still require a manual Build index.
   */
  includeGeneratedInRag: boolean
  letterhead: Letterhead
}

/** Where a context document came from. Doubles as the tag prefixed onto every chunk. */
export type ContextSource = 'story' | 'document' | 'drive' | 'github' | 'generated' | 'distilled'

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
  /**
   * OpenAI embedding vector; filled by auto-embed / Build context. Absent until then — BM25
   * still works. New writes store `Float32Array` (half the memory and clone cost of `number[]`
   * on every chunk read); chunks embedded before that change still hold plain arrays.
   */
  embedding?: number[] | Float32Array
  embeddedAt?: number
}

export interface RetrievedChunk {
  chunk: ContextChunk
  score: number
  /** Included because the user's steer matched it, not (only) because the question did. */
  steered?: boolean
}

export interface AnswerBankEntry {
  id: string
  /** Normalized question text; the upsert key when saving. */
  fingerprint: string
  question: string
  /** The current pick — the one mirrored into the context index. */
  answer: string
  company: string
  updatedAt: number
  useCount: number
  /**
   * Every answer this question has had, oldest first, `answer` last. Regenerating appends rather
   * than overwrites, so an earlier draft is still there if the newer one turned out worse.
   * Absent on rows written before versioning; treat as `[answer]`.
   */
  versions?: string[]
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
  /** A file upload can be drafted and turned into a PDF, but never written to directly. */
  control: 'text' | 'file'
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
  source: 'llm'
  sources: string[]
  /** Subset of `sources` that entered retrieval because the steer asked for them. */
  steeredSources?: string[]
  /**
   * True when the index has vectors but the query embedding failed, so this draft was grounded
   * by keyword match alone. Not set when the index simply has no vectors — that is the expected
   * mode without an OpenAI / OpenRouter key, not a degradation.
   */
  degradedRetrieval?: boolean
  needsInput: boolean
}
