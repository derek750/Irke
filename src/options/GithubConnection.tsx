import { useEffect, useState } from 'react'

import { getConnections, patchConnections } from '@/lib/connections'
import type { GithubConnection as GithubState } from '@/lib/connections'
import { listGithubRepos, verifyGithubToken } from '@/lib/connectors/github'
import type { GithubRepo } from '@/lib/connectors/github'
import { syncGithub } from '@/lib/connectors/sync'
import { replaceDocsForSource } from '@/lib/db'
import { errorMessage } from '@/lib/messages'
import { SyncStatus, describeSync } from './SyncStatus'

interface GithubConnectionProps {
  onChanged: () => void
}

export function GithubConnection({ onChanged }: GithubConnectionProps) {
  const [github, setGithub] = useState<GithubState | null>(null)
  const [tokenDraft, setTokenDraft] = useState('')
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

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
      const token = tokenDraft.trim()
      if (!token) throw new Error('Paste a token first.')

      const login = await verifyGithubToken(token)
      const next: GithubState = { token, login, repos: [], syncedAt: null }
      await patchConnections({ github: next })
      setGithub(next)
      setTokenDraft('')
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
    })

  const onDisconnect = () =>
    run('disconnect', async () => {
      await replaceDocsForSource('github', [])
      const next: GithubState = { token: '', login: '', repos: [], syncedAt: null }
      await patchConnections({ github: next })
      setGithub(next)
      setRepos([])
      onChanged()
    })

  if (!github) return null

  return (
    <div className="card stack">
      <div className="row space-between">
        <h2>GitHub</h2>
        {github.login ? (
          <span className="badge success">{github.login}</span>
        ) : (
          <span className="badge">Not connected</span>
        )}
      </div>
      <p className="hint">
        Irke reads the description and README of the repos you pick — the prose that explains what a
        project was, not the source. Good for "tell us about something you built".
      </p>

      {!github.token ? (
        <>
          <div>
            <label htmlFor="gh-token">Personal access token</label>
            <input
              id="gh-token"
              type="password"
              value={tokenDraft}
              placeholder="Create a read-only token at github.com/settings/tokens"
              onChange={(event) => setTokenDraft(event.target.value)}
            />
          </div>
          <div className="row">
            <button className="primary" onClick={onConnect} disabled={busy !== null}>
              {busy === 'connect' ? 'Checking…' : 'Connect GitHub'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div>
            <label>Repositories ({github.repos.length} selected)</label>
            <div className="scroll-list">
              {repos.length === 0 && <p className="hint">No repositories found for this token.</p>}
              {repos.map((repo) => (
                <label key={repo.fullName} className="check-row">
                  <input
                    type="checkbox"
                    checked={github.repos.includes(repo.fullName)}
                    disabled={busy !== null}
                    onChange={() => void onToggleRepo(repo.fullName)}
                  />
                  <span className="check-main">
                    <span className="doc-title">{repo.fullName}</span>
                    <span className="doc-preview">{repo.description || 'No description'}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="row">
            <button className="primary" onClick={onSync} disabled={busy !== null || !github.repos.length}>
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
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
  )
}
