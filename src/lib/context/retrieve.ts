import type { ContextChunk, ContextSource, RetrievedChunk } from '../types'
import { tokenize } from './tokenize'

const K1 = 1.5
const B = 0.75
const RRF_K = 60
/** How many candidates each channel contributes before fusion. */
const CANDIDATE_POOL = 20
/** Drop weak cosine matches before RRF (OpenAI embeddings are roughly unit-normalized). */
const MIN_COSINE = 0.2
/** Top hits every rotation keeps, so a regrounded retry still stands on the best evidence. */
const ANCHORS = 2

/** Deliberately written stories beat incidental material scraped from Drive or a repo. */
const SOURCE_BOOST: Record<ContextSource, number> = {
  story: 1.3,
  document: 1.15,
  drive: 1.1,
  github: 1,
  /** Prior drafts are memory, not primary evidence — rank below human-authored sources. */
  generated: 0.85,
}

interface RetrieveOptions {
  limit?: number
  minScore?: number
  /** When set and chunks have embeddings, fuse BM25 with cosine via RRF. */
  queryEmbedding?: number[]
  /**
   * When false (default), drop `source: 'generated'` chunks so AI drafts stay out of RAG
   * until Settings.includeGeneratedInRag is on.
   */
  includeGenerated?: boolean
  /**
   * Which regenerate this is. Non-zero walks the window down the candidate pool so a retry is
   * grounded in different excerpts — the same top-8 always produces the same answer.
   */
  rotate?: number
}

/**
 * Hybrid retrieval over locally stored chunks.
 * BM25 alone when no embeddings; BM25 + cosine (RRF) when Build index has run.
 */
export function retrieve(
  query: string,
  chunks: ContextChunk[],
  {
    limit = 8,
    minScore = 0.01,
    queryEmbedding,
    includeGenerated = false,
    rotate = 0,
  }: RetrieveOptions = {},
): RetrievedChunk[] {
  const corpus = includeGenerated ? chunks : chunks.filter((chunk) => chunk.source !== 'generated')
  const bm25 = retrieveBm25(query, corpus, { limit: CANDIDATE_POOL, minScore })

  return selectWindow(rank(queryEmbedding, corpus, bm25), limit, rotate)
}

function rank(
  queryEmbedding: number[] | undefined,
  corpus: ContextChunk[],
  bm25: RetrievedChunk[],
): RetrievedChunk[] {
  if (!queryEmbedding?.length) return bm25

  const vector = retrieveVector(queryEmbedding, corpus, {
    limit: CANDIDATE_POOL,
    minCosine: MIN_COSINE,
  })
  if (!vector.length) return bm25
  if (!bm25.length) return vector

  return reciprocalRankFusion([bm25, vector])
}

/**
 * Takes `limit` chunks off the ranked list, keeping the top `ANCHORS` and walking the rest of the
 * window `rotate` steps down the pool. A first pass reads ranks 1-8; the first regenerate reads
 * 1-2 plus 9-14, so it retells a different part of the candidate's material rather than the same
 * excerpts at a higher temperature. Wraps once the pool runs out.
 */
function selectWindow(ranked: RetrievedChunk[], limit: number, rotate: number): RetrievedChunk[] {
  const span = limit - ANCHORS
  const rest = ranked.slice(ANCHORS)
  if (rotate <= 0 || span <= 0 || rest.length <= span) return ranked.slice(0, limit)

  const start = (rotate * span) % rest.length
  const rotated = [...rest.slice(start), ...rest.slice(0, start)]
  return [...ranked.slice(0, ANCHORS), ...rotated.slice(0, span)]
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
function reciprocalRankFusion(lists: RetrievedChunk[][]): RetrievedChunk[] {
  const fused = new Map<string, { chunk: ContextChunk; score: number }>()

  for (const list of lists) {
    list.forEach((entry, rank) => {
      const add = 1 / (RRF_K + rank + 1)
      const existing = fused.get(entry.chunk.id)
      if (existing) existing.score += add
      else fused.set(entry.chunk.id, { chunk: entry.chunk, score: add })
    })
  }

  return [...fused.values()].sort((a, b) => b.score - a.score)
}

function sumValues(counts: Record<string, number>): number {
  let total = 0
  for (const value of Object.values(counts)) total += value
  return total
}
