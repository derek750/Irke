import { useEffect, useState } from 'react'

import { getConnections, patchConnections } from '@/lib/connections'
import type { DriveConnection as DriveState } from '@/lib/connections'
import { getDriveToken, isDriveConfigured, listDriveFolders, revokeDriveToken } from '@/lib/connectors/drive'
import type { DriveFolder } from '@/lib/connectors/drive'
import { syncDrive } from '@/lib/connectors/sync'
import { replaceDocsForSource } from '@/lib/db'
import { errorMessage } from '@/lib/messages'
import { SyncStatus, describeSync } from './SyncStatus'

interface DriveConnectionProps {
  onChanged: () => void
}

export function DriveConnection({ onChanged }: DriveConnectionProps) {
  const [drive, setDrive] = useState<DriveState | null>(null)
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const configured = isDriveConfigured()

  useEffect(() => {
    void (async () => {
      setDrive((await getConnections()).drive)
      if (!configured) return
      const token = await getDriveToken(false)
      if (!token) return
      setIsConnected(true)
      await loadFolders(token)
    })()
  }, [configured])

  const loadFolders = async (token: string) => {
    try {
      setFolders(await listDriveFolders(token))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

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

  const onConnect = () =>
    run('connect', async () => {
      const token = await getDriveToken(true)
      if (!token) throw new Error('Google sign-in was cancelled.')
      setIsConnected(true)
      await loadFolders(token)
    })

  const onPickFolder = (folderId: string) =>
    run('folder', async () => {
      const folder = folders.find((entry) => entry.id === folderId)
      const next = { folderId, folderName: folder?.name ?? '', syncedAt: null }
      await patchConnections({ drive: next })
      setDrive(next)
    })

  const onSync = () =>
    run('sync', async () => {
      const result = await syncDrive()
      setDrive((await getConnections()).drive)
      setStatus(describeSync(result.indexed, result.skipped, 'file'))
      onChanged()
    })

  const onDisconnect = () =>
    run('disconnect', async () => {
      await revokeDriveToken()
      await replaceDocsForSource('drive', [])
      const next = { folderId: '', folderName: '', syncedAt: null }
      await patchConnections({ drive: next })
      setDrive(next)
      setIsConnected(false)
      setFolders([])
      onChanged()
    })

  if (!drive) return null

  return (
    <div className="card stack">
      <div className="row space-between">
        <h2>Google Drive</h2>
        {isConnected ? (
          <span className="badge success">Connected</span>
        ) : (
          <span className="badge">Not connected</span>
        )}
      </div>
      <p className="hint">
        Irke reads one folder, read-only. Put your resume, cover letters, and written stories in it —
        Docs, PDFs, and text files all work.
      </p>

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
          <div>
            <label htmlFor="drive-folder">Folder</label>
            <select
              id="drive-folder"
              value={drive.folderId}
              disabled={busy !== null}
              onChange={(event) => void onPickFolder(event.target.value)}
            >
              <option value="">Select a folder…</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <button className="primary" onClick={onSync} disabled={busy !== null || !drive.folderId}>
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
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
  )
}
