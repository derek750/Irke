import { FIELD_ID_ATTRIBUTE, resolveLabel } from './detect'

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const HIGHLIGHT_DURATION_MS = 1600

export function fillField(fieldId: string, value: string): void {
  const control = findControl(fieldId)
  if (!control) throw new Error('That field is no longer on the page. Rescan and try again.')

  if (control instanceof HTMLSelectElement) {
    selectOption(control, value)
  } else if (control instanceof HTMLInputElement && control.type === 'radio') {
    checkRadio(control, value)
  } else if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    setChecked(control, /^(yes|true|on|checked|i agree|agree)$/i.test(value.trim()))
  } else {
    setText(control, value)
  }

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
function setText(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter ? setter.call(control, value) : (control.value = value)

  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function setChecked(input: HTMLInputElement, checked: boolean): void {
  if (input.checked === checked) return
  input.click()
  if (input.checked !== checked) {
    input.checked = checked
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
}

function selectOption(select: HTMLSelectElement, value: string): void {
  const target = normalize(value)
  const match =
    [...select.options].find((option) => normalize(option.label) === target || normalize(option.value) === target) ??
    [...select.options].find((option) => normalize(option.label).includes(target) && target.length > 1)

  if (!match) throw new Error(`No option on this dropdown matches "${value}".`)

  select.value = match.value
  select.dispatchEvent(new Event('input', { bubbles: true }))
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function checkRadio(input: HTMLInputElement, value: string): void {
  const target = normalize(value)
  const group = input.name
    ? [...document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${cssEscape(input.name)}"]`)]
    : [input]

  const match = group.find((option) => {
    const label = normalize(resolveLabel(option, { forOption: true }) ?? option.value)
    return label === target || (target.length > 1 && label.includes(target))
  })

  if (!match) throw new Error(`No radio option matches "${value}".`)
  setChecked(match, true)
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

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&')
}
