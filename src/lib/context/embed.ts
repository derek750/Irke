import type { Settings } from '../types'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
const BATCH_SIZE = 64

/**
 * Embeddings only exist on OpenAI. Chat may use Anthropic; Build index still needs an OpenAI key.
 */
export function embeddingApiKey(settings: Settings): string {
  if (settings.provider !== 'openai' || !settings.apiKey.trim()) {
    throw new Error(
      'Building the embedding index needs an OpenAI API key. Set the AI provider to OpenAI in options (Anthropic has no embeddings API).',
    )
  }
  return settings.apiKey.trim()
}

/** Embed texts in batches. Returns vectors in the same order as `texts`. */
export async function embedTexts(apiKey: string, texts: string[]): Promise<number[][]> {
  if (!texts.length) return []

  const vectors: number[][] = []
  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const batch = texts.slice(offset, offset + BATCH_SIZE)
    vectors.push(...(await embedBatch(apiKey, batch)))
  }
  return vectors
}

async function embedBatch(apiKey: string, texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
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

  if (!response.ok) {
    const detail =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload as any)?.error?.message ?? raw.slice(0, 200) ?? response.statusText
    throw new Error(`OpenAI embeddings failed (${response.status}): ${detail}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (payload as any)?.data
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error('OpenAI embeddings returned an unexpected payload.')
  }

  const ordered = [...data].sort(
    (a: { index?: number }, b: { index?: number }) => (a.index ?? 0) - (b.index ?? 0),
  )

  return ordered.map((item: { embedding?: unknown }, index) => {
    const embedding = item?.embedding
    if (!Array.isArray(embedding) || !embedding.every((n) => typeof n === 'number')) {
      throw new Error(`OpenAI embeddings missing vector for input ${index}.`)
    }
    return embedding as number[]
  })
}
