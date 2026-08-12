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
  /** Path relative to the synced root folder, used as the indexed title. */
  path?: string
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

/** Email on the Google account that granted the Drive token. */
export async function getDriveAccountEmail(token: string): Promise<string | null> {
  const response = await driveFetch(token, '/about?fields=user(emailAddress)')
  const body = (await response.json()) as { user?: { emailAddress?: string } }
  return body.user?.emailAddress?.trim() || null
}

async function driveFetch(token: string, path: string): Promise<Response> {
  const response = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (response.ok) return response

  if (response.status === 401) {
    await clearCachedToken(token)
    throw new Error('Google session expired. Disconnect and connect again.')
  }

  if (response.status === 403) {
    await clearCachedToken(token)
    const detail = await readGoogleError(response)
    // Always surface Google's own words — our guesses have been wrong when the API is already on.
    throw new Error(detail || 'Google Drive refused this request (403). Disconnect and connect again.')
  }

  throw new Error(`Google Drive request failed (${response.status}).`)
}

async function clearCachedToken(token: string): Promise<void> {
  await new Promise<void>((resolve) => chrome.identity.removeCachedAuthToken({ token }, () => resolve()))
}

async function readGoogleError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; status?: string; errors?: { reason?: string; message?: string }[] }
    }
    const reason = body.error?.errors?.[0]?.reason
    const message = body.error?.message ?? body.error?.errors?.[0]?.message ?? ''
    if (reason && message) return `${message} (${reason})`
    return message || reason || ''
  } catch {
    return ''
  }
}

/** Confirms the Chrome-issued token actually carries drive.readonly before we hit the Drive API. */
export async function assertDriveScope(token: string): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
  )
  if (!response.ok) return
  const body = (await response.json()) as { scope?: string; error_description?: string }
  const scopes = body.scope?.split(/\s+/) ?? []
  if (!scopes.includes('https://www.googleapis.com/auth/drive.readonly')) {
    await clearCachedToken(token)
    throw new Error(
      'This Google sign-in is missing Drive access. Disconnect, connect again, and accept the Drive permission prompt.',
    )
  }
}

/** Folders directly inside a parent. Use `root` for My Drive. */
export async function listChildFolders(token: string, parentId = 'root'): Promise<DriveFolder[]> {
  await assertDriveScope(token)
  const query = encodeURIComponent(
    `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
  )
  const files = await listAllPages(token, query, 'files(id,name)&orderBy=name')
  return files.map((file) => ({ id: file.id, name: file.name }))
}

/** Name search across the user's Drive folders. */
export async function searchDriveFolders(token: string, name: string): Promise<DriveFolder[]> {
  await assertDriveScope(token)
  const trimmed = name.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  if (!trimmed) return listChildFolders(token, 'root')

  const query = encodeURIComponent(
    `name contains '${trimmed}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
  )
  const files = await listAllPages(token, query, 'files(id,name)&orderBy=name', 50)
  return files.map((file) => ({ id: file.id, name: file.name }))
}

/**
 * Every readable file under a folder, including nested subfolders. Titles use the relative path
 * so "Applications / Acme / cover letter" stays distinguishable after sync.
 */
export async function listDriveFilesRecursive(
  token: string,
  folderId: string,
  pathPrefix = '',
): Promise<DriveFile[]> {
  await assertDriveScope(token)
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const children = await listAllPages(token, query, 'files(id,name,mimeType,webViewLink)&orderBy=folder,name')

  const files: DriveFile[] = []
  for (const child of children) {
    const path = pathPrefix ? `${pathPrefix}/${child.name}` : child.name
    const mimeType = child.mimeType ?? ''
    if (mimeType === FOLDER_MIME) {
      files.push(...(await listDriveFilesRecursive(token, child.id, path)))
      continue
    }
    if (!isReadable(mimeType)) continue
    files.push({
      id: child.id,
      name: child.name,
      mimeType,
      webViewLink: child.webViewLink,
      path,
    })
  }
  return files
}

async function listAllPages(
  token: string,
  query: string,
  fieldsAndOrder: string,
  pageSize = 200,
): Promise<Array<{ id: string; name: string; mimeType?: string; webViewLink?: string }>> {
  const collected: Array<{ id: string; name: string; mimeType?: string; webViewLink?: string }> = []
  let pageToken: string | undefined

  do {
    const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    const response = await driveFetch(
      token,
      `/files?q=${query}&fields=nextPageToken,${fieldsAndOrder}&pageSize=${pageSize}${pageParam}`,
    )
    const body = (await response.json()) as {
      files?: Array<{ id: string; name: string; mimeType?: string; webViewLink?: string }>
      nextPageToken?: string
    }
    collected.push(...(body.files ?? []))
    pageToken = body.nextPageToken
  } while (pageToken)

  return collected
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
