/** Throwaway stub for `@/lib/context/embed`: a configured provider whose requests always fail. */
import type { Settings } from '../../src/lib/types.ts'

export const EMBEDDING_MODEL = 'text-embedding-3-small'

export function embeddingApiKey(settings: Settings): string {
  return settings.apiKey
}

export function resolveEmbeddingProvider(_settings: Settings): 'openai' {
  return 'openai'
}

export async function embedTexts(): Promise<number[][]> {
  throw new Error('stub: embeddings endpoint unreachable')
}
