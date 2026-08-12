import { useCallback, useEffect, useRef, useState } from 'react'

import { downloadFile, type ExportFormat } from './export'

const FEEDBACK_MS = 2000

const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'Download PDF',
  tex: 'Download .tex',
}

interface ExportMenuProps {
  label: string
  disabled?: boolean
  /** Built on click rather than on render, so the file always holds the latest draft text. */
  build: (format: ExportFormat) => Promise<{ filename: string; data: string | Uint8Array }>
}

export function ExportMenu({ label, disabled, build }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const flashFailure = useCallback(() => {
    setFailed(true)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFailed(false), FEEDBACK_MS)
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

  const onDownload = async (format: ExportFormat) => {
    setOpen(false)
    setBusy(true)
    try {
      const { filename, data } = await build(format)
      downloadFile(filename, data, format)
    } catch {
      flashFailure()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="export-menu" ref={containerRef}>
      <button
        className="ghost"
        disabled={disabled || busy}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {busy ? 'Building…' : failed ? 'Export failed' : `${label} ▾`}
      </button>

      {/* Plain buttons rather than role="menu": Tab already reaches them, and the arrow-key
          navigation a menu role promises is not implemented. */}
      {open && (
        <div className="export-menu-items">
          {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((format) => (
            <button key={format} onClick={() => onDownload(format)}>
              {FORMAT_LABELS[format]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
