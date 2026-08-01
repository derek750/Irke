import { useCallback, useEffect, useMemo, useState } from 'react'

import { sendToBackground } from '@/lib/messages'
import type { PageScan } from '@/lib/types'
import { QuestionCard } from './QuestionCard'
import { useDrafts } from './useDrafts'

type Filter = 'all' | 'essay' | 'profile'

export function SidePanel() {
  const [scan, setScan] = useState<PageScan | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const { drafts, setValue, generate, fill, save, reset } = useDrafts()

  const runScan = useCallback(async () => {
    setIsScanning(true)
    setScanError(null)

    const response = await sendToBackground({ type: 'bg:scanActiveTab' })
    setIsScanning(false)

    if (!response.ok) {
      setScanError(response.error)
      return
    }
    if (response.type !== 'scan') return

    reset()
    setScan(response.scan)
    setExpanded(response.scan.questions.find((question) => !question.profileKey)?.fieldId ?? null)
  }, [reset])

  useEffect(() => {
    void runScan()
  }, [runScan])

  const questions = useMemo(() => {
    if (!scan) return []
    if (filter === 'essay') return scan.questions.filter((question) => !question.profileKey)
    if (filter === 'profile') return scan.questions.filter((question) => question.profileKey)
    return scan.questions
  }, [scan, filter])

  const fillAllProfileFields = useCallback(async () => {
    if (!scan) return
    for (const question of scan.questions) {
      if (!question.profileKey) continue
      await generate(scan.job, question, false)
      await fill(question.fieldId, scan.frameId)
    }
  }, [scan, generate, fill])

  return (
    <div className="panel">
      <header className="panel-header">
        <div className="title-row">
          <h1>Irke</h1>
          <div className="row">
            <button className="ghost" onClick={() => chrome.runtime.openOptionsPage()}>
              Brain
            </button>
            <button onClick={runScan} disabled={isScanning}>
              {isScanning ? 'Scanning…' : 'Rescan'}
            </button>
          </div>
        </div>

        {scan && (
          <>
            <p className="job-meta">
              {scan.job.title || 'Untitled role'}
              {scan.job.company ? ` · ${scan.job.company}` : ''} · {scan.job.ats}
            </p>
            <div className="row">
              {(['all', 'essay', 'profile'] as Filter[]).map((option) => (
                <button
                  key={option}
                  className={filter === option ? 'primary' : 'ghost'}
                  onClick={() => setFilter(option)}
                >
                  {option === 'all' ? 'All' : option === 'essay' ? 'Questions' : 'Profile fields'}
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      <div className="panel-body">
        {scanError && <div className="notice error">{scanError}</div>}

        {!scanError && !isScanning && questions.length === 0 && (
          <div className="empty-state">
            <h2>No fields detected</h2>
            <p>
              Open a job application page and hit Rescan. If the form loads after a click, rescan once
              it is visible.
            </p>
          </div>
        )}

        {filter === 'profile' && questions.length > 0 && (
          <button className="primary" onClick={fillAllProfileFields}>
            Fill all {questions.length} profile fields
          </button>
        )}

        {questions.map((question) => (
          <QuestionCard
            key={question.fieldId}
            question={question}
            draft={drafts[question.fieldId]}
            expanded={expanded === question.fieldId}
            onToggle={() => setExpanded(expanded === question.fieldId ? null : question.fieldId)}
            onChange={(value) => setValue(question.fieldId, value)}
            onGenerate={(regenerate) => scan && generate(scan.job, question, regenerate)}
            onFill={() => scan && fill(question.fieldId, scan.frameId)}
            onSave={() => scan && save(question, scan.job.company)}
          />
        ))}
      </div>

      <footer className="panel-footer">
        <span>{scan ? `${scan.questions.length} fields detected` : 'Not scanned'}</span>
        <span>Irke never submits for you</span>
      </footer>
    </div>
  )
}
