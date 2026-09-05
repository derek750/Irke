import { deleteDocAndChunks, listDocs, saveDoc } from '../db'
import { complete } from '../llm'
import { getSettings } from '../settings'
import type { ContextDoc } from '../types'
import { distilledDocId, distilledParentId } from './chunk'

/** Past this the doc is truncated for the distillation call; notes only need the substance. */
const MAX_DOC_CHARS = 16000
/** A distillate shorter than this said nothing worth indexing; skip rather than store noise. */
const MIN_DISTILLATE_CHARS = 40

/**
 * The controlled vocabulary for story types — deliberately the words application questions use
 * ("tell us about a conflict / a missed deadline"), because the entire point of the notes is to
 * be findable by those questions when the original prose used different words.
 */
const STORY_TYPES =
  'conflict, disagreement, teamwork, leadership, mentoring, teaching, failure, missed deadline, time pressure, initiative, ownership, learning, motivation, debugging, communication, project'

export interface DistillResult {
  distilled: number
  skipped: number
  /** Distilled docs whose parent no longer exists, removed as part of the run. */
  pruned: number
  total: number
}

export function buildDistillSystemPrompt(): string {
  return [
    "You index a job applicant's personal documents so that future searches find the right story. Rewrite the document below as compact markdown notes.",
    '',
    'Format:',
    `- One "## Story: {short name}" section per distinct experience or anecdote in the document. Give each a "Type:" line choosing from: ${STORY_TYPES}. Then one line each for Situation, Action, Outcome.`,
    '- One "## Key facts" section with a bullet list for everything else worth finding: skills, employers, dates, motivations, projects.',
    '- Omit any section with nothing to say. If the document holds no stories and no facts, return exactly SKIP.',
    '',
    'Hard rules:',
    '- Every fact must come from the document. Never add, infer, or embellish names, employers, dates, numbers, technologies, or outcomes.',
    '- Keep proper nouns, numbers, and technology names exactly as written.',
    '- Plain declarative sentences. No praise, no marketing language.',
    '- Return only the markdown. No preamble, no code fences, no commentary.',
  ].join('\n')
}

export function buildDistillUserPrompt(doc: ContextDoc): string {
  return [`# ${doc.title}`, '', doc.text.slice(0, MAX_DOC_CHARS)].join('\n')
}

/**
 * One LLM call per eligible document (any chat provider, including Anthropic), writing markdown
 * notes into the index under `source: 'distilled'`. Originals stay untouched; notes for a
 * changed document go stale by timestamp and are redone on the next run; notes whose parent is
 * gone are pruned. Prior drafts and existing notes are never distilled.
 */
export async function distillContext(options?: { rebuild?: boolean }): Promise<DistillResult> {
  const settings = await getSettings()
  if (!settings.apiKey.trim()) {
    throw new Error('No API key set. Add your provider key in Settings before distilling.')
  }
  const docs = await listDocs()

  const byId = new Map(docs.map((doc) => [doc.id, doc]))
  const notes = new Map(
    docs
      .filter((doc) => doc.source === 'distilled')
      .map((doc) => [distilledParentId(doc.id) ?? '', doc]),
  )

  // Notes whose source document is gone (deleted by hand or dropped by a sync).
  let pruned = 0
  for (const [parentId, note] of notes) {
    if (byId.has(parentId)) continue
    await deleteDocAndChunks(note.id)
    notes.delete(parentId)
    pruned += 1
  }

  const eligible = docs.filter((doc) => doc.source !== 'generated' && doc.source !== 'distilled')

  let distilled = 0
  let skipped = 0
  let consecutiveFailures = 0
  let lastError = ''
  for (const doc of eligible) {
    const existing = notes.get(doc.id)
    if (!options?.rebuild && existing && existing.createdAt >= doc.createdAt) {
      skipped += 1
      continue
    }

    try {
      const markdown = await complete({
        settings,
        system: buildDistillSystemPrompt(),
        user: buildDistillUserPrompt(doc),
      })
      consecutiveFailures = 0
      const cleaned = stripFences(markdown)
      if (cleaned === 'SKIP' || cleaned.length < MIN_DISTILLATE_CHARS) {
        skipped += 1
        continue
      }

      await saveDoc({
        id: distilledDocId(doc.id),
        source: 'distilled',
        title: `Notes — ${doc.title}`,
        text: cleaned,
        createdAt: Date.now(),
      })
      distilled += 1
    } catch (error) {
      // One bad call should not sink the batch — but three in a row is a broken key or provider,
      // not three unlucky documents. Finished notes are already saved; stop burning calls.
      skipped += 1
      consecutiveFailures += 1
      lastError = error instanceof Error ? error.message : String(error)
      if (consecutiveFailures >= 3) {
        throw new Error(
          `Distilling keeps failing (${lastError}). ${distilled ? `${distilled} document(s) finished before stopping.` : 'Nothing was distilled.'}`,
        )
      }
    }
  }

  return { distilled, skipped, pruned, total: eligible.length }
}

function stripFences(markdown: string): string {
  return markdown
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
}
