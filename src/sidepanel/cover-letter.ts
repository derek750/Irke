import { sendToBackground } from '@/lib/messages'
import { getSettings } from '@/lib/settings'
import type { JobContext } from '@/lib/types'

import { exportFilename } from './export'

interface CoverLetterFile {
  filename: string
  bytes: Uint8Array
}

export async function buildCoverLetterFile(job: JobContext, body: string): Promise<CoverLetterFile> {
  // pdf-lib and the embedded fonts are most of the panel's weight, and most questions never
  // need them, so the typesetter is only pulled in once someone actually attaches or downloads.
  const { buildCoverLetterPdf } = await import('@/lib/documents/cover-letter')

  const { letterhead } = await getSettings()
  const input = { job, body, letterhead: { ...letterhead, name: await resolveName(letterhead.name) } }

  return {
    filename: exportFilename(job),
    bytes: await buildCoverLetterPdf(input),
  }
}

/** Blank Letterhead name means "find it in my own documents" — the background does the lookup. */
async function resolveName(configured: string): Promise<string> {
  if (configured.trim()) return configured.trim()

  const response = await sendToBackground({ type: 'bg:resolveLetterheadName' })
  return response.ok && response.type === 'letterheadName' ? (response.name ?? '') : ''
}
