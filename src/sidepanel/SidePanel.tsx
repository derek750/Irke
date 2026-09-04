import { useCallback, useEffect, useState } from 'react'

import { sendToBackground } from '@/lib/messages'
import type { DetectedQuestion, JobContext, PageScan } from '@/lib/types'
import { AddQuestion } from './AddQuestion'
import { createManualQuestion, isManualField } from './manual'
import { PageContextCard } from './PageContextCard'
import { QuestionCard } from './QuestionCard'
import { useDrafts } from './useDrafts'

/** Stands in for the job while a page has not been scanned, or could not be. */
const NO_JOB: JobContext = { url: '', title: '', company: '', descriptionText: '', ats: 'manual' }

export function SidePanel() {
  const [scan, setScan] = useState<PageScan | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  /** Questions the user typed in. They outlive a rescan; the page's own questions do not. */
  const [manual, setManual] = useState<DetectedQuestion[]>([])
  const { drafts, setValue, setSteer, generate, showVersion, fill, attach, commit, reset } = useDrafts()

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

    // A rescan reassigns the page's field ids, so those drafts go; a typed question has no field
    // to go stale and its draft is the user's own work.
    reset(isManualField)
    setScan(response.scan)
    setExpanded(response.scan.questions[0]?.fieldId ?? null)
  }, [reset])

  useEffect(() => {
    void runScan()
  }, [runScan])

  const addManual = useCallback(
    (label: string, prompt: string) => {
      const question = createManualQuestion(label)
      setManual((current) => [...current, question])
      if (prompt) setSteer(question.fieldId, prompt)
      setExpanded(question.fieldId)
    },
    [setSteer],
  )

  const removeManual = useCallback((fieldId: string) => {
    setManual((current) => current.filter((question) => question.fieldId !== fieldId))
  }, [])

  const job = scan?.job ?? NO_JOB
  const questions = [...(scan?.questions ?? []), ...manual]
  const countLabel = questions.length
    ? `${questions.length} question${questions.length === 1 ? '' : 's'}`
    : scan
      ? 'No questions'
      : 'Not scanned'

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
            <p>Rescan if the form loaded late, or add a question yourself.</p>
          </div>
        )}

        {questions.map((question) => {
          // A typed question has no control on the page, so it can be drafted, copied, and
          // (for a letter) downloaded — but never filled or attached.
          const manualQuestion = isManualField(question.fieldId)

          return (
            <QuestionCard
              key={question.fieldId}
              job={job}
              question={question}
              manual={manualQuestion}
              draft={drafts[question.fieldId]}
              expanded={expanded === question.fieldId}
              onToggle={() => setExpanded(expanded === question.fieldId ? null : question.fieldId)}
              onChange={(value) => setValue(question.fieldId, value)}
              onSteerChange={(value) => setSteer(question.fieldId, value)}
              onGenerate={(regenerate) => generate(job, question, regenerate)}
              onShowVersion={(index) => showVersion(question.fieldId, index)}
              onFill={
                manualQuestion || !scan ? undefined : () => fill(question.fieldId, scan.frameId)
              }
              onAttach={
                manualQuestion || !scan
                  ? undefined
                  : (body) => attach(job, question, scan.frameId, body)
              }
              onRemove={manualQuestion ? () => removeManual(question.fieldId) : undefined}
              onCommit={() => commit(question, job.company)}
            />
          )
        })}

        <AddQuestion onAdd={addManual} />
      </div>

      <footer className="panel-footer">
        <span>{countLabel}</span>
        <span>Never auto-submits</span>
      </footer>
    </div>
  )
}
