import type { LlmProvider, Settings } from './types'

interface CompletionInput {
  settings: Settings
  system: string
  user: string
}

const OPENAI_COMPAT_URLS: Record<Exclude<LlmProvider, 'anthropic'>, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
}

export async function complete({ settings, system, user }: CompletionInput): Promise<string> {
  if (!settings.apiKey.trim()) {
    throw new Error('No API key set. Open the dashboard and add your provider key.')
  }

  const text =
    settings.provider === 'anthropic'
      ? await callAnthropic({ settings, system, user })
      : await callOpenaiCompat({ settings, system, user })

  const trimmed = text.trim()
  if (!trimmed) throw new Error('The model returned an empty answer. Try regenerating.')
  return trimmed
}

async function callOpenaiCompat({ settings, system, user }: CompletionInput): Promise<string> {
  const provider = settings.provider === 'openrouter' ? 'openrouter' : 'openai'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.apiKey}`,
  }
  // Optional OpenRouter ranking headers; ignored by OpenAI.
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/derek750/Irke'
    headers['X-Title'] = 'Irke'
  }

  const response = await fetch(OPENAI_COMPAT_URLS[provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model,
      temperature: settings.temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  const label = provider === 'openrouter' ? 'OpenRouter' : 'OpenAI'
  const payload = await readJson(response, label)
  const content = payload?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

async function callAnthropic({ settings, system, user }: CompletionInput): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      // Required for browser-originated calls; the key stays on the user's machine.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 1024,
      temperature: settings.temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  const payload = await readJson(response, 'Anthropic')
  const blocks = payload?.content
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block: { type?: string }) => block?.type === 'text')
    .map((block: { text?: string }) => block.text ?? '')
    .join('')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(response: Response, provider: string): Promise<any> {
  const raw = await response.text()
  let payload: unknown = null
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const detail =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload as any)?.error?.message ?? raw.slice(0, 200) ?? response.statusText
    throw new Error(`${provider} request failed (${response.status}): ${detail}`)
  }

  return payload
}
