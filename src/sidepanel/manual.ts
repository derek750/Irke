import { classifyLabel } from '@/content/detect'
import type { DetectedQuestion } from '@/lib/types'

/**
 * Questions the user typed into the panel instead of ones the scan found. The prefix is what
 * keeps fill and attach away from them — there is no control on the page behind a typed
 * question — and what lets a rescan clear the page's drafts while leaving the user's own alone.
 */
const MANUAL_FIELD_PREFIX = 'manual:'

let counter = 0

export function isManualField(fieldId: string): boolean {
  return fieldId.startsWith(MANUAL_FIELD_PREFIX)
}

/**
 * Routed through the same `classifyLabel` the scan uses, so a typed "Cover letter" gets the
 * letter treatment (length guidance, a downloadable PDF). Labels it refuses — the specifics
 * detection drops on a real form — still draft as open-ended prose here: this one was asked for
 * by hand and the answer only ever lands in the panel.
 */
export function createManualQuestion(label: string): DetectedQuestion {
  counter += 1

  return {
    fieldId: `${MANUAL_FIELD_PREFIX}${counter}`,
    label,
    required: false,
    maxLength: null,
    currentValue: '',
    topic: classifyLabel(label) ?? 'open_ended',
    control: 'text',
  }
}
