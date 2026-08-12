import type { DetectedQuestion, JobContext } from '@/lib/types'

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

export function exportFilename(job: JobContext): string {
  const parts = [
    'cover-letter',
    slugify(job.company, MAX_COMPANY_CHARS),
    slugify(job.title, MAX_TITLE_CHARS),
  ].filter(Boolean)

  return `${parts.join('-')}.pdf`
}

export function downloadPdf(filename: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Revoking in the same tick cancels the download before Chrome has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Chrome messages are JSON, so PDF bytes travel to the content script as base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return btoa(binary)
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
