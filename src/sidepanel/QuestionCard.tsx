import type { DetectedQuestion, StoryTopic } from '@/lib/types'
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
  question: DetectedQuestion
  draft: DraftState | undefined
  expanded: boolean
  onToggle: () => void
  onChange: (value: string) => void
  onGenerate: (regenerate: boolean) => void
  onFill: () => void
  onSave: () => void
}

export function QuestionCard({
  question,
  draft,
  expanded,
  onToggle,
  onChange,
  onGenerate,
  onFill,
  onSave,
}: QuestionCardProps) {
  const value = draft?.value ?? ''
  const isBusy = draft?.status === 'generating'
  const hasDraft = value.trim().length > 0

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
      </div>

      {expanded && (
        <div className="question-body">
          <textarea
            value={value}
            placeholder={isBusy ? 'Drafting…' : 'Generate a draft, or write your answer here.'}
            onChange={(event) => onChange(event.target.value)}
            rows={question.topic === 'cover_letter' ? 12 : 7}
          />

          {draft?.error && <div className="notice error">{draft.error}</div>}

          {draft?.sources?.length ? (
            <p className="sources">Grounded in: {draft.sources.join(', ')}</p>
          ) : null}

          <div className="question-actions">
            <button className="primary" disabled={isBusy} onClick={() => onGenerate(false)}>
              {isBusy ? 'Drafting…' : hasDraft ? 'Regenerate' : 'Generate'}
            </button>
            <button disabled={!hasDraft || isBusy} onClick={onFill}>
              Fill field
            </button>
            <button className="ghost" disabled={!hasDraft || isBusy} onClick={onSave}>
              Save answer
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
