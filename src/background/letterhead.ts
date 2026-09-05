import { retrieve } from '@/lib/context/retrieve'
import { listChunks } from '@/lib/db'
import { complete } from '@/lib/llm'
import { getSettings } from '@/lib/settings'
import type { Settings } from '@/lib/types'

const CACHE_KEY = 'irke:letterheadName'
const NAME_QUERY = 'resume curriculum vitae contact details full name email phone'
const MAX_EXCERPTS = 4
const MAX_EXCERPT_CHARS = 400
/** Longer than this and the model answered with a sentence instead of a name. */
const MAX_NAME_CHARS = 60

const SYSTEM_PROMPT = [
  'You read excerpts from a job candidate\'s own documents and report the name they go by.',
  'Answer with the name alone: no punctuation, no titles, no explanation, no quotes.',
  'If the excerpts do not clearly state whose documents these are, answer exactly UNKNOWN.',
].join(' ')

/**
 * A cover letter has to be signed, but Irke deliberately stores no profile. When the Letterhead
 * name is blank, read it out of the user's own material and cache the hit so it costs one model
 * call ever. Misses are not cached, so adding a resume later just works.
 */
export async function resolveLetterheadName(): Promise<string | null> {
  const settings = await getSettings()
  const typed = settings.letterhead.name.trim()
  if (typed) return typed

  const cached = await readCache()
  if (cached) return cached

  const found = await extractName(settings)
  if (found) await chrome.storage.local.set({ [CACHE_KEY]: found })
  return found
}

async function readCache(): Promise<string | null> {
  const stored = await chrome.storage.local.get(CACHE_KEY)
  const value = stored[CACHE_KEY]
  return typeof value === 'string' && value ? value : null
}

async function extractName(settings: Settings): Promise<string | null> {
  const chunks = await listChunks()
  if (!chunks.length) return null

  const retrieved = retrieve(NAME_QUERY, chunks, { limit: MAX_EXCERPTS })
  if (!retrieved.length) return null

  const excerpts = retrieved
    .map((entry) => entry.chunk.text.slice(0, MAX_EXCERPT_CHARS))
    .join('\n\n---\n\n')

  try {
    const answer = await complete({
      settings,
      system: SYSTEM_PROMPT,
      user: `Excerpts:\n\n${excerpts}\n\nWhose documents are these?`,
    })
    return cleanName(answer)
  } catch {
    // No key, no network, no name. The letter falls back to leaving the signature blank.
    return null
  }
}

function cleanName(answer: string): string | null {
  const name = answer.trim().replace(/^["']|["'.]$/g, '').trim()
  if (!name || name.length > MAX_NAME_CHARS) return null
  if (/^unknown$/i.test(name)) return null
  return name
}
