import { getSettings } from '../settings'
import { chunkCoverage, listChunks, listUnembeddedChunks, putChunks } from '../db'
import type { ContextChunk } from '../types'
import { embeddingApiKey, embedTexts, resolveEmbeddingProvider, type EmbeddingProvider } from './embed'

export interface BuildIndexResult {
  embedded: number
  skipped: number
  total: number
}

/** Above this, one `getAll` beats thousands of keyed reads for the missing set. */
const KEYED_MISSING_LIMIT = 40

/**
 * Embed context chunks via OpenAI or OpenRouter and write vectors back to IndexedDB.
 * Sync / upload still only store BM25 tokens; this is the explicit second step.
 */
export async function buildContextIndex(options?: {
  /** When true, re-embed every chunk even if a vector already exists. */
  rebuild?: boolean
}): Promise<BuildIndexResult> {
  const settings = await getSettings()
  const provider = resolveEmbeddingProvider(settings)
  const apiKey = embeddingApiKey(settings)

  if (options?.rebuild) {
    const chunks = await listChunks()
    if (!chunks.length) return { embedded: 0, skipped: 0, total: 0 }
    return embedAndStore(chunks, apiKey, provider, 0)
  }

  const coverage = await chunkCoverage()
  const missing = coverage.total - coverage.embedded
  if (!coverage.total) return { embedded: 0, skipped: 0, total: 0 }
  if (!missing) return { embedded: 0, skipped: coverage.total, total: coverage.total }

  const targets =
    missing > KEYED_MISSING_LIMIT
      ? (await listChunks()).filter((chunk) => !chunk.embedding?.length)
      : await listUnembeddedChunks()
  if (!targets.length) return { embedded: 0, skipped: coverage.total, total: coverage.total }

  return embedAndStore(targets, apiKey, provider, coverage.total - targets.length)
}

async function embedAndStore(
  targets: ContextChunk[],
  apiKey: string,
  provider: EmbeddingProvider,
  skipped: number,
): Promise<BuildIndexResult> {
  const vectors = await embedTexts(
    apiKey,
    targets.map((chunk) => chunk.text),
    provider,
  )
  const now = Date.now()
  const updated = targets.map((chunk, index) => ({
    ...chunk,
    // Typed array: half the IndexedDB size and structured-clone cost of a number[] on every
    // future read of the chunk store.
    embedding: Float32Array.from(vectors[index]),
    embeddedAt: now,
  }))
  await putChunks(updated)

  return { embedded: updated.length, skipped, total: skipped + updated.length }
}

/**
 * Best-effort auto-embed of whatever lacks a vector, called after ingest, generate, and save.
 * Quiet by design: no key, an Anthropic-only setup, or a failed request leaves keyword-only
 * retrieval working, and the next call heals the gap. Completes in a count when the index is
 * already current — it does not load vectors into the worker.
 */
export async function ensureContextEmbeddings(): Promise<BuildIndexResult | null> {
  try {
    return await buildContextIndex()
  } catch {
    return null
  }
}
