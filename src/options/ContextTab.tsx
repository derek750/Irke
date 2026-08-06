import { useCallback, useEffect, useRef, useState } from 'react'

import { readUploadedFile } from '@/lib/connectors/sync'
import { buildContextIndex } from '@/lib/context/build-index'
import { SOURCE_LABELS } from '@/lib/context/chunk'
import { deleteDocAndChunks, listChunks, listDocs, saveDoc } from '@/lib/db'
import { errorMessage } from '@/lib/messages'
import type { ContextDoc } from '@/lib/types'
import { DriveConnection } from './DriveConnection'
import { GithubConnection } from './GithubConnection'

export function ContextTab() {
  const [docs, setDocs] = useState<ContextDoc[]>([])
  const [embeddedCount, setEmbeddedCount] = useState(0)
  const [chunkCount, setChunkCount] = useState(0)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [indexNotice, setIndexNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    void listDocs().then(setDocs)
    void listChunks().then((chunks) => {
      setChunkCount(chunks.length)
      setEmbeddedCount(chunks.filter((chunk) => chunk.embedding?.length).length)
    })
  }, [])
  useEffect(refresh, [refresh])

  const onAdd = async () => {
    setError(null)
    setIndexNotice(null)
    if (!text.trim()) {
      setError('Write something first.')
      return
    }

    setBusy('add')
    try {
      await saveDoc({
        id: crypto.randomUUID(),
        source: 'story',
        title: title.trim() || 'Untitled story',
        text: text.trim(),
        createdAt: Date.now(),
      })
      setTitle('')
      setText('')
      refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return
    const file = files[0]
    setError(null)
    setIndexNotice(null)
    setBusy('upload')

    try {
      const extracted = await readUploadedFile(file)
      if (!extracted.trim()) {
        throw new Error('No text came out of that file. If it is a scanned PDF, paste the text instead.')
      }
      await saveDoc({
        id: crypto.randomUUID(),
        source: 'document',
        title: file.name.replace(/\.[^.]+$/, ''),
        text: extracted.trim(),
        createdAt: Date.now(),
      })
      refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const onDelete = async (docId: string) => {
    await deleteDocAndChunks(docId)
    refresh()
  }

  const onBuildIndex = async () => {
    setError(null)
    setIndexNotice(null)
    setBusy('index')
    try {
      const result = await buildContextIndex()
      refresh()
      if (result.total === 0) {
        setIndexNotice('Nothing to embed yet. Add a story or sync a connection first.')
        return
      }
      if (result.embedded === 0) {
        setIndexNotice(`Index already up to date (${result.total} chunks embedded).`)
        return
      }
      setIndexNotice(
        result.skipped
          ? `Embedded ${result.embedded} new chunk${result.embedded === 1 ? '' : 's'} (${result.skipped} already done).`
          : `Embedded ${result.embedded} chunk${result.embedded === 1 ? '' : 's'}.`,
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="section">
      <div>
        <h3>Context</h3>
        <p className="hint">
          The material Irke draws your answers from. Everything stays in this browser — connections
          are read-only and nothing is uploaded anywhere but your AI provider at draft time.
        </p>
      </div>

      <DriveConnection onChanged={refresh} />
      <GithubConnection onChanged={refresh} />

      <div className="card stack">
        <div className="row space-between">
          <h2>Your stories</h2>
        </div>
        <p className="hint">
          The things no document captures: what you were actually trying to do, what went wrong, what
          you would do differently. One story per entry works best.
        </p>

        <div>
          <label htmlFor="story-title">Title</label>
          <input
            id="story-title"
            value={title}
            placeholder="e.g. The migration that slipped a quarter"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="story-text">Story</label>
          <textarea
            id="story-text"
            value={text}
            rows={8}
            placeholder="What the situation was, what you personally did, and how it turned out."
            onChange={(event) => setText(event.target.value)}
          />
        </div>

        <div className="row">
          <button className="primary" onClick={onAdd} disabled={busy !== null}>
            {busy === 'add' ? 'Indexing…' : 'Add story'}
          </button>
          <button className="ghost" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
            {busy === 'upload' ? 'Reading file…' : 'Upload PDF / text'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.txt,.md,.markdown"
            hidden
            onChange={(event) => void onUpload(event.target.files)}
          />
        </div>

      </div>

      <div className="doc-list">
        <div className="row space-between">
          <h3>Indexed ({docs.length})</h3>
          <button className="primary" onClick={() => void onBuildIndex()} disabled={busy !== null}>
            {busy === 'index' ? 'Building…' : 'Build index'}
          </button>
        </div>
        <p className="hint">
          Embeddings power semantic retrieval alongside keywords. Needs an OpenAI API key
          {chunkCount > 0
            ? ` — ${embeddedCount}/${chunkCount} chunks embedded.`
            : '.'}
        </p>
        {error && <div className="notice error">{error}</div>}
        {indexNotice && <div className="notice">{indexNotice}</div>}
        {docs.length === 0 && (
          <p className="hint">Nothing indexed yet. Connect a folder, or write one story to start.</p>
        )}
        {docs.map((doc) => (
          <div key={doc.id} className="doc-item">
            <span className="badge accent">{SOURCE_LABELS[doc.source]}</span>
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
