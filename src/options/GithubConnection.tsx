import { useEffect, useMemo, useState } from 'react'

import { getConnections, patchConnections } from '@/lib/connections'
import type { GithubConnection as GithubState } from '@/lib/connections'
import { isGithubConfigured, listGithubRepos, signInWithGithub } from '@/lib/connectors/github'
import type { GithubRepo } from '@/lib/connectors/github'
import { syncGithub } from '@/lib/connectors/sync'
import { ensureContextEmbeddings } from '@/lib/context/build-index'
import { replaceDocsForSource } from '@/lib/db'
import { errorMessage } from '@/lib/messages'
import { SyncStatus, describeSync } from './SyncStatus'

interface GithubConnectionProps {
  onChanged: () => void
}

export function GithubConnection({ onChanged }: GithubConnectionProps) {
  const [github, setGithub] = useState<GithubState | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const configured = isGithubConfigured()

  useEffect(() => {
    void (async () => {
      const saved = (await getConnections()).github
      setGithub(saved)
      if (saved.token) await loadRepos(saved.token)
    })()
  }, [])

  const loadRepos = async (token: string) => {
    try {
      setRepos(await listGithubRepos(token))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const filteredRepos = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return repos
    return repos.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(needle) ||
        (repo.description?.toLowerCase().includes(needle) ?? false),
    )
  }, [repos, query])

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
      const { token, login } = await signInWithGithub()
      const next: GithubState = { token, login, repos: [], syncedAt: null }
      await patchConnections({ github: next })
      setGithub(next)
      await loadRepos(token)
    })

  const onToggleRepo = (fullName: string) =>
    run('repos', async () => {
      if (!github) return
      const selected = github.repos.includes(fullName)
        ? github.repos.filter((entry) => entry !== fullName)
        : [...github.repos, fullName]
      const next = { ...github, repos: selected }
      await patchConnections({ github: next })
      setGithub(next)
    })

  const onSync = () =>
    run('sync', async () => {
      const result = await syncGithub()
      setGithub((await getConnections()).github)
      setStatus(describeSync(result.indexed, result.skipped, 'repository'))
      onChanged()
      // Freshly synced chunks embed themselves so hybrid retrieval stays live.
      void ensureContextEmbeddings()
    })

  const onDisconnect = () =>
    run('disconnect', async () => {
      await replaceDocsForSource('github', [])
      const next: GithubState = { token: '', login: '', repos: [], syncedAt: null }
      await patchConnections({ github: next })
      setGithub(next)
      setRepos([])
      setQuery('')
      onChanged()
    })

  if (!github) return null

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
        <span className="source-group-label">GitHub</span>
        {github.login ? (
          <span className="badge success">{github.login}</span>
        ) : (
          <span className="badge">Not connected</span>
        )}
      </button>

      {open && (
        <div className="source-group-body stack">
          {!configured ? (
            <div className="notice info">GitHub is not configured for this build.</div>
          ) : !github.token ? (
            <div className="row">
              <button className="primary" onClick={onConnect} disabled={busy !== null}>
                {busy === 'connect' ? 'Opening GitHub…' : 'Connect GitHub'}
              </button>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="repo-search">Repositories ({github.repos.length} selected)</label>
                <input
                  id="repo-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="scroll-list repo-list">
                  {filteredRepos.map((repo) => (
                    <label key={repo.fullName} className="check-row">
                      <input
                        type="checkbox"
                        checked={github.repos.includes(repo.fullName)}
                        disabled={busy !== null}
                        onChange={() => void onToggleRepo(repo.fullName)}
                      />
                      <span className="check-main">
                        <span className="doc-title">{repo.fullName}</span>
                        {repo.description && <span className="doc-preview">{repo.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="row connector-actions">
                <button className="primary" onClick={onSync} disabled={busy !== null || !github.repos.length}>
                  {busy === 'sync' ? 'Syncing…' : 'Sync'}
                </button>
                <button className="ghost danger" onClick={onDisconnect} disabled={busy !== null}>
                  Disconnect
                </button>
                <SyncStatus syncedAt={github.syncedAt} />
              </div>
            </>
          )}

          {status && <div className="notice info">{status}</div>}
          {error && <div className="notice error">{error}</div>}
        </div>
      )}
    </div>
  )
}
