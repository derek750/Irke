import { useCallback, useState } from 'react'

import { sendToBackground } from '@/lib/messages'
import type { DetectedQuestion, GeneratedAnswer, JobContext } from '@/lib/types'

export interface DraftState {
  value: string
  status: 'idle' | 'generating' | 'ready' | 'filled'
  source: GeneratedAnswer['source'] | null
  sources: string[]
  /** Sources the steer pulled into retrieval, so the panel can show the nudge landed. */
  steeredSources: string[]
  /** The semantic index exists but could not be reached for this draft (keyword match only). */
  degraded: boolean
  needsInput: boolean
  error: string | null
  /** What the answer bank already holds, so an untouched draft is never rewritten. */
  savedValue: string | null
  /** Optional per-question nudge, added to the standing instructions on every generate. */
  steer: string
  /** Every answer generated for this field this session, oldest first. Regenerating appends. */
  history: string[]
}

const EMPTY_DRAFT: DraftState = {
  value: '',
  status: 'idle',
  source: null,
  sources: [],
  steeredSources: [],
  degraded: false,
  needsInput: false,
  error: null,
  savedValue: null,
  steer: '',
  history: [],
}

export function useDrafts() {
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})

  const patch = useCallback((fieldId: string, changes: Partial<DraftState>) => {
    setDrafts((current) => ({
      ...current,
      [fieldId]: { ...EMPTY_DRAFT, ...current[fieldId], ...changes },
    }))
  }, [])

  const reset = useCallback(() => setDrafts({}), [])

  const setValue = useCallback(
    (fieldId: string, value: string) => patch(fieldId, { value, status: 'ready', error: null }),
    [patch],
  )

  const setSteer = useCallback(
    (fieldId: string, steer: string) => patch(fieldId, { steer }),
    [patch],
  )

  const generate = useCallback(
    async (job: JobContext, question: DetectedQuestion, regenerate: boolean) => {
      patch(question.fieldId, { status: 'generating', error: null })

      const draft = drafts[question.fieldId]
      const value = draft?.value ?? ''
      const attempts = draft?.history ?? []
      // Text the user typed or edited is a commitment, not a rejection: the retry must build on
      // it (refine). An untouched generated draft is the opposite — everything seen so far is
      // off the table and the retry goes looking for a different answer.
      const isEdited = value.trim().length > 0 && !attempts.includes(value)
      const rejected = regenerate && !isEdited ? [...attempts, value] : []

      const response = await sendToBackground({
        type: 'bg:generate',
        job,
        question,
        regenerate,
        steer: draft?.steer.trim() || undefined,
        previousAnswers: rejected.length ? rejected : undefined,
        currentDraft: regenerate && isEdited ? value : undefined,
      })
      if (!response.ok) {
        patch(question.fieldId, { status: 'idle', error: response.error })
        return
      }
      if (response.type !== 'generate') return

      const { result } = response
      const history = [...(draft?.history ?? []).filter((entry) => entry !== result.answer), result.answer]
      patch(question.fieldId, {
        value: result.answer,
        status: 'ready',
        source: result.source,
        sources: result.sources,
        steeredSources: result.steeredSources ?? [],
        degraded: result.degradedRetrieval ?? false,
        needsInput: result.needsInput,
        error: null,
        // The generate pipeline banks its own output, so this is already stored.
        savedValue: result.answer,
        history,
      })
    },
    [drafts, patch],
  )

  /** Flip back to an earlier attempt. The answer bank kept them all; this is how they are reached. */
  const showVersion = useCallback(
    (fieldId: string, index: number) => {
      const value = drafts[fieldId]?.history[index]
      if (value !== undefined) patch(fieldId, { value, status: 'ready', error: null })
    },
    [drafts, patch],
  )

  const fill = useCallback(
    async (fieldId: string, frameId: number) => {
      const value = drafts[fieldId]?.value ?? ''
      if (!value.trim()) return

      const response = await sendToBackground({ type: 'bg:fill', fieldId, value, frameId })
      patch(fieldId, response.ok ? { status: 'filled', error: null } : { error: response.error })
    },
    [drafts, patch],
  )

  /**
   * Banks whatever the user has ended up with. Generation already saves its own output, so this
   * only has work to do once a draft has been edited by hand.
   */
  const commit = useCallback(
    async (question: DetectedQuestion, company: string) => {
      const draft = drafts[question.fieldId]
      if (!draft?.value.trim() || draft.value === draft.savedValue) return

      const response = await sendToBackground({
        type: 'bg:saveAnswer',
        question: question.label,
        answer: draft.value,
        company,
      })
      patch(
        question.fieldId,
        response.ok ? { savedValue: draft.value } : { error: response.error },
      )
    },
    [drafts, patch],
  )

  return { drafts, setValue, setSteer, generate, showVersion, fill, commit, reset }
}
