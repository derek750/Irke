import { useCallback, useEffect, useState } from 'react'

import { sendToBackground } from '@/lib/messages'
import type { PageScan } from '@/lib/types'
import { PageContextCard } from './PageContextCard'
import { QuestionCard } from './QuestionCard'
import { useDrafts } from './useDrafts'

export function SidePanel() {
  const [scan, setScan] = useState<PageScan | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { drafts, setValue, setSteer, generate, showVersion, fill, commit, reset } = useDrafts()

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
    setExpanded(response.scan.questions[0]?.fieldId ?? null)
  }, [reset])

  useEffect(() => {
    void runScan()
  }, [runScan])

  const questions = scan?.questions ?? []

  return (
    <div className="panel">
      <header className="panel-header">
        <div className="title-row">
          <h1>Irke</h1>
          <div className="row">
            <button className="ghost" onClick={() => chrome.runtime.openOptionsPage()}>
              Dashboard
            </button>
            <button onClick={runScan} disabled={isScanning}>
              {isScanning ? 'Scanning…' : 'Rescan'}
            </button>
          </div>
        </div>
      </header>

      <div className="panel-body">
        {scanError && <div className="notice error">{scanError}</div>}

        {scan && <PageContextCard scan={scan} />}

        {!scanError && !isScanning && questions.length === 0 && (
          <div className="empty-state">
            <h2>No questions found</h2>
            <p>Nothing to answer here yet. Rescan if the form loaded late.</p>
          </div>
        )}

        {scan &&
          scan.questions.map((question) => (
            <QuestionCard
              key={question.fieldId}
              job={scan.job}
              question={question}
              draft={drafts[question.fieldId]}
              expanded={expanded === question.fieldId}
              onToggle={() => setExpanded(expanded === question.fieldId ? null : question.fieldId)}
              onChange={(value) => setValue(question.fieldId, value)}
              onSteerChange={(value) => setSteer(question.fieldId, value)}
              onGenerate={(regenerate) => generate(scan.job, question, regenerate)}
              onShowVersion={(index) => showVersion(question.fieldId, index)}
              onFill={() => fill(question.fieldId, scan.frameId)}
              onCommit={() => commit(question, scan.job.company)}
            />
          ))}
      </div>

      <footer className="panel-footer">
        <span>{scan ? `${questions.length} questions` : 'Not scanned'}</span>
        <span>Never auto-submits</span>
      </footer>
    </div>
  )
}
