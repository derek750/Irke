import type { ContextChunk, ContextDoc, ContextSource } from '../types'
import { termFrequencies } from './tokenize'

const TARGET_CHUNK_CHARS = 900
const MAX_CHUNK_CHARS = 1400

export const SOURCE_TAGS: Record<ContextSource, string> = {
  story: '[MY STORY]',
  document: '[MY DOCUMENT]',
  drive: '[GOOGLE DRIVE]',
  github: '[GITHUB]',
}

export const SOURCE_LABELS: Record<ContextSource, string> = {
  story: 'Story',
  document: 'Document',
  drive: 'Google Drive',
  github: 'GitHub',
}

/**
 * Splits on blank lines, then packs paragraphs up to a target size so a chunk keeps
 * a full thought (one story, one project) rather than an arbitrary character window.
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

export function chunkDoc(doc: ContextDoc): ContextChunk[] {
  return splitIntoPassages(doc.text).map((passage, index) => {
    const text = `${SOURCE_TAGS[doc.source]} ${doc.title}\n${passage}`
    return {
      id: `${doc.id}:${index}`,
      docId: doc.id,
      docTitle: doc.title,
      source: doc.source,
      text,
      tokens: termFrequencies(text),
    }
  })
}
