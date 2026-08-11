import { useEffect, useState } from 'react'

import { sendToBackground } from '@/lib/messages'
import { getSettings, saveSettings } from '@/lib/settings'

const TEST_FIELD_ID = 'dashboard-test'

export function GenerateTab() {
  const [question, setQuestion] = useState('')
  const [instructions, setInstructions] = useState('')
  const [draft, setDraft] = useState('')
  const [sources, setSources] = useState<string[]>([])
  const [needsInput, setNeedsInput] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    void getSettings().then((settings) => setInstructions(settings.extraInstructions))
  }, [])

  const onSaveInstructions = async () => {
    const settings = await getSettings()
    await saveSettings({ ...settings, extraInstructions: instructions })
    setSavedAt(Date.now())
  }

  const onGenerate = async () => {
    if (!question.trim()) {
      setError('Add a question first.')
      return
    }

    setBusy(true)
    setError(null)

    const response = await sendToBackground({
      type: 'bg:generate',
      job: {
        url: '',
        title: '',
        company: '',
        descriptionText: '',
        ats: 'manual',
      },
      question: {
        fieldId: TEST_FIELD_ID,
        label: question.trim(),
        required: false,
        maxLength: null,
        currentValue: '',
        topic: 'open_ended',
      },
      regenerate: true,
      extraInstructions: instructions,
    })

    setBusy(false)

    if (!response.ok) {
      setError(response.error)
      return
    }
    if (response.type !== 'generate') return

    setDraft(response.result.answer)
    setSources(response.result.sources)
    setNeedsInput(response.result.needsInput)
  }

  return (
    <section className="generate-layout">
      <div className="generate-settings">
        {error && <p className="notice error">{error}</p>}

        <div className="card generate-question-card">
          <div>
            <label htmlFor="gen-question">Question</label>
            <textarea
              id="gen-question"
              className="generate-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </div>
        </div>

        <div className="card stack">
          <h3>Instructions</h3>
          <textarea
            id="gen-instructions"
            rows={4}
            value={instructions}
            onChange={(event) => {
              setInstructions(event.target.value)
              setSavedAt(null)
            }}
          />
          <div className="save-bar">
            <button className="ghost" onClick={onSaveInstructions}>
              Save as default
            </button>
            {savedAt && <span className="badge success">Saved</span>}
          </div>
        </div>

        <button className="primary" disabled={busy} onClick={onGenerate}>
          {busy ? 'Drafting…' : 'Generate'}
        </button>
      </div>

      <div className="generate-output card stack">
        <div className="row space-between">
          <h3>Draft</h3>
          {(sources.length > 0 || needsInput) && (
            <div className="row">
              {needsInput && <span className="badge warning">Needs input</span>}
              {sources.map((source) => (
                <span key={source} className="badge">
                  {source}
                </span>
              ))}
            </div>
          )}
        </div>
        <textarea
          className="generate-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
    </section>
  )
}
