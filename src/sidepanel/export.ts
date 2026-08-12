import type { DetectedQuestion, JobContext } from '@/lib/types'

export type ExportFormat = 'pdf' | 'tex'

const MIME_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  tex: 'application/x-tex;charset=utf-8',
}

/** Per-segment filename caps. A question label can be a whole paragraph on some forms. */
const MAX_COMPANY_CHARS = 24
const MAX_TITLE_CHARS = 32

/**
 * A field the user typed into directly on the page counts as their answer, so an export
 * captures the whole application rather than only the parts Irke drafted.
 */
export function resolveAnswer(question: DetectedQuestion, draftValue: string | undefined): string {
  return (draftValue ?? '').trim() || question.currentValue.trim()
}

export function exportFilename(format: ExportFormat, job: JobContext): string {
  const parts = [
    'cover-letter',
    slugify(job.company, MAX_COMPANY_CHARS),
    slugify(job.title, MAX_TITLE_CHARS),
  ].filter(Boolean)

  return `${parts.join('-')}.${format}`
}

export function downloadFile(
  filename: string,
  data: string | Uint8Array,
  format: ExportFormat,
): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: MIME_TYPES[format] }))

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

function slugify(value: string, maxChars: number): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxChars)
    .replace(/^-+|-+$/g, '')
}
