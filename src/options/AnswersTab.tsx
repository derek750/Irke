import { useEffect, useState } from 'react'

import { deleteAnswer, listAnswers, putAnswer } from '@/lib/db'
import type { AnswerBankEntry } from '@/lib/types'

export function AnswersTab() {
  const [answers, setAnswers] = useState<AnswerBankEntry[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const refresh = () => void listAnswers().then(setAnswers)
  useEffect(refresh, [])

  const onSave = async (entry: AnswerBankEntry) => {
    await putAnswer({ ...entry, answer: draft, updatedAt: Date.now() })
    setEditing(null)
    refresh()
  }

  const onDelete = async (id: string) => {
    await deleteAnswer(id)
    refresh()
  }

  return (
    <section className="section">
      <div>
        <h3>Answer bank</h3>
        <p className="hint">
          Answers you saved from the side panel. When the same question shows up again, Irke reuses
          these instead of calling the model.
        </p>
      </div>

      {answers.length === 0 && (
        <p className="hint">Empty. Save an answer from the side panel and it lands here.</p>
      )}

      <div className="doc-list">
        {answers.map((entry) => (
          <div key={entry.id} className="card stack">
            <div className="row">
              <strong style={{ flex: 1 }}>{entry.question}</strong>
              {entry.company && <span className="badge">{entry.company}</span>}
              <span className="badge">used {entry.useCount}×</span>
            </div>

            {editing === entry.id ? (
              <>
                <textarea value={draft} rows={6} onChange={(event) => setDraft(event.target.value)} />
                <div className="row">
                  <button className="primary" onClick={() => onSave(entry)}>
                    Save
                  </button>
                  <button className="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="hint" style={{ whiteSpace: 'pre-wrap' }}>
                  {entry.answer}
                </p>
                <div className="row">
                  <button
                    onClick={() => {
                      setEditing(entry.id)
                      setDraft(entry.answer)
                    }}
                  >
                    Edit
                  </button>
                  <button className="ghost danger" onClick={() => onDelete(entry.id)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
