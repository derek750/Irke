import type { LlmProvider, Settings } from './types'

const SETTINGS_KEY = 'irke:settings'

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKey: '',
  model: DEFAULT_MODELS.openai,
  temperature: 0.4,
  extraInstructions: '',
  generationMode: 'polished',
  includeGeneratedInRag: false,
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY)
  const saved = stored[SETTINGS_KEY] as Partial<Settings> & { provider?: string } | undefined
  const merged = { ...DEFAULT_SETTINGS, ...saved }

  // Drop retired Anthropic provider if still stored from an older build.
  if (merged.provider !== 'openai' && merged.provider !== 'openrouter') {
    merged.provider = 'openai'
    merged.model = DEFAULT_MODELS.openai
  }

  return merged
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
}
