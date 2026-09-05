import { useEffect, useRef, useState } from 'react'

interface SourcesPopoverProps {
  /** Document titles the draft was grounded in; renders nothing when empty. */
  sources: string[]
  /** Titles that entered retrieval because the user's extra instructions asked for them. */
  steered?: string[]
}

/**
 * Eight document titles inline wrap into a paragraph nobody reads, so they live behind a count
 * and open into a scrollable list instead.
 */
export function SourcesPopover({ sources, steered = [] }: SourcesPopoverProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!sources.length) return null

  return (
    <div className="sources-popover" ref={containerRef}>
      <button
        className="ghost sources-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Grounded in {sources.length} {open ? '▾' : '▸'}
      </button>

      {open && (
        <ul className="sources-list">
          {sources.map((source) => (
            <li key={source}>
              {source}
              {steered.includes(source) && <span className="badge accent">requested</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
