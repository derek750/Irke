import { useState } from 'react'

import type { DetectedQuestion, JobContext, StoryTopic } from '@/lib/types'
import { SourcesPopover } from '@/ui/SourcesPopover'
import { CopyButton } from './CopyButton'
import { buildCoverLetterFile } from './cover-letter'
import { resolveAnswer } from './export'
import { ExportButton } from './ExportButton'
import type { DraftState } from './useDrafts'

const DRAFT_SOURCE_LABELS: Record<NonNullable<DraftState['source']>, string> = {
  llm: 'AI draft',
}

const TOPIC_LABELS: Record<StoryTopic, string> = {
  cover_letter: 'Cover letter',
  why_company: 'Why this company',
  why_role: 'Why this role',
  behavioral: 'Behavioral',
  strengths: 'Strengths',
  project: 'Project',
  open_ended: 'Open ended',
}

interface QuestionCardProps {
  job: JobContext
  question: DetectedQuestion
  draft: DraftState | undefined
  expanded: boolean
  onToggle: () => void
  onChange: (value: string) => void
  onSteerChange: (value: string) => void
  onGenerate: (regenerate: boolean) => void
  /** Swaps the textarea to an earlier attempt from this session. */
  onShowVersion: (index: number) => void
  onFill: () => void
  /** Uploads only: typeset the answer as a PDF and set it on the page's file input. */
  onAttach: (body: string) => void
  /** Banks an edited draft; the generated text is already saved by the pipeline. */
  onCommit: () => void
}

export function QuestionCard({
  job,
  question,
  draft,
  expanded,
  onToggle,
  onChange,
  onSteerChange,
  onGenerate,
  onShowVersion,
  onFill,
  onAttach,
  onCommit,
}: QuestionCardProps) {
  const [steerOpen, setSteerOpen] = useState(false)
  const value = draft?.value ?? ''
  const steer = draft?.steer ?? ''
  const isBusy = draft?.status === 'generating'
  const hasDraft = value.trim().length > 0
  const isUpload = question.control === 'file'
  const answer = resolveAnswer(question, value)

  // Regenerating keeps every attempt rather than replacing the last, so the card needs a way back
  // to them. A hand-edited draft matches no version — stepping back returns to the newest one.
  const history = draft?.history ?? []
  const versionIndex = history.indexOf(value)
  const isEdited = versionIndex === -1
  const previousIndex = isEdited ? history.length - 1 : versionIndex - 1
  const nextIndex = isEdited ? -1 : versionIndex + 1

  const buildFile = () => buildCoverLetterFile(job, answer)

  return (
    <article className={`question-card${draft?.status === 'filled' ? ' filled' : ''}`}>
      <button className="question-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="chevron">{expanded ? '▾' : '▸'}</span>
        <span className="question-label">{question.label}</span>
        {draft?.status === 'filled' && <span className="badge success">Filled</span>}
      </button>

      <div className="question-tags">
        <span className="badge">{TOPIC_LABELS[question.topic]}</span>
        {question.required && <span className="badge warning">Required</span>}
        {question.maxLength && <span className="badge">{question.maxLength} char max</span>}
        {draft?.source && <span className="badge accent">{DRAFT_SOURCE_LABELS[draft.source]}</span>}
        {draft?.needsInput && <span className="badge warning">Needs your input</span>}
        {draft?.degraded && (
          <span
            className="badge"
            title="The semantic index couldn't be reached for this draft, so it was grounded by keyword match alone. Regenerate to retry."
          >
            Keyword only
          </span>
        )}
        <SourcesPopover sources={draft?.sources ?? []} steered={draft?.steeredSources ?? []} />
      </div>

      {expanded && (
        <div className="question-body">
          {(history.length > 1 || (history.length === 1 && isEdited)) && (
            <div className="versions">
              <button
                className="ghost"
                aria-label="Previous version"
                disabled={previousIndex < 0}
                onClick={() => onShowVersion(previousIndex)}
              >
                ‹
              </button>
              <span>{isEdited ? 'Edited' : `Version ${versionIndex + 1} of ${history.length}`}</span>
              <button
                className="ghost"
                aria-label="Next version"
                disabled={nextIndex < 0 || nextIndex >= history.length}
                onClick={() => onShowVersion(nextIndex)}
              >
                ›
              </button>
            </div>
          )}

          <textarea
            value={value}
            placeholder={isBusy ? 'Drafting…' : 'Generate a draft, or write your answer here.'}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onCommit}
            rows={question.topic === 'cover_letter' ? 12 : 7}
          />

          <div className="steer">
            <button
              className="ghost steer-toggle"
              onClick={() => setSteerOpen(!steerOpen)}
              aria-expanded={steerOpen}
            >
              <span className="chevron">{steerOpen ? '▾' : '▸'}</span>
              Extra instructions
              {!steerOpen && Boolean(steer.trim()) && <span className="badge accent">on</span>}
            </button>

            {steerOpen && (
              <textarea
                value={steer}
                rows={2}
                placeholder="Focus on the robotics project. Keep it under 150 words."
                onChange={(event) => onSteerChange(event.target.value)}
              />
            )}
          </div>

          {draft?.error && <div className="notice error">{draft.error}</div>}

          <div className="question-actions">
            {/* An edited draft is refined (built on), an untouched one is regenerated (replaced). */}
            <button className="primary" disabled={isBusy} onClick={() => onGenerate(hasDraft)}>
              {isBusy ? 'Drafting…' : hasDraft ? (isEdited ? 'Refine' : 'Regenerate') : 'Generate'}
            </button>
            {isUpload ? (
              <button disabled={!answer || isBusy} onClick={() => onAttach(answer)}>
                Attach PDF
              </button>
            ) : (
              <button disabled={!hasDraft || isBusy} onClick={onFill}>
                Fill field
              </button>
            )}
            <CopyButton value={() => answer} disabled={!answer || isBusy} />
            {question.topic === 'cover_letter' && (
              <ExportButton disabled={!answer || isBusy} build={buildFile} />
            )}
          </div>
        </div>
      )}
    </article>
  )
}
