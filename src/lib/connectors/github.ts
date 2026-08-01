const GITHUB_API = 'https://api.github.com'

const MAX_README_CHARS = 20_000

export interface GithubRepo {
  fullName: string
  description: string
  language: string
  topics: string[]
  updatedAt: string
  url: string
}

async function githubFetch(token: string, path: string, accept = 'application/vnd.github+json') {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (response.status === 401) throw new Error('That GitHub token was rejected. Check it and try again.')
  if (response.status === 403) throw new Error('GitHub rate limit or scope problem. Try again later.')
  return response
}

export async function verifyGithubToken(token: string): Promise<string> {
  const response = await githubFetch(token, '/user')
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}).`)
  const body = (await response.json()) as { login?: string }
  if (!body.login) throw new Error('GitHub did not return an account for that token.')
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
