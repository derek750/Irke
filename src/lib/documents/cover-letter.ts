import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import boldFontUrl from '@/ui/fonts/lmroman10-bold.otf?url'
import regularFontUrl from '@/ui/fonts/lmroman10-regular.otf?url'
import type { JobContext, Letterhead } from '../types'

export interface CoverLetterInput {
  letterhead: Letterhead
  job: JobContext
  body: string
}

/** US Letter, 1 inch margins — what every ATS expects to receive. */
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 72
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

const NAME_SIZE = 19
const CONTACT_SIZE = 9.5
const META_SIZE = 10
const BODY_SIZE = 11
const BODY_LEADING = 1.5
const PARAGRAPH_GAP = 9

const INK = rgb(0.09, 0.09, 0.11)
const MUTED = rgb(0.36, 0.36, 0.4)
const RULE = rgb(0.75, 0.75, 0.78)

interface Faces {
  regular: PDFFont
  bold: PDFFont
  /** True for the built-in fallback, whose WinAnsi encoding throws on anything outside Latin-1. */
  latin1Only: boolean
}

interface Cursor {
  page: PDFPage
  y: number
}

export async function buildCoverLetterPdf(input: CoverLetterInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)

  const faces = await embedFaces(pdf)
  // Sanitize once, at the boundary, so no draw call can be handed a character the font lacks.
  const letter = prepare(input, faces.latin1Only)
  const cursor: Cursor = { page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN }

  drawLetterhead(cursor, faces, letter)
  drawOpening(cursor, faces, letter)
  drawBody(pdf, cursor, faces, letter.body)
  drawClosing(pdf, cursor, faces, letter.letterhead.name)

  pdf.setTitle(`Cover letter — ${input.job.title || 'Application'}`)
  pdf.setCreator('Irke')
  return pdf.save()
}

async function embedFaces(pdf: PDFDocument): Promise<Faces> {
  try {
    const [regular, bold] = await Promise.all([loadFont(regularFontUrl), loadFont(boldFontUrl)])
    return {
      regular: await pdf.embedFont(regular),
      bold: await pdf.embedFont(bold),
      latin1Only: false,
    }
  } catch {
    // Latin Modern is what makes the page read as LaTeX, but a letter in Times beats no letter.
    return {
      regular: await pdf.embedFont(StandardFonts.TimesRoman),
      bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
      latin1Only: true,
    }
  }
}

async function loadFont(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Font request failed (${response.status})`)
  return response.arrayBuffer()
}

function drawLetterhead(cursor: Cursor, faces: Faces, { letterhead }: CoverLetterInput): void {
  const name = letterhead.name.trim()
  if (name) {
    cursor.y -= NAME_SIZE
    cursor.page.drawText(name, {
      x: MARGIN,
      y: cursor.y,
      size: NAME_SIZE,
      font: faces.bold,
      color: INK,
    })
    cursor.y -= 12
  }

  const contact = [letterhead.email, letterhead.phone, letterhead.location, letterhead.links]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('  ·  ')

  if (contact) {
    cursor.page.drawText(contact, {
      x: MARGIN,
      y: cursor.y,
      size: CONTACT_SIZE,
      font: faces.regular,
      color: MUTED,
    })
    cursor.y -= 10
  }

  if (name || contact) {
    cursor.page.drawLine({
      start: { x: MARGIN, y: cursor.y },
      end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
      thickness: 0.6,
      color: RULE,
    })
    cursor.y -= 26
  }
}

function drawOpening(cursor: Cursor, faces: Faces, { job }: CoverLetterInput): void {
  const company = job.company.trim()
  const lines = [formatDate(), '', 'Hiring Team']
  if (company) lines.push(company)

  for (const line of lines) {
    if (line) {
      cursor.page.drawText(line, {
        x: MARGIN,
        y: cursor.y,
        size: META_SIZE,
        font: faces.regular,
        color: INK,
      })
    }
    cursor.y -= META_SIZE * 1.5
  }

  cursor.y -= 12
  cursor.page.drawText(salutation(job), {
    x: MARGIN,
    y: cursor.y,
    size: BODY_SIZE,
    font: faces.regular,
    color: INK,
  })
  cursor.y -= BODY_SIZE * BODY_LEADING + PARAGRAPH_GAP
}

function drawBody(pdf: PDFDocument, cursor: Cursor, faces: Faces, body: string): void {
  const lineHeight = BODY_SIZE * BODY_LEADING

  for (const paragraph of paragraphsOf(body)) {
    const lines = wrap(paragraph, faces.regular, BODY_SIZE, CONTENT_WIDTH)

    lines.forEach((line, index) => {
      if (cursor.y < MARGIN + lineHeight) nextPage(pdf, cursor)
      // The last line of a paragraph is left ragged; stretching it would gap the words out.
      drawLine(cursor.page, line, faces.regular, cursor.y, index === lines.length - 1)
      cursor.y -= lineHeight
    })

    cursor.y -= PARAGRAPH_GAP
  }
}

function drawClosing(pdf: PDFDocument, cursor: Cursor, faces: Faces, name: string): void {
  const lineHeight = BODY_SIZE * BODY_LEADING
  if (cursor.y < MARGIN + lineHeight * 3) nextPage(pdf, cursor)

  cursor.y -= 8
  for (const line of ['Sincerely,', '', name.trim()]) {
    if (line) {
      cursor.page.drawText(line, {
        x: MARGIN,
        y: cursor.y,
        size: BODY_SIZE,
        font: faces.regular,
        color: INK,
      })
    }
    cursor.y -= lineHeight
  }
}

/** Justified except on the final line: measure the slack, then spread it across the gaps. */
function drawLine(page: PDFPage, line: string, font: PDFFont, y: number, ragged: boolean): void {
  const words = line.split(' ')

  if (ragged || words.length < 2) {
    page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font, color: INK })
    return
  }

  const spaceWidth = font.widthOfTextAtSize(' ', BODY_SIZE)
  const wordsWidth = words.reduce((total, word) => total + font.widthOfTextAtSize(word, BODY_SIZE), 0)
  const gap = (CONTENT_WIDTH - wordsWidth) / (words.length - 1)

  let x = MARGIN
  for (const word of words) {
    page.drawText(word, { x, y, size: BODY_SIZE, font, color: INK })
    x += font.widthOfTextAtSize(word, BODY_SIZE) + Math.max(gap, spaceWidth * 0.6)
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ''

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }

  if (current) lines.push(current)
  return lines
}

function nextPage(pdf: PDFDocument, cursor: Cursor): void {
  cursor.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  cursor.y = PAGE_HEIGHT - MARGIN
}

function paragraphsOf(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}

function formatDate(): string {
  return new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function salutation({ company }: JobContext): string {
  return company.trim() ? `Dear ${company.trim()} Hiring Team,` : 'Dear Hiring Team,'
}

function prepare(input: CoverLetterInput, latin1Only: boolean): CoverLetterInput {
  const map = (value: string) => (latin1Only ? toLatin1(clean(value)) : clean(value))
  const { letterhead, job } = input

  return {
    body: map(input.body),
    job: { ...job, company: map(job.company), title: map(job.title) },
    letterhead: {
      name: map(letterhead.name),
      email: map(letterhead.email),
      phone: map(letterhead.phone),
      location: map(letterhead.location),
      links: map(letterhead.links),
    },
  }
}

/** Collapse the whitespace and invisible characters that model output tends to carry. */
function clean(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\t\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
}

/** Stroked letters carry no combining mark, so NFD leaves them for the filter to delete. */
const STROKED_LETTERS: Record<string, string> = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ŧ: 'T', ŧ: 't' }

/** Only for the fallback face: strip accents, then drop whatever WinAnsi still cannot encode. */
function toLatin1(text: string): string {
  return text
    .replace(/[ŁłĐđŦŧ]/g, (letter) => STROKED_LETTERS[letter] ?? letter)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    // Newlines survive because paragraph splitting still has to happen after this.
    .replace(/[^\n\u0020-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '')
}

