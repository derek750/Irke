import { useEffect, useState } from 'react'

import { getConnections, patchConnections } from '@/lib/connections'
import type { DriveConnection as DriveState } from '@/lib/connections'
import {
  getDriveAccountEmail,
  getDriveToken,
  isDriveConfigured,
  revokeDriveToken,
} from '@/lib/connectors/drive'
import type { DriveFolder } from '@/lib/connectors/drive'
import { syncDrive } from '@/lib/connectors/sync'
import { ensureContextEmbeddings } from '@/lib/context/build-index'
import { replaceDocsForSource } from '@/lib/db'
import { errorMessage } from '@/lib/messages'
import { DriveFolderPicker } from './DriveFolderPicker'
import { SyncStatus, describeSync } from './SyncStatus'

interface DriveConnectionProps {
  onChanged: () => void
}

export function DriveConnection({ onChanged }: DriveConnectionProps) {
  const [drive, setDrive] = useState<DriveState | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const configured = isDriveConfigured()

  useEffect(() => {
    void (async () => {
      const saved = (await getConnections()).drive
      setDrive(saved)
      if (!configured) return
      const token = await getDriveToken(false)
      if (!token) return
      setIsConnected(true)
      if (!saved.email) {
        const email = await getDriveAccountEmail(token).catch(() => null)
        if (email) {
          const next = { ...saved, email }
          await patchConnections({ drive: next })
          setDrive(next)
        }
      }
    })()
  }, [configured])

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    setStatus(null)
    try {
      await task()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  const saveFolder = async (folder: DriveFolder) => {
    const current = drive ?? { folderId: '', folderName: '', email: '', syncedAt: null }
    const next = {
      ...current,
      folderId: folder.id,
      folderName: folder.name,
      syncedAt: null,
    }
    await patchConnections({ drive: next })
    setDrive(next)
    setPickerOpen(false)
  }

  const onConnect = () =>
    run('connect', async () => {
      const token = await getDriveToken(true)
      if (!token) throw new Error('Google sign-in was cancelled.')
      const email = (await getDriveAccountEmail(token).catch(() => null)) ?? ''
      const current = drive ?? { folderId: '', folderName: '', email: '', syncedAt: null }
      const next = { ...current, email }
      await patchConnections({ drive: next })
      setDrive(next)
      setIsConnected(true)
      setPickerOpen(true)
    })

  const onSync = () =>
    run('sync', async () => {
      const result = await syncDrive()
      setDrive((await getConnections()).drive)
      setStatus(describeSync(result.indexed, result.skipped, 'file'))
      onChanged()
      // Freshly synced chunks embed themselves so hybrid retrieval stays live.
      void ensureContextEmbeddings()
    })

  const onDisconnect = () =>
    run('disconnect', async () => {
      await revokeDriveToken()
      await replaceDocsForSource('drive', [])
      const next = { folderId: '', folderName: '', email: '', syncedAt: null }
      await patchConnections({ drive: next })
      setDrive(next)
      setIsConnected(false)
      setPickerOpen(false)
      onChanged()
    })

  if (!drive) return null

  return (
    <div className="source-group">
      <button
        type="button"
        className="source-group-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="source-group-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="source-group-label">Google Drive</span>
        {isConnected ? (
          <span className="badge success">{drive.email || 'Connected'}</span>
        ) : (
          <span className="badge">Not connected</span>
        )}
      </button>

      {open && (
        <div className="source-group-body stack">
          {!configured ? (
            <div className="notice info">Google Drive is not configured for this build.</div>
          ) : !isConnected ? (
            <div className="row">
              <button className="primary" onClick={onConnect} disabled={busy !== null}>
                {busy === 'connect' ? 'Opening Google…' : 'Connect Google Drive'}
              </button>
            </div>
          ) : (
            <>
              <div className="folder-pick row space-between">
                <div className="folder-pick-main">
                  <div className="hint">Folder</div>
                  <div className="doc-title">{drive.folderName || 'None selected'}</div>
                </div>
                <button className="primary" onClick={() => setPickerOpen(true)} disabled={busy !== null}>
                  {drive.folderId ? 'Change folder' : 'Choose folder'}
                </button>
              </div>

              <div className="row connector-actions">
                <button className="primary" onClick={onSync} disabled={busy !== null || !drive.folderId}>
                  {busy === 'sync' ? 'Syncing…' : 'Sync'}
                </button>
                <button className="ghost danger" onClick={onDisconnect} disabled={busy !== null}>
                  Disconnect
                </button>
                <SyncStatus syncedAt={drive.syncedAt} />
              </div>
            </>
          )}

          {status && <div className="notice info">{status}</div>}
          {error && <div className="notice error">{error}</div>}
        </div>
      )}

      {pickerOpen && (
        <DriveFolderPicker
          onPick={(folder) => void run('folder', () => saveFolder(folder))}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
