import { FIELD_ID_ATTRIBUTE, isUpload } from './detect'

type FormControl = HTMLInputElement | HTMLTextAreaElement

const HIGHLIGHT_DURATION_MS = 1600

export function fillField(fieldId: string, value: string): void {
  const control = findControl(fieldId)
  if (!control) throw new Error('That field is no longer on the page. Rescan and try again.')
  if (isUpload(control)) {
    throw new Error('That field takes a file — use Attach PDF.')
  }

  setText(control, value)
  scrollTo(control)
  flash(control)
}

/**
 * Set the generated PDF on the cover-letter file input, the way a picked file would land:
 * a real File in a DataTransfer, then the events upload widgets listen for. This is the one
 * write Irke ever makes to a file control, it only happens on an explicit click, and it never
 * touches the form's submit.
 */
export function attachFile(fieldId: string, filename: string, base64: string): void {
  const control = findControl(fieldId)
  if (!control) throw new Error('That field is no longer on the page. Rescan and try again.')
  if (!isUpload(control)) throw new Error('That field takes text — use Fill field.')

  const accept = (control.getAttribute('accept') ?? '').toLowerCase()
  if (accept && !accept.includes('pdf')) {
    throw new Error(`This upload does not accept PDFs (allowed: ${accept}). Download it instead.`)
  }

  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  const transfer = new DataTransfer()
  transfer.items.add(new File([bytes], filename, { type: 'application/pdf' }))

  const input = control as HTMLInputElement
  input.files = transfer.files
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))

  scrollTo(control)
  flash(control)
}

export function highlightField(fieldId: string): void {
  const control = findControl(fieldId)
  if (!control) throw new Error('That field is no longer on the page. Rescan and try again.')
  scrollTo(control)
  flash(control)
}

function findControl(fieldId: string): FormControl | null {
  return document.querySelector<FormControl>(`[${FIELD_ID_ATTRIBUTE}="${fieldId}"]`)
}

/**
 * React and other controlled inputs ignore a plain `value` assignment, so write through the
 * native setter and then dispatch the events their handlers listen for.
 */
function setText(control: FormControl, value: string): void {
  const prototype =
    control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter ? setter.call(control, value) : (control.value = value)

  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function scrollTo(control: FormControl): void {
  control.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function flash(control: FormControl): void {
  const previousOutline = control.style.outline
  const previousOffset = control.style.outlineOffset
  control.style.outline = '2px solid #6366f1'
  control.style.outlineOffset = '2px'
  setTimeout(() => {
    control.style.outline = previousOutline
    control.style.outlineOffset = previousOffset
  }, HIGHLIGHT_DURATION_MS)
}
