import { FIELD_ID_ATTRIBUTE } from './detect'

type FormControl = HTMLInputElement | HTMLTextAreaElement

const HIGHLIGHT_DURATION_MS = 1600

export function fillField(fieldId: string, value: string): void {
  const control = findControl(fieldId)
  if (!control) throw new Error('That field is no longer on the page. Rescan and try again.')

  setText(control, value)
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
