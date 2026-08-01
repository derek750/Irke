import { useCallback, useState } from 'react'

import { sendToBackground } from '@/lib/messages'
import type { DetectedQuestion, GeneratedAnswer, JobContext } from '@/lib/types'

export interface DraftState {
  value: string
  status: 'idle' | 'generating' | 'ready' | 'filled'
  source: GeneratedAnswer['source'] | null
  sources: string[]
  needsInput: boolean
  error: string | null
}

const EMPTY_DRAFT: DraftState = {
  value: '',
  status: 'idle',
  source: null,
  sources: [],
  needsInput: false,
  error: null,
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

  const generate = useCallback(
    async (job: JobContext, question: DetectedQuestion, regenerate: boolean) => {
      patch(question.fieldId, { status: 'generating', error: null })

      const response = await sendToBackground({ type: 'bg:generate', job, question, regenerate })
      if (!response.ok) {
        patch(question.fieldId, { status: 'idle', error: response.error })
        return
      }
      if (response.type !== 'generate') return

      const { result } = response
      patch(question.fieldId, {
        value: result.answer,
        status: 'ready',
        source: result.source,
        sources: result.sources,
        needsInput: result.needsInput,
        error: null,
      })
    },
    [patch],
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

  const save = useCallback(
    async (question: DetectedQuestion, company: string) => {
      const value = drafts[question.fieldId]?.value ?? ''
      if (!value.trim()) return

      const response = await sendToBackground({
        type: 'bg:saveAnswer',
        question: question.label,
        answer: value,
        company,
      })
      if (!response.ok) patch(question.fieldId, { error: response.error })
    },
    [drafts, patch],
  )

  return { drafts, setValue, generate, fill, save, reset }
}
