import type { DetectedQuestion, JobContext } from '@/lib/types'

/** Company names can be long; keep the download from becoming a paragraph. */
const MAX_COMPANY_CHARS = 48

/**
 * A field the user typed into directly on the page counts as their answer, so an export
 * captures the whole application rather than only the parts Irke drafted.
 */
export function resolveAnswer(question: DetectedQuestion, draftValue: string | undefined): string {
  return (draftValue ?? '').trim() || question.currentValue.trim()
}

export function exportFilename(job: JobContext): string {
  const company = sanitizeFilename(job.company, MAX_COMPANY_CHARS)
  return company ? `${company} cover letter.pdf` : 'Cover letter.pdf'
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

function sanitizeFilename(value: string, maxChars: number): string {
  return value
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
    .trim()
}
