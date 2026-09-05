/** Throwaway stub for `@/lib/db` so the generate pipeline can run under Node. */
import { chunkDoc } from '../../src/lib/context/chunk.ts'
import type { AnswerBankEntry, ContextChunk, ContextDoc, ContextSource } from '../../src/lib/types.ts'

const docs: ContextDoc[] = [
  {
    id: 'story-cubesat',
    source: 'story',
    title: 'CubeSat power budget',
    createdAt: 1,
    text: 'On my university CubeSat team I own the electrical power subsystem. I rebuilt the power budget from telemetry and wrote load-shedding firmware so the battery survives eclipse.',
  },
  {
    id: 'story-payments',
    source: 'story',
    title: 'Why payments',
    createdAt: 2,
    text: 'I care about payments infrastructure because the failure modes are unforgiving and the feedback loop is concrete. A bug is money in the wrong place.',
  },
  {
    id: 'drive-resume',
    source: 'drive',
    title: 'Resume.pdf',
    createdAt: 3,
    text: 'Software Engineering Intern at Northwind. Built a payments reconciliation service in Go and Postgres that cut manual review time by 40 percent.',
  },
  {
    id: 'distilled:story-cubesat',
    source: 'distilled',
    title: 'Notes — CubeSat power budget',
    createdAt: 4,
    text: '## Story: Leadership of the CubeSat power subsystem\nType: leadership, ownership, project\nSituation: power budget assumed peak solar generation. Action: rebuilt it from telemetry, wrote load-shedding firmware. Outcome: battery survives eclipse.',
  },
]

let fakeVectors = false

/** From here on, every chunk reports an embedding — for testing the hybrid/degraded paths. */
export function enableFakeVectors(): void {
  fakeVectors = true
}

export async function listChunks(): Promise<ContextChunk[]> {
  const chunks = docs.flatMap(chunkDoc)
  if (!fakeVectors) return chunks
  return chunks.map((chunk) => ({ ...chunk, embedding: [0.6, 0.8, 0], embeddedAt: 1 }))
}

export async function findAnswer(_fingerprint: string): Promise<AnswerBankEntry | null> {
  return null
}

export async function putDoc(_doc: ContextDoc): Promise<void> {}
export async function getDoc(_id: string): Promise<ContextDoc | null> {
  return null
}
export async function listDocs(): Promise<ContextDoc[]> {
  return docs
}
export async function deleteDocAndChunks(_docId: string): Promise<void> {}
export async function replaceChunksForDoc(_docId: string, _chunks: ContextChunk[]): Promise<void> {}
export async function saveDoc(_doc: ContextDoc): Promise<void> {}
export async function replaceDocsForSource(_source: ContextSource, _docs: ContextDoc[]): Promise<void> {}
export async function putChunks(_chunks: ContextChunk[]): Promise<void> {}
export async function putAnswer(_entry: AnswerBankEntry): Promise<void> {}
export async function listAnswers(): Promise<AnswerBankEntry[]> {
  return []
}
export async function deleteAnswer(_id: string): Promise<void> {}
