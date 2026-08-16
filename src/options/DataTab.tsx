import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ensureAnswersIndexed, forgetAnswer } from '@/lib/answer-bank'
import { readUploadedFile } from '@/lib/connectors/sync'
import { buildContextIndex, ensureContextEmbeddings } from '@/lib/context/build-index'
import { distilledDocId, SOURCE_LABELS } from '@/lib/context/chunk'
import { distillContext } from '@/lib/context/distill'
import { chunkCoverage, deleteDocAndChunks, listDocs, saveDoc } from '@/lib/db'
import { errorMessage } from '@/lib/messages'
import type { ContextDoc, ContextSource } from '@/lib/types'

const SOURCE_ORDER: ContextSource[] = ['story', 'document', 'drive', 'github', 'distilled', 'generated']

export function DataTab() {
  const [docs, setDocs] = useState<ContextDoc[]>([])
  const [coverage, setCoverage] = useState<{ embedded: number; total: number } | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [indexNotice, setIndexNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [openSources, setOpenSources] = useState<Partial<Record<ContextSource, boolean>>>({})
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    void listDocs().then(setDocs)
    void chunkCoverage().then(setCoverage)
  }, [])

  /** New material embeds itself in the background; refresh again once it lands. */
  const autoEmbed = useCallback(() => {
    void ensureContextEmbeddings().then((result) => {
      if (result?.embedded) refresh()
    })
  }, [refresh])

  useEffect(() => {
    // Refresh even if the backfill fails — an error there should not leave the tab blank.
    void ensureAnswersIndexed()
      .catch(() => {})
      .then(refresh)
  }, [refresh])

  // Answers generated in the side panel land in IndexedDB from the service worker while this
  // page sits open. Nothing pushes that change here, so refetch when the user comes back.
  const lastRefreshRef = useRef(0)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastRefreshRef.current < 2000) return
      lastRefreshRef.current = Date.now()
      refresh()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? docs.filter(
          (doc) =>
            doc.title.toLowerCase().includes(needle) ||
            doc.text.toLowerCase().includes(needle) ||
            SOURCE_LABELS[doc.source].toLowerCase().includes(needle),
        )
      : docs

    const map = new Map<ContextSource, ContextDoc[]>()
    for (const source of SOURCE_ORDER) map.set(source, [])
    for (const doc of filtered) {
      const bucket = map.get(doc.source) ?? []
      bucket.push(doc)
      map.set(doc.source, bucket)
    }
    return SOURCE_ORDER.map((source) => ({
      source,
      label: SOURCE_LABELS[source],
      items: map.get(source) ?? [],
    })).filter((group) => {
      if (group.source === 'generated') return !needle || group.items.length > 0
      return group.items.length > 0
    })
  }, [docs, query])

  const visibleCount = useMemo(
    () => grouped.reduce((sum, group) => sum + group.items.length, 0),
    [grouped],
  )

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
      autoEmbed()
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
      autoEmbed()
    } catch (caught) {
      setModalError(errorMessage(caught))
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const onDelete = async (doc: ContextDoc) => {
    if (doc.source === 'generated' && doc.id.startsWith('generated:')) {
      await forgetAnswer(doc.id.slice('generated:'.length))
    } else {
      await deleteDocAndChunks(doc.id)
      // Notes condensed from this document go with it (a no-op when none exist).
      await deleteDocAndChunks(distilledDocId(doc.id))
    }
    refresh()
  }

  const onDistill = async () => {
    setError(null)
    setIndexNotice(null)
    setBusy('distill')
    try {
      const result = await distillContext()
      refresh()
      autoEmbed()
      if (result.total === 0) {
        setIndexNotice('Nothing to distill yet.')
        return
      }
      const parts = [
        result.distilled
          ? `Distilled ${result.distilled} document${result.distilled === 1 ? '' : 's'}`
          : 'Notes already up to date',
        result.skipped ? `${result.skipped} skipped` : null,
        result.pruned ? `${result.pruned} orphaned note${result.pruned === 1 ? '' : 's'} removed` : null,
      ].filter(Boolean)
      setIndexNotice(`${parts.join(' · ')}. One model call per document.`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
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

  const isSourceOpen = (source: ContextSource) =>
    query.trim() ? true : (openSources[source] ?? false)

  return (
    <section className="section">
      {error && <div className="notice error">{error}</div>}

      <div className="row space-between">
        <h3>Indexed ({query.trim() ? `${visibleCount}/${docs.length}` : docs.length})</h3>
        <div className="row">
          <button className="ghost" onClick={() => setUploadOpen(true)} disabled={busy !== null}>
            Upload
          </button>
          <button
            className="ghost"
            onClick={() => void onDistill()}
            disabled={busy !== null}
            title="One model call per document: condenses each into typed story notes that behavioral questions can find."
          >
            {busy === 'distill' ? 'Distilling…' : 'Distill stories'}
          </button>
          <button className="primary" onClick={() => void onBuildIndex()} disabled={busy !== null}>
            {busy === 'index' ? 'Building…' : 'Build context'}
          </button>
        </div>
      </div>

      {coverage && coverage.total > 0 && (
        <div className="hint">
          Semantic index: {coverage.embedded === coverage.total
            ? `all ${coverage.total} excerpts embedded.`
            : `${coverage.embedded} of ${coverage.total} excerpts embedded.`}
        </div>
      )}

      <input
        id="context-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search context"
      />

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
                      <button className="ghost danger" onClick={() => onDelete(doc)}>
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
