import { useState } from 'react'

import type { PageScan } from '@/lib/types'

interface PageContextCardProps {
  scan: PageScan
}

export function PageContextCard({ scan }: PageContextCardProps) {
  const [open, setOpen] = useState(false)
  const { job, questions, scannedAt } = scan
  const description = job.descriptionText.trim()

  const summary = [job.title || 'Untitled role', job.company, job.ats].filter(Boolean).join(' · ')

  return (
    <article className="question-card context-card">
      <button className="question-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chevron">{open ? '▾' : '▸'}</span>
        <span className="question-label">{summary}</span>
      </button>

      <div className="question-tags">
        <span className="badge">Page context</span>
        <span className="badge">
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}
        </span>
        {description ? (
          <span className="badge">{description.length.toLocaleString()} chars scanned</span>
        ) : (
          <span className="badge warning">No description</span>
        )}
      </div>

      {open && (
        <div className="question-body">
          <dl className="context-meta">
            <dt>Source</dt>
            <dd>
              <a href={job.url} target="_blank" rel="noreferrer">
                {job.url}
              </a>
            </dd>
            <dt>Detected as</dt>
            <dd>{job.ats}</dd>
            <dt>Scanned</dt>
            <dd>{new Date(scannedAt).toLocaleString()}</dd>
          </dl>

          {description ? (
            <p className="context-description">{description}</p>
          ) : (
            <div className="notice info">
              No job description found on this page. Answers will lean on your context library
              alone — open the posting itself and rescan for a better draft.
            </div>
          )}
        </div>
      )}
    </article>
  )
}
