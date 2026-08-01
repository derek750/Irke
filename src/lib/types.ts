export type LlmProvider = 'openai' | 'anthropic'

export interface Settings {
  provider: LlmProvider
  apiKey: string
  model: string
  temperature: number
  extraInstructions: string
}

export interface Profile {
  fullName: string
  email: string
  phone: string
  location: string
  linkedinUrl: string
  githubUrl: string
  portfolioUrl: string
  workAuthorization: string
  needsSponsorship: string
  salaryExpectation: string
  noticePeriod: string
  earliestStartDate: string
  pronouns: string
}

/** Category tag prefixed onto every chunk so the model knows what it is reading. */
export type BrainDocKind = 'resume' | 'app_answer' | 'about_me' | 'project' | 'writing'

export interface BrainDoc {
  id: string
  kind: BrainDocKind
  title: string
  text: string
  createdAt: number
}

export interface BrainChunk {
  id: string
  docId: string
  docTitle: string
  kind: BrainDocKind
  text: string
  /** Lowercased token counts, precomputed at ingest so retrieval stays cheap. */
  tokens: Record<string, number>
}

export interface RetrievedChunk {
  chunk: BrainChunk
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

export type QuestionInputKind = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox'

export interface DetectedQuestion {
  /** Stable within a page session; used to target the field when filling. */
  fieldId: string
  label: string
  inputKind: QuestionInputKind
  required: boolean
  maxLength: number | null
  options: string[]
  currentValue: string
  /** Profile key this field maps to, when the local matcher recognizes it. */
  profileKey: keyof Profile | null
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
  source: 'answer_bank' | 'profile' | 'llm'
  sources: string[]
  needsInput: boolean
}
