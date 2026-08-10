import { useEffect, useState } from 'react'

import { sendToBackground } from '@/lib/messages'
import { getSettings, saveSettings } from '@/lib/settings'
import type { StoryTopic } from '@/lib/types'

const TOPIC_LABELS: Record<StoryTopic, string> = {
  cover_letter: 'Cover letter',
  why_company: 'Why this company',
  why_role: 'Why this role',
  behavioral: 'Behavioral / tell us about a time',
  strengths: 'Strengths',
  project: 'Project',
  open_ended: 'Open-ended',
}

const TEST_FIELD_ID = 'dashboard-test'

export function GenerateTab() {
  const [question, setQuestion] = useState('')
  const [topic, setTopic] = useState<StoryTopic>('open_ended')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [jd, setJd] = useState('')
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
        title: title.trim(),
        company: company.trim(),
        descriptionText: jd.trim(),
        ats: 'manual',
      },
      question: {
        fieldId: TEST_FIELD_ID,
        label: question.trim(),
        required: false,
        maxLength: null,
        currentValue: '',
        topic,
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
    <section className="section">
      <div>
        <h3>Generate</h3>
        <p className="hint">
          Try a draft against your indexed context without leaving the dashboard. Uses the same
          retrieval + LLM path as the side panel. Skips the answer bank so you always get a fresh
          model call.
        </p>
      </div>

      {error && <p className="notice error">{error}</p>}

      <div className="card stack">
        <div>
          <h3>Question context</h3>
          <p className="hint">
            The question to answer, plus optional role details so retrieval can match the right
            stories.
          </p>
        </div>

        <div>
          <label htmlFor="gen-question">Question</label>
          <textarea
            id="gen-question"
            rows={3}
            value={question}
            placeholder='e.g. Tell us about a time you had to navigate ambiguity.'
            onChange={(event) => setQuestion(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="gen-topic">Question type</label>
          <select
            id="gen-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value as StoryTopic)}
          >
            {(Object.keys(TOPIC_LABELS) as StoryTopic[]).map((key) => (
              <option key={key} value={key}>
                {TOPIC_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid-2">
          <div>
            <label htmlFor="gen-title">Role title</label>
            <input
              id="gen-title"
              value={title}
              placeholder="Optional"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="gen-company">Company</label>
            <input
              id="gen-company"
              value={company}
              placeholder="Optional"
              onChange={(event) => setCompany(event.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="gen-jd">Job description</label>
          <textarea
            id="gen-jd"
            rows={5}
            value={jd}
            placeholder="Paste a JD excerpt if you want retrieval steered toward this role. Optional."
            onChange={(event) => setJd(event.target.value)}
          />
        </div>
      </div>

      <div className="card stack">
        <div>
          <h3>Instructions</h3>
          <p className="hint">
            Extra direction for the model — tone, what to emphasize, what to avoid. Applied on top of
            Irke&apos;s base prompt. Save to reuse on real applications too.
          </p>
        </div>

        <div>
          <label htmlFor="gen-instructions">Steer the draft</label>
          <textarea
            id="gen-instructions"
            rows={4}
            value={instructions}
            placeholder="e.g. Keep it direct and plain. Lead with the shipping story. No corporate buzzwords."
            onChange={(event) => {
              setInstructions(event.target.value)
              setSavedAt(null)
            }}
          />
        </div>

        <div className="save-bar">
          <button className="ghost" onClick={onSaveInstructions}>
            Save as default
          </button>
          {savedAt && <span className="badge success">Saved</span>}
        </div>
      </div>

      <div className="card stack">
        <div className="row space-between">
          <div>
            <h3>Draft</h3>
            <p className="hint">Grounded in your indexed material when anything matches.</p>
          </div>
          <button className="primary" disabled={busy} onClick={onGenerate}>
            {busy ? 'Drafting…' : 'Generate'}
          </button>
        </div>

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

        <textarea
          rows={12}
          value={draft}
          placeholder={busy ? 'Drafting…' : 'Generate to see a draft here.'}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
    </section>
  )
}
