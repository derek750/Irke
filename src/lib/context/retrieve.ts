import type { ContextChunk, ContextSource, RetrievedChunk } from '../types'
import { tokenize } from './tokenize'

const K1 = 1.5
const B = 0.75

/** Deliberately written stories beat incidental material scraped from Drive or a repo. */
const SOURCE_BOOST: Record<ContextSource, number> = {
  story: 1.3,
  document: 1.15,
  drive: 1.1,
  github: 1,
}

interface RetrieveOptions {
  limit?: number
  minScore?: number
}

/**
 * BM25 over locally stored chunks. Keyword scoring keeps retrieval instant and
 * dependency-free; the corpus here is one person's documents, not a web index.
 */
export function retrieve(
  query: string,
  chunks: ContextChunk[],
  { limit = 8, minScore = 0.01 }: RetrieveOptions = {},
): RetrievedChunk[] {
  if (!chunks.length) return []

  const queryTerms = [...new Set(tokenize(query))]
  if (!queryTerms.length) return []

  const lengths = chunks.map((chunk) => sumValues(chunk.tokens))
  const averageLength = lengths.reduce((total, length) => total + length, 0) / chunks.length || 1

  const documentFrequency = new Map<string, number>()
  for (const term of queryTerms) {
    let count = 0
    for (const chunk of chunks) if (chunk.tokens[term]) count += 1
    documentFrequency.set(term, count)
  }

  const scored = chunks.map((chunk, index) => {
    let score = 0
    for (const term of queryTerms) {
      const frequency = chunk.tokens[term]
      if (!frequency) continue

      const df = documentFrequency.get(term) ?? 0
      const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5))
      const normalization = K1 * (1 - B + (B * lengths[index]) / averageLength)
      score += idf * ((frequency * (K1 + 1)) / (frequency + normalization))
    }
    return { chunk, score: score * SOURCE_BOOST[chunk.source] }
  })

  return scored
    .filter((entry) => entry.score > minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function sumValues(counts: Record<string, number>): number {
  let total = 0
  for (const value of Object.values(counts)) total += value
  return total
}
