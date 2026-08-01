import { extractPdfText } from './pdf'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const PDF_MIME = 'application/pdf'

export interface DriveFolder {
  id: string
  name: string
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
}

/** False when no Google OAuth client id was built into the manifest, which makes Drive unusable. */
export function isDriveConfigured(): boolean {
  const manifest = chrome.runtime.getManifest() as { oauth2?: { client_id?: string } }
  return Boolean(manifest.oauth2?.client_id)
}

/**
 * Chrome holds the OAuth token, so Irke never stores or refreshes one itself. An interactive call
 * shows the Google account chooser and reports why it failed; a silent one just answers whether a
 * grant already exists.
 */
export function getDriveToken(interactive: boolean): Promise<string | null> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const failure = chrome.runtime.lastError?.message
      // Older Chrome hands the callback a bare string; newer builds hand it a result object.
      const granted = result as unknown as string | { token?: string } | undefined
      const token = typeof granted === 'string' ? granted : granted?.token

      if (token) resolve(token)
      else if (interactive) reject(new Error(failure ?? 'Google sign-in was cancelled.'))
      else resolve(null)
    })
  })
}

export async function revokeDriveToken(): Promise<void> {
  const token = await getDriveToken(false).catch(() => null)
  if (!token) return
  await new Promise<void>((resolve) => chrome.identity.removeCachedAuthToken({ token }, () => resolve()))
  await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {})
}

async function driveFetch(token: string, path: string): Promise<Response> {
  const response = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) throw new Error('Google session expired. Reconnect Google Drive.')
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`)
  return response
}

export async function listDriveFolders(token: string): Promise<DriveFolder[]> {
  const query = encodeURIComponent(`mimeType = '${FOLDER_MIME}' and trashed = false`)
  const response = await driveFetch(
    token,
    `/files?q=${query}&fields=files(id,name)&pageSize=200&orderBy=name`,
  )
  const body = (await response.json()) as { files?: DriveFolder[] }
  return body.files ?? []
}

export async function listDriveFiles(token: string, folderId: string): Promise<DriveFile[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const response = await driveFetch(
    token,
    `/files?q=${query}&fields=files(id,name,mimeType,webViewLink)&pageSize=200`,
  )
  const body = (await response.json()) as { files?: DriveFile[] }
  return (body.files ?? []).filter((file) => isReadable(file.mimeType))
}

export function isReadable(mimeType: string): boolean {
  return mimeType === GOOGLE_DOC_MIME || mimeType === PDF_MIME || mimeType.startsWith('text/')
}

export async function readDriveFile(token: string, file: DriveFile): Promise<string> {
  if (file.mimeType === GOOGLE_DOC_MIME) {
    const response = await driveFetch(token, `/files/${file.id}/export?mimeType=text/plain`)
    return response.text()
  }

  const response = await driveFetch(token, `/files/${file.id}?alt=media`)
  if (file.mimeType === PDF_MIME) return extractPdfText(await response.arrayBuffer())
  return response.text()
}
