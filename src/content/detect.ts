import type { DetectedQuestion, Profile, QuestionInputKind } from '@/lib/types'

export const FIELD_ID_ATTRIBUTE = 'data-irke-field'

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const SUPPORTED_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'number', 'search', 'date'])

/** Anything a copilot must never touch: bot traps, credentials, uploads, verification. */
const BLOCKED_PATTERN =
  /captcha|recaptcha|hcaptcha|turnstile|honeypot|password|otp|verification|creditcard|card-number|ssn|social-security/i

const PROFILE_PATTERNS: [keyof Profile, RegExp][] = [
  ['email', /e-?mail/i],
  ['phone', /phone|mobile|telephone/i],
  ['linkedinUrl', /linked-?in/i],
  ['githubUrl', /git-?hub/i],
  ['portfolioUrl', /portfolio|personal (web)?site|website|blog/i],
  ['fullName', /(full|your)\s*name|^name$|preferred name/i],
  ['location', /location|city|where are you based|current residence/i],
  ['workAuthorization', /work authoriz|legally authorized|right to work|work permit/i],
  ['needsSponsorship', /sponsor/i],
  ['salaryExpectation', /salary|compensation expectation|desired (pay|compensation)/i],
  ['noticePeriod', /notice period/i],
  ['earliestStartDate', /start date|available to start|earliest.*start/i],
  ['pronouns', /pronoun/i],
]

let fieldCounter = 0

export function scanQuestions(root: ParentNode = document): DetectedQuestion[] {
  const questions: DetectedQuestion[] = []
  const seenRadioGroups = new Set<string>()

  const controls = [...root.querySelectorAll<FormControl>('input, textarea, select')]

  for (const control of controls) {
    if (!isEligible(control)) continue

    if (control instanceof HTMLInputElement && control.type === 'radio') {
      const groupKey = radioGroupKey(control)
      if (seenRadioGroups.has(groupKey)) continue
      seenRadioGroups.add(groupKey)
    }

    const label = resolveLabel(control)
    if (!label) continue

    questions.push(buildQuestion(control, label))
  }

  return questions
}

function isEligible(control: FormControl): boolean {
  if (control.disabled) return false
  if (!(control instanceof HTMLSelectElement) && control.readOnly) return false
  if (control.getAttribute('aria-hidden') === 'true') return false
  if (control instanceof HTMLInputElement) {
    if (!SUPPORTED_INPUT_TYPES.has(control.type) && !['radio', 'checkbox'].includes(control.type)) {
      return false
    }
  }

  const signature = `${control.name} ${control.id} ${control.className} ${control.getAttribute('autocomplete') ?? ''}`
  if (BLOCKED_PATTERN.test(signature)) return false

  return isVisible(control)
}

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  const rect = element.getBoundingClientRect()
  // Radios and checkboxes are often visually replaced by a styled span of zero-size input.
  if (rect.width === 0 && rect.height === 0) {
    return element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type)
  }
  return true
}

function radioGroupKey(input: HTMLInputElement): string {
  return input.name || (input.closest('fieldset')?.id ?? input.id)
}

function buildQuestion(control: FormControl, label: string): DetectedQuestion {
  let fieldId = control.getAttribute(FIELD_ID_ATTRIBUTE)
  if (!fieldId) {
    fieldId = `irke-${(fieldCounter += 1)}`
    control.setAttribute(FIELD_ID_ATTRIBUTE, fieldId)
  }

  const inputKind = resolveInputKind(control)
  const options = resolveOptions(control)
  const maxLength =
    'maxLength' in control && control.maxLength > 0 && control.maxLength < 100_000
      ? control.maxLength
      : null

  return {
    fieldId,
    label,
    inputKind,
    required: control.required || control.getAttribute('aria-required') === 'true',
    maxLength,
    options,
    currentValue: readValue(control),
    profileKey: matchProfileKey(label),
  }
}

function resolveInputKind(control: FormControl): QuestionInputKind {
  if (control instanceof HTMLTextAreaElement) return 'textarea'
  if (control instanceof HTMLSelectElement) return 'select'
  if (control instanceof HTMLInputElement && control.type === 'radio') return 'radio'
  if (control instanceof HTMLInputElement && control.type === 'checkbox') return 'checkbox'
  return 'text'
}

function resolveOptions(control: FormControl): string[] {
  if (control instanceof HTMLSelectElement) {
    return [...control.options]
      .map((option) => option.label.trim() || option.value.trim())
      .filter((option) => option && !/^(select|choose|--)/i.test(option))
  }

  if (control instanceof HTMLInputElement && control.type === 'radio' && control.name) {
    const siblings = document.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${cssEscape(control.name)}"]`,
    )
    return [...siblings].map((input) => resolveLabel(input, { forOption: true }) ?? input.value).filter(Boolean)
  }

  return []
}

function readValue(control: FormControl): string {
  if (control instanceof HTMLInputElement && ['radio', 'checkbox'].includes(control.type)) {
    return control.checked ? control.value : ''
  }
  return control.value ?? ''
}

function matchProfileKey(label: string): keyof Profile | null {
  for (const [key, pattern] of PROFILE_PATTERNS) if (pattern.test(label)) return key
  return null
}

interface LabelOptions {
  forOption?: boolean
}

/**
 * Walks the usual accessibility paths first, then falls back to nearby text, because many
 * ATS templates render the question as a plain div above the input.
 */
export function resolveLabel(control: FormControl, options: LabelOptions = {}): string | null {
  const ariaLabel = control.getAttribute('aria-label')
  if (ariaLabel?.trim()) return clean(ariaLabel)

  const labelledBy = control.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    if (text.trim()) return clean(text)
  }

  if (control.id) {
    const explicit = document.querySelector(`label[for="${cssEscape(control.id)}"]`)
    if (explicit?.textContent?.trim()) return clean(explicit.textContent)
  }

  const wrapping = control.closest('label')
  if (wrapping?.textContent?.trim()) return clean(wrapping.textContent)

  if (options.forOption) return null

  const legend = control.closest('fieldset')?.querySelector('legend')
  if (legend?.textContent?.trim()) return clean(legend.textContent)

  const nearby = findNearbyText(control)
  if (nearby) return clean(nearby)

  const placeholder = control.getAttribute('placeholder')
  return placeholder?.trim() ? clean(placeholder) : null
}

function findNearbyText(control: FormControl): string | null {
  let node: Element | null = control
  for (let depth = 0; node && depth < 4; depth += 1) {
    const container: Element | null = node.parentElement
    if (!container) return null

    for (const candidate of container.children) {
      if (candidate.contains(control)) continue
      if (candidate.matches('label, legend, p, span, div, h2, h3, h4')) {
        const text = candidate.textContent?.trim()
        if (text && text.length > 2 && text.length < 400) return text
      }
    }
    node = container
  }
  return null
}

function clean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[*✱]\s*$/, '')
    .trim()
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&')
}
