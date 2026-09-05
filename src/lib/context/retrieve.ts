import type { ContextChunk, ContextSource, RetrievedChunk } from '../types'
import { distilledParentId } from './chunk'
import { termVariants, tokenize } from './tokenize'

const K1 = 1.5
const B = 0.75
const RRF_K = 60
/**
 * When both channels run, a chunk the vector channel ranked high beats one the keyword channel
 * ranked equally high. The questions are natural-language paraphrase — semantic similarity is
 * the signal that understands them — while BM25 is the cold-start fallback and the catcher of
 * rare literal tokens (project names, tools). Modest on purpose: RRF still rewards consensus,
 * and an exact keyword hit near the top still makes the window.
 */
const VECTOR_RRF_WEIGHT = 1.5
/** How many candidates each channel contributes before fusion. */
const CANDIDATE_POOL = 20
/** Drop weak cosine matches before RRF (OpenAI embeddings are roughly unit-normalized). */
const MIN_COSINE = 0.2
/** Top hits every rotation keeps, so a regrounded retry still stands on the best evidence. */
const ANCHORS = 2
/** Keyword hits scoring under this share of the query's best hit are noise, not evidence. */
const RELATIVE_FLOOR = 0.25
/** One excerpt is too thin to write from, and leaves a regenerate nothing to reground on. */
const MIN_RESULTS = 3
/**
 * A steer is searched on its own and its best hits are guaranteed the front of the window.
 * It deliberately does not join the keyword query: scores are compared against the query's best
 * hit (`RELATIVE_FLOOR`), so a steer naming rare terms becomes that best hit and the question's
 * own evidence gets cut — measured at every weight tried, from 5 to 30. Reserved slots cost the
 * tail of the window, never the head. The embed query does carry the steer; rank fusion cannot
 * starve the way score floors do.
 */
const STEER_PINS = 2
/**
 * What a morphological variant of a query term is worth relative to the exact word. Half keeps
 * every exact match ahead of every stem match: swept 0.5 / 0.75 / 1.0 on the probe corpus and
 * 0.5 was the only setting that fixed the paraphrase misses ("disagreed" → the story titled
 * "Disagreement") without flipping the top hit of any query that already worked.
 */
const VARIANT_DISCOUNT = 0.5
/**
 * Only parts at or above this weight expand into variant families. The job description rides at
 * weight 1 purely as supporting vocabulary — inflating its ~90 terms ~27× made every retrieve
 * pay for ~2,500 query terms (measured 415 ms on a 2,100-chunk corpus). The parts variants exist
 * to bridge — the question, the steer, a base draft — all carry weight 2 or more.
 */
const VARIANT_MIN_WEIGHT = 2

/** Deliberately written stories beat incidental material scraped from Drive or a repo. */
const SOURCE_BOOST: Record<ContextSource, number> = {
  story: 1.3,
  document: 1.15,
  drive: 1.1,
  github: 1,
  /** Prior drafts are memory, not primary evidence — rank below human-authored sources. */
  generated: 0.85,
  /**
   * LLM-condensed search notes over the user's own material. Written to be found (typed story
   * cards in question vocabulary), so they need no help ranking — swept 0.85-1.3 and the hit
   * rate barely moved. Kept at document level, under human-written stories.
   */
  distilled: 1.15,
}

export interface QueryPart {
  text: string
  /** Multiplies what every term in this part contributes to a chunk's score. */
  weight: number
}

/**
 * A plain string weights every term equally. Use parts when some of the query matters more than
 * the rest: a question label and 1200 characters of job description in one string is a search for
 * the job description, because the label is a handful of terms against a hundred.
 */
export type Query = string | QueryPart[]

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
  /**
   * The user's per-answer direction ("focus on the CubeSat work"). Searched on its own; its top
   * hits are pinned to the front of the window (marked `steered`) and survive rotation. A steer
   * that names nothing in the index (tone or length asks) matches nothing and leaves retrieval
   * untouched.
   */
  steer?: string
}

/**
 * Hybrid retrieval over locally stored chunks.
 * BM25 alone when no embeddings; BM25 + cosine (RRF) when Build index has run.
 */
export function retrieve(
  query: Query,
  chunks: ContextChunk[],
  {
    limit = 8,
    minScore = 0.01,
    queryEmbedding,
    includeGenerated = false,
    rotate = 0,
    steer,
  }: RetrieveOptions = {},
): RetrievedChunk[] {
  const corpus = includeGenerated ? chunks : chunks.filter((chunk) => chunk.source !== 'generated')

  // Weight 2 so the steer's terms expand into variant families (scores within this query are
  // relative, so the value itself changes nothing about which pins win).
  const trimmedSteer = steer?.trim()
  const pinned = trimmedSteer
    ? retrieveBm25([{ text: trimmedSteer, weight: VARIANT_MIN_WEIGHT }], corpus, {
        limit: Math.min(STEER_PINS, limit),
        minScore,
      }).map((entry) => ({ ...entry, steered: true }))
    : []

  const bm25 = retrieveBm25(query, corpus, { limit: CANDIDATE_POOL, minScore })
  const ranked = rank(queryEmbedding, corpus, bm25)

  let window: RetrievedChunk[]
  if (!pinned.length) {
    window = selectWindow(ranked, limit, rotate)
  } else {
    const pinnedIds = new Set(pinned.map((entry) => entry.chunk.id))
    const rest = ranked.filter((entry) => !pinnedIds.has(entry.chunk.id))
    window = [...pinned, ...selectWindow(rest, Math.max(0, limit - pinned.length), rotate)]
  }

  return chainParents(window, ranked, corpus, limit)
}

/**
 * Distilled notes are condensed for search, so they often outrank the document they condense —
 * whose own vocabulary never matched the question. The card names the story; the original
 * carries its texture. Every distilled hit therefore pulls its parent's best chunk in right
 * behind it (the small-to-big pattern), and the tail of the window pays for it. A parent pulled
 * in by a steered pin inherits the mark — it is there because the steer asked.
 */
function chainParents(
  window: RetrievedChunk[],
  ranked: RetrievedChunk[],
  corpus: ContextChunk[],
  limit: number,
): RetrievedChunk[] {
  const present = new Set(window.map((entry) => entry.chunk.docId))
  const chained: RetrievedChunk[] = []

  for (const entry of window) {
    chained.push(entry)
    if (entry.chunk.source !== 'distilled') continue

    const parentId = distilledParentId(entry.chunk.docId)
    if (!parentId || present.has(parentId)) continue

    const parent =
      ranked.find((candidate) => candidate.chunk.docId === parentId) ??
      firstChunkOf(parentId, corpus)
    if (!parent) continue

    present.add(parentId)
    chained.push(entry.steered ? { ...parent, steered: true } : parent)
  }

  return chained.slice(0, limit)
}

function firstChunkOf(docId: string, corpus: ContextChunk[]): RetrievedChunk | null {
  const chunk = corpus.find((candidate) => candidate.docId === docId)
  return chunk ? { chunk, score: 0 } : null
}

function toParts(query: Query): QueryPart[] {
  return typeof query === 'string' ? [{ text: query, weight: 1 }] : query
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

  return reciprocalRankFusion([
    { list: bm25, weight: 1 },
    { list: vector, weight: VECTOR_RRF_WEIGHT },
  ])
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

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
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
  query: Query,
  chunks: ContextChunk[],
  { limit, minScore }: { limit: number; minScore: number },
): RetrievedChunk[] {
  if (!chunks.length) return []

  const queryTerms = weighQueryTerms(query)
  if (!queryTerms.size) return []

  const lengths = chunks.map((chunk) => sumValues(chunk.tokens))
  const averageLength = lengths.reduce((total, length) => total + length, 0) / chunks.length || 1

  // One pass over the corpus counts document frequency for every query term at once. Scanning
  // the corpus per term instead is queryTerms × chunks — with variant families in the query,
  // that alone was hundreds of milliseconds at a few thousand chunks.
  const documentFrequency = new Map<string, number>()
  for (const chunk of chunks) {
    for (const term in chunk.tokens) {
      if (queryTerms.has(term)) {
        documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
      }
    }
  }

  // Terms in no chunk (most generated variants) can never score; drop them before the loop.
  const activeTerms = [...queryTerms].filter(([term]) => documentFrequency.has(term))

  const scored = chunks.map((chunk, index) => {
    let score = 0
    for (const [term, weight] of activeTerms) {
      const frequency = chunk.tokens[term]
      if (!frequency) continue

      const df = documentFrequency.get(term) ?? 0
      const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5))
      const normalization = K1 * (1 - B + (B * lengths[index]) / averageLength)
      score += weight * idf * ((frequency * (K1 + 1)) / (frequency + normalization))
    }
    return { chunk, score: score * SOURCE_BOOST[chunk.source] }
  })

  const ranked = scored.filter((entry) => entry.score > minScore).sort((a, b) => b.score - a.score)

  // `minScore` is an absolute floor, and almost everything clears it once the job description is
  // in the query — a 12-chunk index would return 8 chunks for every question asked. Scoring is
  // only comparable within one query, so the useful cutoff is relative to that query's best hit.
  // Pointed questions come back narrow, vague ones still come back broad.
  const best = ranked[0]?.score ?? 0
  const relevant = ranked.filter((entry) => entry.score >= best * RELATIVE_FLOOR)
  return (relevant.length < MIN_RESULTS ? ranked.slice(0, MIN_RESULTS) : relevant).slice(0, limit)
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
function reciprocalRankFusion(
  channels: Array<{ list: RetrievedChunk[]; weight: number }>,
): RetrievedChunk[] {
  const fused = new Map<string, { chunk: ContextChunk; score: number }>()

  for (const { list, weight } of channels) {
    list.forEach((entry, rank) => {
      const add = weight / (RRF_K + rank + 1)
      const existing = fused.get(entry.chunk.id)
      if (existing) existing.score += add
      else fused.set(entry.chunk.id, { chunk: entry.chunk, score: add })
    })
  }

  return [...fused.values()].sort((a, b) => b.score - a.score)
}

/**
 * Term → weight, taking the highest weight any part gave it. Deliberately not a sum: a word that
 * appears forty times in the job description should not outrank a word from the question itself.
 * Parts at `VARIANT_MIN_WEIGHT` and above also contribute their morphological families at
 * `VARIANT_DISCOUNT` of their weight, so "disagreed" finds a chunk that only says "disagreement"
 * — stored tokens are exact words and cannot be stemmed without a migration, so the bridging
 * happens here, on the query side. Weight-1 parts (the job description) stay unexpanded: they
 * are supporting vocabulary, and their variant families were most of the query's cost.
 */
function weighQueryTerms(query: Query): Map<string, number> {
  const parts = toParts(query)
  const weights = new Map<string, number>()
  const bump = (term: string, weight: number) =>
    weights.set(term, Math.max(weights.get(term) ?? 0, weight))

  for (const part of parts) {
    const expand = part.weight >= VARIANT_MIN_WEIGHT
    for (const term of tokenize(part.text)) {
      bump(term, part.weight)
      if (!expand) continue
      for (const variant of termVariants(term)) bump(variant, part.weight * VARIANT_DISCOUNT)
    }
  }

  return weights
}

function sumValues(counts: Record<string, number>): number {
  let total = 0
  for (const value of Object.values(counts)) total += value
  return total
}
