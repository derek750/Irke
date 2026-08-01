const GITHUB_API = 'https://api.github.com'
const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token'

const MAX_README_CHARS = 20_000
const OAUTH_SCOPES = 'read:user repo'

export interface GithubRepo {
  fullName: string
  description: string
  language: string
  topics: string[]
  updatedAt: string
  url: string
}

/** False when no GitHub OAuth client id was built in — sign-in stays unavailable. */
export function isGithubConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GITHUB_CLIENT_ID)
}

function clientId(): string {
  const id = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined
  if (!id) throw new Error('GitHub is not configured for this build.')
  return id
}

/**
 * Opens GitHub's OAuth consent via Chrome's identity flow, then exchanges the code for a token
 * with PKCE so no client secret has to ship in the extension.
 */
export async function signInWithGithub(): Promise<{ token: string; login: string }> {
  const id = clientId()
  const redirectUri = chrome.identity.getRedirectURL()
  const { verifier, challenge } = await createPkce()
  const state = randomUrlSafe(16)

  const authUrl = new URL(GITHUB_AUTHORIZE)
  authUrl.searchParams.set('client_id', id)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', OAUTH_SCOPES)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  const responseUrl = await launchAuth(authUrl.toString())
  const returned = new URL(responseUrl)
  const error = returned.searchParams.get('error_description') ?? returned.searchParams.get('error')
  if (error) throw new Error(error)

  if (returned.searchParams.get('state') !== state) {
    throw new Error('GitHub sign-in could not be verified. Try again.')
  }

  const code = returned.searchParams.get('code')
  if (!code) throw new Error('GitHub did not return an authorization code.')

  const token = await exchangeCode({ clientId: id, code, redirectUri, verifier })
  const login = await fetchGithubLogin(token)
  return { token, login }
}

function launchAuth(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'GitHub sign-in was cancelled.'))
        return
      }
      resolve(responseUrl)
    })
  })
}

async function exchangeCode(input: {
  clientId: string
  code: string
  redirectUri: string
  verifier: string
}): Promise<string> {
  const response = await fetch(GITHUB_TOKEN, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: input.clientId,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
  })

  if (!response.ok) throw new Error(`GitHub token exchange failed (${response.status}).`)

  const body = (await response.json()) as { access_token?: string; error_description?: string; error?: string }
  if (!body.access_token) {
    throw new Error(body.error_description ?? body.error ?? 'GitHub did not return an access token.')
  }
  return body.access_token
}

async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomUrlSafe(32)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

function randomUrlSafe(byteLength: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function githubFetch(token: string, path: string, accept = 'application/vnd.github+json') {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (response.status === 401) throw new Error('GitHub session expired. Sign in again.')
  if (response.status === 403) throw new Error('GitHub rate limit or scope problem. Try again later.')
  return response
}

export async function fetchGithubLogin(token: string): Promise<string> {
  const response = await githubFetch(token, '/user')
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}).`)
  const body = (await response.json()) as { login?: string }
  if (!body.login) throw new Error('GitHub did not return an account.')
  return body.login
}

export async function listGithubRepos(token: string): Promise<GithubRepo[]> {
  const response = await githubFetch(token, '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator')
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}).`)

  const body = (await response.json()) as {
    full_name: string
    description: string | null
    language: string | null
    topics?: string[]
    updated_at: string
    html_url: string
  }[]

  return body.map((repo) => ({
    fullName: repo.full_name,
    description: repo.description ?? '',
    language: repo.language ?? '',
    topics: repo.topics ?? [],
    updatedAt: repo.updated_at,
    url: repo.html_url,
  }))
}

/**
 * Only the prose is worth indexing: the description, topics, and README are where a repo
 * explains what it was for. Source files would swamp retrieval with syntax.
 */
export async function readRepoContext(token: string, repo: GithubRepo): Promise<string> {
  const parts: string[] = []
  if (repo.description) parts.push(repo.description)
  if (repo.language) parts.push(`Primary language: ${repo.language}`)
  if (repo.topics.length) parts.push(`Topics: ${repo.topics.join(', ')}`)

  const response = await githubFetch(token, `/repos/${repo.fullName}/readme`, 'application/vnd.github.raw')
  if (response.ok) {
    const readme = stripMarkdownNoise(await response.text())
    if (readme.trim()) parts.push(readme.slice(0, MAX_README_CHARS))
  }

  return parts.join('\n\n')
}

function stripMarkdownNoise(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>*-]\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
}
