import { useEffect, useState } from 'react'

import { getDriveToken, listChildFolders, searchDriveFolders } from '@/lib/connectors/drive'
import type { DriveFolder } from '@/lib/connectors/drive'
import { errorMessage } from '@/lib/messages'

interface Crumb {
  id: string
  name: string
}

interface DriveFolderPickerProps {
  onPick: (folder: DriveFolder) => void
  onClose: () => void
}

export function DriveFolderPicker({ onPick, onClose }: DriveFolderPickerProps) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: 'root', name: 'My Drive' }])
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const current = crumbs[crumbs.length - 1]

  const loadChildren = async (parentId: string) => {
    setLoading(true)
    setError(null)
    setSearching(false)
    try {
      const token = await getDriveToken(false)
      if (!token) throw new Error('Google session expired. Disconnect and connect again.')
      setFolders(await listChildFolders(token, parentId))
    } catch (caught) {
      setError(errorMessage(caught))
      setFolders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadChildren(current.id)
  }, [current.id])

  useEffect(() => {
    if (!query.trim()) {
      if (searching) void loadChildren(current.id)
      return
    }

    const handle = window.setTimeout(() => {
      void (async () => {
        setLoading(true)
        setError(null)
        setSearching(true)
        try {
          const token = await getDriveToken(false)
          if (!token) throw new Error('Google session expired. Disconnect and connect again.')
          setFolders(await searchDriveFolders(token, query))
        } catch (caught) {
          setError(errorMessage(caught))
          setFolders([])
        } finally {
          setLoading(false)
        }
      })()
    }, 280)

    return () => window.clearTimeout(handle)
  }, [query])

  const openFolder = (folder: DriveFolder) => {
    setQuery('')
    setSearching(false)
    setCrumbs((path) => [...path, { id: folder.id, name: folder.name }])
  }

  const jumpTo = (index: number) => {
    setQuery('')
    setSearching(false)
    setCrumbs((path) => path.slice(0, index + 1))
  }

  return (
    <div className="picker-backdrop" onClick={onClose} role="presentation">
      <div
        className="picker-modal stack"
        role="dialog"
        aria-label="Choose a Google Drive folder"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row space-between">
          <h2>Choose a folder</h2>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <input
          type="search"
          value={query}
          placeholder="Search folders…"
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />

        {!searching && (
          <nav className="picker-crumbs" aria-label="Folder path">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.id}-${index}`} className="picker-crumb">
                {index > 0 && <span className="picker-sep">/</span>}
                <button
                  className="ghost"
                  type="button"
                  disabled={index === crumbs.length - 1}
                  onClick={() => jumpTo(index)}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
        )}

        {searching && <p className="hint">Search results</p>}

        <div className="picker-list">
          {loading && <p className="hint">Loading…</p>}
          {!loading && folders.length === 0 && (
            <p className="hint">{searching ? 'No folders matched.' : 'No folders in here.'}</p>
          )}
          {!loading &&
            folders.map((folder) => (
              <div key={folder.id} className="picker-row">
                <button className="picker-open" type="button" onClick={() => openFolder(folder)}>
                  <span className="picker-icon" aria-hidden>
                    ▸
                  </span>
                  <span className="doc-title">{folder.name}</span>
                </button>
                <button className="primary" type="button" onClick={() => onPick(folder)}>
                  Select
                </button>
              </div>
            ))}
        </div>

        {!searching && current.id !== 'root' && (
          <button className="primary" type="button" onClick={() => onPick(current)}>
            Use “{current.name}”
          </button>
        )}

        {error && <div className="notice error">{error}</div>}
      </div>
    </div>
  )
}
