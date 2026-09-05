import { useCallback, useEffect, useRef, useState } from 'react'

import { downloadPdf } from './export'

const FEEDBACK_MS = 2000

interface ExportButtonProps {
  disabled?: boolean
  /** Built on click rather than on render, so the file always holds the latest draft text. */
  build: () => Promise<{ filename: string; bytes: Uint8Array }>
}

/** Downloads the cover-letter PDF, for keeping a copy or for pages where attaching fails. */
export function ExportButton({ disabled, build }: ExportButtonProps) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const timerRef = useRef<number | undefined>(undefined)

  const flashFailure = useCallback(() => {
    setFailed(true)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFailed(false), FEEDBACK_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const onDownload = async () => {
    setBusy(true)
    try {
      const { filename, bytes } = await build()
      downloadPdf(filename, bytes)
    } catch {
      flashFailure()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button className="ghost" disabled={disabled || busy} onClick={() => void onDownload()}>
      {busy ? 'Building…' : failed ? 'Export failed' : 'Download PDF'}
    </button>
  )
}
