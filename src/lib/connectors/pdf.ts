import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

// Bundled with the extension: the CSP here forbids pulling the worker off a CDN.
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const task = getDocument({ data })

  try {
    const pdf = await task.promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(joinItems(content.items as TextItem[]))
    }
    return pages.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  } finally {
    await task.destroy()
  }
}

/**
 * pdf.js hands back positioned runs, not lines. `hasEOL` is the only line signal available,
 * and resumes lean on line breaks to keep one role per paragraph.
 */
function joinItems(items: TextItem[]): string {
  let text = ''
  for (const item of items) {
    text += item.str
    if (item.hasEOL) text += '\n'
    else if (!item.str.endsWith(' ')) text += ' '
  }
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
}
