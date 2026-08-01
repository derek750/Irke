import type { DetectedQuestion } from '@/lib/types'
import { KIND_LABELS } from '@/lib/brain/chunk'
import type { DraftState } from './useDrafts'

const SOURCE_LABELS: Record<NonNullable<DraftState['source']>, string> = {
  answer_bank: 'Reused saved answer',
  profile: 'From profile',
  llm: 'AI draft',
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
        <span className="badge">{question.inputKind}</span>
        {question.required && <span className="badge warning">Required</span>}
        {question.profileKey && <span className="badge accent">Profile match</span>}
        {question.maxLength && <span className="badge">{question.maxLength} char max</span>}
        {draft?.source && <span className="badge accent">{SOURCE_LABELS[draft.source]}</span>}
        {draft?.needsInput && <span className="badge warning">Needs your input</span>}
      </div>

      {expanded && (
        <div className="question-body">
          {question.options.length > 0 && (
            <p className="sources">Options: {question.options.join(' · ')}</p>
          )}

          <textarea
            value={value}
            placeholder={isBusy ? 'Drafting…' : 'Generate a draft, or write your answer here.'}
            onChange={(event) => onChange(event.target.value)}
            rows={question.inputKind === 'textarea' ? 7 : 2}
          />

          {draft?.error && <div className="notice error">{draft.error}</div>}

          {draft?.sources?.length ? (
            <p className="sources">Grounded in: {draft.sources.map(labelForSource).join(', ')}</p>
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

function labelForSource(source: string): string {
  const known = Object.entries(KIND_LABELS).find(([kind]) => source === kind)
  return known ? known[1] : source
}
