interface SyncStatusProps {
  syncedAt: number | null
}

export function SyncStatus({ syncedAt }: SyncStatusProps) {
  if (!syncedAt) return <span className="hint">Never synced</span>
  return <span className="hint">Last synced {new Date(syncedAt).toLocaleString()}</span>
}

export function describeSync(indexed: number, skipped: string[], noun: string): string {
  const base = `Indexed ${indexed} ${noun}${indexed === 1 ? '' : 's'}.`
  return skipped.length ? `${base} Skipped ${skipped.length}: ${skipped.join(', ')}.` : base
}
