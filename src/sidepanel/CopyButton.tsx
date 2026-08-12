import { useEffect, useRef, useState } from 'react'

import { copyText } from './export'

const FEEDBACK_MS = 1500

interface CopyButtonProps {
  /** Read on click so the latest edit is what lands on the clipboard. */
  value: () => string
  disabled?: boolean
}

export function CopyButton({ value, disabled }: CopyButtonProps) {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const onClick = async () => {
    const ok = await copyText(value())
    setResult(ok ? 'copied' : 'failed')
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setResult(null), FEEDBACK_MS)
  }

  return (
    <button disabled={disabled} onClick={onClick}>
      {result === 'copied' ? 'Copied' : result === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  )
}
