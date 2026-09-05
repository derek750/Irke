import { useState } from 'react'

interface AddQuestionProps {
  /** `prompt` seeds the new card's extra instructions, so it steers retrieval and the draft. */
  onAdd: (label: string, prompt: string) => void
}

/** Composer for a question the scan missed, or for a page Irke could not read at all. */
export function AddQuestion({ onAdd }: AddQuestionProps) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [prompt, setPrompt] = useState('')

  const close = () => {
    setOpen(false)
    setLabel('')
    setPrompt('')
  }

  const submit = () => {
    if (!label.trim()) return
    onAdd(label.trim(), prompt.trim())
    close()
  }

  if (!open) {
    return (
      <button className="ghost add-question-toggle" onClick={() => setOpen(true)}>
        + Add a question
      </button>
    )
  }

  return (
    <article className="question-card add-question">
      <div className="question-body">
        <div>
          <label htmlFor="manual-question">Question</label>
          <textarea
            id="manual-question"
            rows={2}
            autoFocus
            value={label}
            placeholder="Tell us about a time you disagreed with a teammate."
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="manual-prompt">Prompt (optional)</label>
          <textarea
            id="manual-prompt"
            rows={2}
            value={prompt}
            placeholder="Focus on the CubeSat work. Keep it under 200 words."
            onChange={(event) => setPrompt(event.target.value)}
          />
        </div>

        <div className="question-actions">
          <button className="primary" disabled={!label.trim()} onClick={submit}>
            Add
          </button>
          <button className="ghost" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </article>
  )
}
