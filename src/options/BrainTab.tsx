import { useEffect, useRef, useState } from 'react'

import { KIND_LABELS, chunkDoc } from '@/lib/brain/chunk'
import { deleteDocAndChunks, listDocs, putDoc, replaceChunksForDoc } from '@/lib/db'
import { errorMessage } from '@/lib/messages'
import type { BrainDoc, BrainDocKind } from '@/lib/types'

const KIND_ORDER: BrainDocKind[] = ['resume', 'app_answer', 'about_me', 'project', 'writing']

const KIND_PLACEHOLDERS: Record<BrainDocKind, string> = {
  resume: 'Paste your resume as plain text. Keep one role per paragraph.',
  app_answer: 'Paste the question, then your answer. One question and answer per document.',
  about_me: 'Facts you want Irke to know: what you do, what you want next, strengths, constraints.',
  project: 'What the project was, your role, the stack, the outcome.',
  writing: 'A sample that sounds like you. Used for tone, not facts.',
}

export function BrainTab() {
  const [docs, setDocs] = useState<BrainDoc[]>([])
  const [kind, setKind] = useState<BrainDocKind>('resume')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = () => void listDocs().then(setDocs)
  useEffect(refresh, [])

  const onAdd = async () => {
    setError(null)
    if (!text.trim()) {
      setError('Paste some text first.')
      return
    }

    setIsSaving(true)
    try {
      const doc: BrainDoc = {
        id: crypto.randomUUID(),
        kind,
        title: title.trim() || KIND_LABELS[kind],
        text: text.trim(),
        createdAt: Date.now(),
      }
      await putDoc(doc)
      await replaceChunksForDoc(doc.id, chunkDoc(doc))
      setTitle('')
      setText('')
      refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsSaving(false)
    }
  }

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return
    const file = files[0]
    setError(null)

    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      setError('Text and Markdown files only. For a PDF resume, copy the text and paste it below.')
      return
    }

    setText(await file.text())
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''))
    if (fileInput.current) fileInput.current.value = ''
  }

  const onDelete = async (docId: string) => {
    await deleteDocAndChunks(docId)
    refresh()
  }

  return (
    <section className="section">
      <div>
        <h3>Brain</h3>
        <p className="hint">
          Everything here stays in this browser. Irke retrieves the most relevant pieces per question
          and grounds the draft in them.
        </p>
      </div>

      <div className="card stack">
        <div>
          <label htmlFor="doc-kind">Type</label>
          <select
            id="doc-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as BrainDocKind)}
          >
            {KIND_ORDER.map((option) => (
              <option key={option} value={option}>
                {KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="doc-title">Title</label>
          <input
            id="doc-title"
            value={title}
            placeholder={KIND_LABELS[kind]}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="doc-text">Content</label>
          <textarea
            id="doc-text"
            value={text}
            placeholder={KIND_PLACEHOLDERS[kind]}
            rows={9}
            onChange={(event) => setText(event.target.value)}
          />
        </div>

        {error && <div className="notice error">{error}</div>}

        <div className="row">
          <button className="primary" onClick={onAdd} disabled={isSaving}>
            {isSaving ? 'Indexing…' : 'Add to brain'}
          </button>
          <button className="ghost" onClick={() => fileInput.current?.click()}>
            Load .txt / .md
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.markdown"
            hidden
            onChange={(event) => void onUpload(event.target.files)}
          />
        </div>
      </div>

      <div className="doc-list">
        {docs.length === 0 && <p className="hint">Nothing in your brain yet. Start with your resume.</p>}
        {docs.map((doc) => (
          <div key={doc.id} className="doc-item">
            <span className="badge accent">{KIND_LABELS[doc.kind]}</span>
            <div className="doc-main">
              <div className="doc-title">{doc.title}</div>
              <div className="doc-preview">{doc.text.slice(0, 120)}</div>
            </div>
            <button className="ghost danger" onClick={() => onDelete(doc.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
