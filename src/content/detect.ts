import type { DetectedQuestion, StoryTopic } from '@/lib/types'

export const FIELD_ID_ATTRIBUTE = 'data-irke-field'

type FormControl = HTMLInputElement | HTMLTextAreaElement

/** Never touch: bot traps, credentials, uploads, verification. */
const BLOCKED_PATTERN =
  /captcha|recaptcha|hcaptcha|turnstile|honeypot|password|otp|verification|creditcard|card-number|ssn|social-security/i

/**
 * Identity, logistics, and demographics. Irke does not answer these — it has no profile to
 * answer them from, and guessing at them is exactly the failure mode we want to avoid.
 */
const SPECIFICS_PATTERN =
  /e-?mail|phone|mobile|telephone|first name|last name|full name|preferred name|^name$|address|street|city|state|zip|postal|country|linked-?in|git-?hub|portfolio|personal (web)?site|website|url|salary|compensation|desired pay|notice period|start date|available to start|sponsor|work authoriz|legally authorized|right to work|work permit|visa|pronoun|gender|race|ethnicit|veteran|disabilit|how did you hear|referr|referred by|school|university|degree|major|gpa|graduation|years of experience|date of birth|citizenship|relocat|willing to|do you have|have you ever|are you (currently|able|willing)/i

const TOPIC_PATTERNS: [StoryTopic, RegExp][] = [
  ['cover_letter', /cover letter|letter of (interest|motivation)/i],
  // Ordered before why_company: "why do you want to work in this role" is about the job, not the employer.
  [
    'why_role',
    /why (this|the) (role|position|job|opportunity)|interest(ed)? in (this|the) (role|position|job)|what (makes|made) you apply|why (do|would) you (want to )?(work|apply)[^?]*\b(this|the) (role|position|job|opportunity)\b/i,
  ],
  [
    'why_company',
    /why (do|would) you (want to |wanna )?(work|join|apply)|why (us|our (company|team|mission)|this company)|what (draws|attracts|excites|interests) you (to|about)|interest(ed)? in (us|our|working (at|for))/i,
  ],
  [
    'behavioral',
    /tell (us|me) about a time|describe a (time|situation|challenge|conflict|project|experience)|give (us|me) an example|a time when|how (did|do|would) you (handle|approach|deal|resolve)|walk (us|me) through/i,
  ],
  [
    'strengths',
    /strength|weakness|proud|accomplish|what makes you (a )?(good|great|strong|unique)|why (are|do) you (a good|think you)|best at|set(s)? you apart|value(s)? (do )?you (bring|add)/i,
  ],
  ['project', /project|something you (built|made|shipped)|portfolio|favorite (thing|work|problem)|what (have|did) you build/i],
  ['open_ended', /tell (us|me) about (yourself|you)|anything else|additional (info|information|comments)|share|describe|explain|why|how|what/i],
]

/** Below this a textarea is a one-liner (a link, a headline), not somewhere a story fits. */
const MIN_STORY_MAX_LENGTH = 120

let fieldCounter = 0

export function scanQuestions(root: ParentNode = document): DetectedQuestion[] {
  const questions: DetectedQuestion[] = []

  for (const control of root.querySelectorAll<FormControl>('input, textarea')) {
    if (!isEligible(control)) continue

    const label = resolveLabel(control)
    if (!label) continue

    const topic = classify(label, control)
    if (!topic) continue

    questions.push(buildQuestion(control, label, topic))
  }

  return questions
}

/**
 * The label alone decides whether a field is a story question. Returns null for specifics
 * (name, salary, work authorization) and for anything that reads like neither.
 */
export function classifyLabel(label: string): StoryTopic | null {
  if (SPECIFICS_PATTERN.test(label)) return null
  return TOPIC_PATTERNS.find(([, pattern]) => pattern.test(label))?.[0] ?? null
}

/**
 * Story answers only ever land in a textarea, or occasionally a long single-line input that an
 * ATS uses for a short "why us". Everything else on an application form is a specific.
 */
function classify(label: string, control: FormControl): StoryTopic | null {
  const matched = classifyLabel(label)

  if (control instanceof HTMLTextAreaElement) {
    if (SPECIFICS_PATTERN.test(label)) return null
    if (control.maxLength > 0 && control.maxLength < MIN_STORY_MAX_LENGTH) return null
    // A textarea is already a strong signal on its own, so an unrecognized prompt still counts.
    return matched ?? 'open_ended'
  }

  // A bare text input needs to name the story outright; open_ended is too loose a signal here.
  return matched && matched !== 'open_ended' ? matched : null
}

function isEligible(control: FormControl): boolean {
  if (control.disabled || control.readOnly) return false
  if (control.getAttribute('aria-hidden') === 'true') return false
  if (control instanceof HTMLInputElement && control.type !== 'text') return false

  const signature = `${control.name} ${control.id} ${control.className} ${control.getAttribute('autocomplete') ?? ''}`
  if (BLOCKED_PATTERN.test(signature)) return false

  return isVisible(control)
}

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0
}

function buildQuestion(control: FormControl, label: string, topic: StoryTopic): DetectedQuestion {
  let fieldId = control.getAttribute(FIELD_ID_ATTRIBUTE)
  if (!fieldId) {
    fieldId = `irke-${(fieldCounter += 1)}`
    control.setAttribute(FIELD_ID_ATTRIBUTE, fieldId)
  }

  return {
    fieldId,
    label,
    topic,
    required: control.required || control.getAttribute('aria-required') === 'true',
    maxLength: control.maxLength > 0 && control.maxLength < 100_000 ? control.maxLength : null,
    currentValue: control.value ?? '',
  }
}

/**
 * Walks the usual accessibility paths first, then falls back to nearby text, because many
 * ATS templates render the question as a plain div above the input.
 */
export function resolveLabel(control: FormControl): string | null {
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
