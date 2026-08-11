const CONNECTIONS_KEY = 'irke:connections'

export interface DriveConnection {
  /** Empty until the user picks a folder; only files inside it are ever read. */
  folderId: string
  folderName: string
  /** Google account email for the connected Drive grant. */
  email: string
  syncedAt: number | null
}

export interface GithubConnection {
  /** OAuth access token from sign-in. Local only, never logged, never sent anywhere but api.github.com. */
  token: string
  login: string
  /** `owner/repo` for each repo the user opted in to. */
  repos: string[]
  syncedAt: number | null
}

export interface Connections {
  drive: DriveConnection
  github: GithubConnection
}

export const EMPTY_CONNECTIONS: Connections = {
  drive: { folderId: '', folderName: '', email: '', syncedAt: null },
  github: { token: '', login: '', repos: [], syncedAt: null },
}

export async function getConnections(): Promise<Connections> {
  const stored = await chrome.storage.local.get(CONNECTIONS_KEY)
  const saved = stored[CONNECTIONS_KEY] as Partial<Connections> | undefined
  return {
    drive: { ...EMPTY_CONNECTIONS.drive, ...saved?.drive },
    github: { ...EMPTY_CONNECTIONS.github, ...saved?.github },
  }
}

export async function saveConnections(connections: Connections): Promise<void> {
  await chrome.storage.local.set({ [CONNECTIONS_KEY]: connections })
}

export async function patchConnections(changes: Partial<Connections>): Promise<Connections> {
  const current = await getConnections()
  const next = { ...current, ...changes }
  await saveConnections(next)
  return next
}
