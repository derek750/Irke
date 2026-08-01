import { getConnections, patchConnections } from '../connections'
import { replaceDocsForSource } from '../db'
import type { ContextDoc } from '../types'
import { getDriveToken, listDriveFiles, readDriveFile } from './drive'
import { listGithubRepos, readRepoContext } from './github'
import { extractPdfText } from './pdf'

export interface SyncResult {
  indexed: number
  skipped: string[]
}

const MIN_USEFUL_CHARS = 40

export async function syncDrive(): Promise<SyncResult> {
  const connections = await getConnections()
  if (!connections.drive.folderId) throw new Error('Pick a Google Drive folder first.')

  const token = await getDriveToken(false)
  if (!token) throw new Error('Google session expired. Reconnect Google Drive.')

  const files = await listDriveFiles(token, connections.drive.folderId)
  const docs: ContextDoc[] = []
  const skipped: string[] = []

  for (const file of files) {
    try {
      const text = await readDriveFile(token, file)
      if (text.trim().length < MIN_USEFUL_CHARS) {
        skipped.push(file.name)
        continue
      }
      docs.push({
        id: `drive:${file.id}`,
        source: 'drive',
        title: file.name,
        text: text.trim(),
        createdAt: Date.now(),
        externalId: file.id,
        url: file.webViewLink,
      })
    } catch {
      skipped.push(file.name)
    }
  }

  await replaceDocsForSource('drive', docs)
  await patchConnections({ drive: { ...connections.drive, syncedAt: Date.now() } })
  return { indexed: docs.length, skipped }
}

export async function syncGithub(): Promise<SyncResult> {
  const connections = await getConnections()
  const { token, repos: selected } = connections.github
  if (!token) throw new Error('Connect GitHub first.')
  if (!selected.length) throw new Error('Select at least one repository.')

  const repos = (await listGithubRepos(token)).filter((repo) => selected.includes(repo.fullName))
  const docs: ContextDoc[] = []
  const skipped: string[] = []

  for (const repo of repos) {
    try {
      const text = await readRepoContext(token, repo)
      if (text.trim().length < MIN_USEFUL_CHARS) {
        skipped.push(repo.fullName)
        continue
      }
      docs.push({
        id: `github:${repo.fullName}`,
        source: 'github',
        title: repo.fullName,
        text: text.trim(),
        createdAt: Date.now(),
        externalId: repo.fullName,
        url: repo.url,
      })
    } catch {
      skipped.push(repo.fullName)
    }
  }

  await replaceDocsForSource('github', docs)
  await patchConnections({ github: { ...connections.github, syncedAt: Date.now() } })
  return { indexed: docs.length, skipped }
}

export async function readUploadedFile(file: File): Promise<string> {
  if (/\.pdf$/i.test(file.name)) return extractPdfText(await file.arrayBuffer())
  if (/\.(txt|md|markdown)$/i.test(file.name)) return file.text()
  throw new Error('PDF, text, and Markdown files only.')
}
