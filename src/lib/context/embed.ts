import type { LlmProvider, Settings } from '../types'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
const OPENROUTER_EMBEDDING_MODEL = 'openai/text-embedding-3-small'
const BATCH_SIZE = 64

type EmbeddingProvider = Extract<LlmProvider, 'openai' | 'openrouter'>

const EMBED_URLS: Record<EmbeddingProvider, string> = {
  openai: 'https://api.openai.com/v1/embeddings',
  openrouter: 'https://openrouter.ai/api/v1/embeddings',
}

/**
 * Embeddings via OpenAI or OpenRouter (OpenAI-compatible). Anthropic has no embeddings API.
 */
export function embeddingApiKey(settings: Settings): string {
  resolveEmbeddingProvider(settings)
  return settings.apiKey.trim()
}

export function resolveEmbeddingProvider(settings: Settings): EmbeddingProvider {
  if (
    (settings.provider !== 'openai' && settings.provider !== 'openrouter') ||
    !settings.apiKey.trim()
  ) {
    throw new Error(
      'Building the embedding index needs an OpenAI or OpenRouter API key. Set the AI provider in options (Anthropic has no embeddings API).',
    )
  }
  return settings.provider
}

/** Embed texts in batches. Returns vectors in the same order as `texts`. */
export async function embedTexts(
  apiKey: string,
  texts: string[],
  provider: EmbeddingProvider = 'openai',
): Promise<number[][]> {
  if (!texts.length) return []

  const vectors: number[][] = []
  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const batch = texts.slice(offset, offset + BATCH_SIZE)
    vectors.push(...(await embedBatch(apiKey, batch, provider)))
  }
  return vectors
}

async function embedBatch(
  apiKey: string,
  texts: string[],
  provider: EmbeddingProvider,
): Promise<number[][]> {
  const model = provider === 'openrouter' ? OPENROUTER_EMBEDDING_MODEL : EMBEDDING_MODEL
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/derek750/Irke'
    headers['X-Title'] = 'Irke'
  }

  const response = await fetch(EMBED_URLS[provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      input: texts,
    }),
  })

  const raw = await response.text()
  let payload: unknown = null
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    payload = null
  }

  const label = provider === 'openrouter' ? 'OpenRouter' : 'OpenAI'
  if (!response.ok) {
    const detail =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload as any)?.error?.message ?? raw.slice(0, 200) ?? response.statusText
    throw new Error(`${label} embeddings failed (${response.status}): ${detail}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (payload as any)?.data
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error(`${label} embeddings returned an unexpected payload.`)
  }

  const ordered = [...data].sort(
    (a: { index?: number }, b: { index?: number }) => (a.index ?? 0) - (b.index ?? 0),
  )

  return ordered.map((item: { embedding?: unknown }, index) => {
    const embedding = item?.embedding
    if (!Array.isArray(embedding) || !embedding.every((n) => typeof n === 'number')) {
      throw new Error(`${label} embeddings missing vector for input ${index}.`)
    }
    return embedding as number[]
  })
}
