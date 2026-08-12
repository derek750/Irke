import type { DetectedQuestion, GeneratedAnswer, JobContext, PageScan } from './types'

export type ContentRequest =
  | { type: 'content:scan' }
  | { type: 'content:fill'; fieldId: string; value: string }
  | { type: 'content:highlight'; fieldId: string }

/** A frame does not know its own frame id; the background worker attaches it. */
export type FrameScan = Omit<PageScan, 'frameId'>

export type ContentResponse =
  | { ok: true; type: 'scan'; scan: FrameScan }
  | { ok: true; type: 'fill' }
  | { ok: true; type: 'highlight' }
  | { ok: false; error: string }

export type BackgroundRequest =
  | { type: 'bg:scanActiveTab' }
  | {
      type: 'bg:generate'
      job: JobContext
      question: DetectedQuestion
      regenerate: boolean
      /**
       * Answers already rejected for this question, oldest first. Sets both the retrieval
       * rotation and the do-not-repeat list, so each retry is new material and new wording.
       * Ignored when `currentDraft` is set — a refine has no rejected answers.
       */
      previousAnswers?: string[]
      /** When set, overrides Settings.extraInstructions for this call only. */
      extraInstructions?: string
      /** Added on top of whatever instructions apply, to steer this one answer. */
      steer?: string
      /**
       * Text the user wrote or edited themselves, sent when they regenerate over it. The
       * pipeline treats it as the base to build on — kept facts, kept story, normal temperature
       * — never as an attempt to avoid.
       */
      currentDraft?: string
    }
  | { type: 'bg:fill'; fieldId: string; value: string; frameId: number }
  | { type: 'bg:saveAnswer'; question: string; answer: string; company: string }
  /** Letterhead name, read from the context index when the setting is blank. */
  | { type: 'bg:resolveLetterheadName' }

export type BackgroundResponse =
  | { ok: true; type: 'scan'; scan: PageScan }
  | { ok: true; type: 'generate'; result: GeneratedAnswer }
  | { ok: true; type: 'fill' }
  | { ok: true; type: 'saveAnswer' }
  | { ok: true; type: 'letterheadName'; name: string | null }
  | { ok: false; error: string }

export async function sendToBackground(request: BackgroundRequest): Promise<BackgroundResponse> {
  try {
    return (await chrome.runtime.sendMessage(request)) as BackgroundResponse
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

export async function sendToTab(
  tabId: number,
  request: ContentRequest,
  frameId: number,
): Promise<ContentResponse> {
  try {
    return (await chrome.tabs.sendMessage(tabId, request, { frameId })) as ContentResponse
  } catch {
    return {
      ok: false,
      error: 'Cannot reach this page. Reload the tab after installing Irke, then try again.',
    }
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
