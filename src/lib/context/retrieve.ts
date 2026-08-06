import type { ContextChunk, ContextSource, RetrievedChunk } from '../types'
import { tokenize } from './tokenize'

const K1 = 1.5
const B = 0.75
const RRF_K = 60
/** How many candidates each channel contributes before fusion. */
const CANDIDATE_POOL = 20
/** Drop weak cosine matches before RRF (OpenAI embeddings are roughly unit-normalized). */
const MIN_COSINE = 0.2

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
  /** When set and chunks have embeddings, fuse BM25 with cosine via RRF. */
  queryEmbedding?: number[]
}

/**
 * Hybrid retrieval over locally stored chunks.
 * BM25 alone when no embeddings; BM25 + cosine (RRF) when Build index has run.
 */
export function retrieve(
  query: string,
  chunks: ContextChunk[],
  { limit = 8, minScore = 0.01, queryEmbedding }: RetrieveOptions = {},
): RetrievedChunk[] {
  const bm25 = retrieveBm25(query, chunks, { limit: CANDIDATE_POOL, minScore })

  if (!queryEmbedding?.length) return bm25.slice(0, limit)

  const vector = retrieveVector(queryEmbedding, chunks, {
    limit: CANDIDATE_POOL,
    minCosine: MIN_COSINE,
  })
  if (!vector.length) return bm25.slice(0, limit)
  if (!bm25.length) return vector.slice(0, limit)

  return reciprocalRankFusion([bm25, vector], limit)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function retrieveBm25(
  query: string,
  chunks: ContextChunk[],
  { limit, minScore }: { limit: number; minScore: number },
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

function retrieveVector(
  queryEmbedding: number[],
  chunks: ContextChunk[],
  { limit, minCosine }: { limit: number; minCosine: number },
): RetrievedChunk[] {
  const scored: RetrievedChunk[] = []
  for (const chunk of chunks) {
    if (!chunk.embedding?.length) continue
    const cosine = cosineSimilarity(queryEmbedding, chunk.embedding)
    if (cosine < minCosine) continue
    scored.push({ chunk, score: cosine * SOURCE_BOOST[chunk.source] })
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Reciprocal rank fusion — combines ranked lists without needing score calibration. */
function reciprocalRankFusion(lists: RetrievedChunk[][], limit: number): RetrievedChunk[] {
  const fused = new Map<string, { chunk: ContextChunk; score: number }>()

  for (const list of lists) {
    list.forEach((entry, rank) => {
      const add = 1 / (RRF_K + rank + 1)
      const existing = fused.get(entry.chunk.id)
      if (existing) existing.score += add
      else fused.set(entry.chunk.id, { chunk: entry.chunk, score: add })
    })
  }

  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

function sumValues(counts: Record<string, number>): number {
  let total = 0
  for (const value of Object.values(counts)) total += value
  return total
}
