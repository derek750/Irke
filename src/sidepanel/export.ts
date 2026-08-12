import type { DetectedQuestion, JobContext, StoryTopic } from '@/lib/types'

export type ExportFormat = 'md' | 'txt'

export interface ExportEntry {
  label: string
  topic: StoryTopic
  answer: string
}

const MIME_TYPES: Record<ExportFormat, string> = {
  md: 'text/markdown;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
}

const UNANSWERED = {
  md: '_(not answered yet)_',
  txt: '(not answered yet)',
} as const

/** Per-segment filename caps. A question label can be a whole paragraph on some forms. */
const MAX_COMPANY_CHARS = 24
const MAX_TITLE_CHARS = 32
const MAX_LABEL_CHARS = 32
const MAX_UNDERLINE_CHARS = 72

/**
 * A field the user typed into directly on the page counts as their answer, so an export
 * captures the whole application rather than only the parts Irke drafted.
 */
export function toExportEntry(
  question: DetectedQuestion,
  draftValue: string | undefined,
): ExportEntry {
  return {
    label: question.label,
    topic: question.topic,
    answer: (draftValue ?? '').trim() || question.currentValue.trim(),
  }
}

export function buildExport(format: ExportFormat, job: JobContext, entries: ExportEntry[]): string {
  const heading = [job.title || 'Untitled role', job.company].filter(Boolean).join(' — ')
  const meta = [
    job.url ? `Source: ${job.url}` : null,
    job.ats ? `Applicant tracking system: ${job.ats}` : null,
    `Exported: ${new Date().toLocaleDateString()}`,
  ].filter((line): line is string => line !== null)

  const blocks =
    format === 'md'
      ? [`# ${heading}`, meta.map((line) => `- ${line}`).join('\n')]
      : [underlined(heading, '='), meta.join('\n')]

  for (const entry of entries) {
    const answer = entry.answer || UNANSWERED[format]
    blocks.push(format === 'md' ? `## ${entry.label}` : underlined(entry.label, '-'), answer)
  }

  return `${blocks.join('\n\n')}\n`
}

export function exportFilename(format: ExportFormat, job: JobContext, label?: string): string {
  const parts = [
    'irke',
    slugify(job.company, MAX_COMPANY_CHARS),
    slugify(job.title, MAX_TITLE_CHARS),
    slugify(label ?? 'answers', MAX_LABEL_CHARS) || 'answers',
  ].filter(Boolean)

  return `${parts.join('-')}.${format}`
}

export function downloadText(filename: string, text: string): void {
  const format = filename.endsWith('.md') ? 'md' : 'txt'
  const url = URL.createObjectURL(new Blob([text], { type: MIME_TYPES[format] }))

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Revoking in the same tick cancels the download before Chrome has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function underlined(text: string, character: string): string {
  return `${text}\n${character.repeat(Math.min(text.length, MAX_UNDERLINE_CHARS))}`
}

function slugify(value: string, maxChars: number): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxChars)
    .replace(/^-+|-+$/g, '')
}
