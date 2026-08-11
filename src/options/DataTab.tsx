import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { readUploadedFile } from '@/lib/connectors/sync'
import { buildContextIndex } from '@/lib/context/build-index'
import { SOURCE_LABELS } from '@/lib/context/chunk'
import { deleteDocAndChunks, listDocs, saveDoc } from '@/lib/db'
import { errorMessage } from '@/lib/messages'
import type { ContextDoc, ContextSource } from '@/lib/types'

const SOURCE_ORDER: ContextSource[] = ['story', 'document', 'drive', 'github', 'generated']

export function DataTab() {
  const [docs, setDocs] = useState<ContextDoc[]>([])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [indexNotice, setIndexNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [openSources, setOpenSources] = useState<Partial<Record<ContextSource, boolean>>>({})
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    void listDocs().then(setDocs)
  }, [])
  useEffect(refresh, [refresh])

  const grouped = useMemo(() => {
    const map = new Map<ContextSource, ContextDoc[]>()
    for (const source of SOURCE_ORDER) map.set(source, [])
    for (const doc of docs) {
      const bucket = map.get(doc.source) ?? []
      bucket.push(doc)
      map.set(doc.source, bucket)
    }
    return SOURCE_ORDER.map((source) => ({
      source,
      label: SOURCE_LABELS[source],
      items: map.get(source) ?? [],
    })).filter((group) => group.items.length > 0)
  }, [docs])

  const closeUpload = () => {
    setUploadOpen(false)
    setModalError(null)
    setTitle('')
    setText('')
    if (fileInput.current) fileInput.current.value = ''
  }

  const onAdd = async () => {
    setModalError(null)
    if (!text.trim()) {
      setModalError('Write something first.')
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
      closeUpload()
      refresh()
    } catch (caught) {
      setModalError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return
    const file = files[0]
    setModalError(null)
    setBusy('upload')

    try {
      const extracted = await readUploadedFile(file)
      if (!extracted.trim()) {
        throw new Error('No text came out of that file.')
      }
      await saveDoc({
        id: crypto.randomUUID(),
        source: 'document',
        title: file.name.replace(/\.[^.]+$/, ''),
        text: extracted.trim(),
        createdAt: Date.now(),
      })
      closeUpload()
      refresh()
    } catch (caught) {
      setModalError(errorMessage(caught))
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
        setIndexNotice('Nothing to embed yet.')
        return
      }
      if (result.embedded === 0) {
        setIndexNotice(`Index already up to date (${result.total} chunks).`)
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

  const toggleSource = (source: ContextSource) => {
    setOpenSources((prev) => ({ ...prev, [source]: !(prev[source] ?? false) }))
  }

  const isSourceOpen = (source: ContextSource) => openSources[source] ?? false

  return (
    <section className="section">
      {error && <div className="notice error">{error}</div>}

      <div className="row space-between">
        <h3>Indexed ({docs.length})</h3>
        <div className="row">
          <button className="ghost" onClick={() => setUploadOpen(true)} disabled={busy !== null}>
            Upload
          </button>
          <button className="primary" onClick={() => void onBuildIndex()} disabled={busy !== null}>
            {busy === 'index' ? 'Building…' : 'Build context'}
          </button>
        </div>
      </div>

      {indexNotice && <div className="notice">{indexNotice}</div>}

      <div className="doc-list">
        {grouped.map((group) => {
          const open = isSourceOpen(group.source)
          return (
            <div key={group.source} className="source-group">
              <button
                type="button"
                className="source-group-head"
                onClick={() => toggleSource(group.source)}
                aria-expanded={open}
              >
                <span className="source-group-chevron" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
                <span className="source-group-label">{group.label}</span>
                <span className="badge">{group.items.length}</span>
              </button>
              {open && (
                <div className="source-group-body">
                  {group.items.map((doc) => (
                    <div key={doc.id} className="doc-item">
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
              )}
            </div>
          )
        })}
      </div>

      {uploadOpen && (
        <div
          className="picker-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && busy === null) closeUpload()
          }}
        >
          <div className="picker-modal stack upload-modal" role="dialog" aria-modal="true">
            <div className="row space-between">
              <h2>Upload</h2>
              <button className="ghost" onClick={closeUpload} disabled={busy !== null}>
                Close
              </button>
            </div>

            {modalError && <div className="notice error">{modalError}</div>}

            <div>
              <label htmlFor="story-title">Title</label>
              <input
                id="story-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="upload-text-field">
              <label htmlFor="story-text">Text</label>
              <textarea
                id="story-text"
                className="upload-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>

            <div className="row">
              <button className="primary" onClick={onAdd} disabled={busy !== null}>
                {busy === 'add' ? 'Saving…' : 'Add Context'}
              </button>
              <button
                className="ghost"
                onClick={() => fileInput.current?.click()}
                disabled={busy !== null}
              >
                {busy === 'upload' ? 'Reading file…' : 'Upload file'}
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
        </div>
      )}
    </section>
  )
}
