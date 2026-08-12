import { useCallback, useEffect, useRef, useState } from 'react'

import { copyText, downloadText, type ExportFormat } from './export'

const FEEDBACK_MS = 1500

interface ExportMenuProps {
  label: string
  disabled?: boolean
  /** Built on click rather than on render, so the file always holds the latest draft text. */
  build: (format: ExportFormat) => { filename: string; text: string }
  /** Overrides what Copy puts on the clipboard; defaults to the plain-text document. */
  copyValue?: () => string
}

export function ExportMenu({ label, disabled, build, copyValue }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const flash = useCallback((next: 'copied' | 'failed') => {
    setFeedback(next)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFeedback(null), FEEDBACK_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

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

  const onCopy = async () => {
    setOpen(false)
    const text = copyValue ? copyValue() : build('txt').text
    flash((await copyText(text)) ? 'copied' : 'failed')
  }

  const onDownload = (format: ExportFormat) => {
    setOpen(false)
    const { filename, text } = build(format)
    downloadText(filename, text)
  }

  return (
    <div className="export-menu" ref={containerRef}>
      <button
        className="ghost"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {feedback === 'copied' ? 'Copied' : feedback === 'failed' ? 'Copy failed' : `${label} ▾`}
      </button>

      {/* Plain buttons rather than role="menu": Tab already reaches them, and the arrow-key
          navigation a menu role promises is not implemented. */}
      {open && (
        <div className="export-menu-items">
          <button onClick={onCopy}>Copy to clipboard</button>
          <button onClick={() => onDownload('md')}>Download .md</button>
          <button onClick={() => onDownload('txt')}>Download .txt</button>
        </div>
      )}
    </div>
  )
}
