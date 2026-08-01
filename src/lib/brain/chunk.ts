import type { BrainChunk, BrainDoc, BrainDocKind } from '../types'
import { termFrequencies } from './tokenize'

const TARGET_CHUNK_CHARS = 900
const MAX_CHUNK_CHARS = 1400

export const KIND_TAGS: Record<BrainDocKind, string> = {
  resume: '[RESUME]',
  app_answer: '[PAST APPLICATION ANSWER]',
  about_me: '[ABOUT ME]',
  project: '[PROJECT]',
  writing: '[MY WRITING]',
}

export const KIND_LABELS: Record<BrainDocKind, string> = {
  resume: 'Resume',
  app_answer: 'Past application answer',
  about_me: 'About me',
  project: 'Project write-up',
  writing: 'Writing sample',
}

/**
 * Splits on blank lines, then packs paragraphs up to a target size so a chunk keeps
 * a full thought (one job, one answer) rather than an arbitrary character window.
 */
export function splitIntoPassages(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const passages: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHUNK_CHARS) {
      if (current) {
        passages.push(current)
        current = ''
      }
      passages.push(...hardWrap(paragraph))
      continue
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length > TARGET_CHUNK_CHARS && current) {
      passages.push(current)
      current = paragraph
      continue
    }
    current = candidate
  }

  if (current) passages.push(current)
  return passages
}

function hardWrap(paragraph: string): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/)
  const parts: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence
    if (candidate.length > TARGET_CHUNK_CHARS && current) {
      parts.push(current)
      current = sentence
      continue
    }
    current = candidate
  }

  if (current) parts.push(current)
  return parts
}

export function chunkDoc(doc: BrainDoc): BrainChunk[] {
  return splitIntoPassages(doc.text).map((passage, index) => {
    const text = `${KIND_TAGS[doc.kind]} ${doc.title}\n${passage}`
    return {
      id: `${doc.id}:${index}`,
      docId: doc.id,
      docTitle: doc.title,
      kind: doc.kind,
      text,
      tokens: termFrequencies(text),
    }
  })
}
