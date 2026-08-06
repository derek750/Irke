import { getSettings } from '../settings'
import { listChunks, putChunks } from '../db'
import { embeddingApiKey, embedTexts } from './embed'

export interface BuildIndexResult {
  embedded: number
  skipped: number
  total: number
}

/**
 * Embed context chunks via OpenAI and write vectors back to IndexedDB.
 * Sync / upload still only store BM25 tokens; this is the explicit second step.
 */
export async function buildContextIndex(options?: {
  /** When true, re-embed every chunk even if a vector already exists. */
  rebuild?: boolean
}): Promise<BuildIndexResult> {
  const settings = await getSettings()
  const apiKey = embeddingApiKey(settings)
  const chunks = await listChunks()
  if (!chunks.length) return { embedded: 0, skipped: 0, total: 0 }

  const targets = options?.rebuild ? chunks : chunks.filter((chunk) => !chunk.embedding?.length)
  const skipped = chunks.length - targets.length
  if (!targets.length) return { embedded: 0, skipped, total: chunks.length }

  const vectors = await embedTexts(
    apiKey,
    targets.map((chunk) => chunk.text),
  )
  const now = Date.now()
  const updated = targets.map((chunk, index) => ({
    ...chunk,
    embedding: vectors[index],
    embeddedAt: now,
  }))
  await putChunks(updated)

  return { embedded: updated.length, skipped, total: chunks.length }
}
