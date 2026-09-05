import type { Letterhead, LlmProvider, Settings } from './types'

const SETTINGS_KEY = 'irke:settings'
const OPENROUTER_KEY_PREFIX = 'sk-or-'

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
}

export const DEFAULT_LETTERHEAD: Letterhead = {
  name: '',
  email: '',
  phone: '',
  location: '',
  links: '',
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKey: '',
  model: DEFAULT_MODELS.openai,
  temperature: 0.4,
  extraInstructions: '',
  generationMode: 'polished',
  includeGeneratedInRag: false,
  letterhead: DEFAULT_LETTERHEAD,
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY)
  const saved = stored[SETTINGS_KEY] as Partial<Settings> & { provider?: string } | undefined
  // Letterhead needs its own merge; a spread would drop fields added after the user last saved.
  const merged = {
    ...DEFAULT_SETTINGS,
    ...saved,
    letterhead: { ...DEFAULT_LETTERHEAD, ...saved?.letterhead },
  }

  // Drop retired Anthropic provider if still stored from an older build.
  if (merged.provider !== 'openai' && merged.provider !== 'openrouter') {
    merged.provider = 'openai'
    merged.model = DEFAULT_MODELS.openai
  }

  // Every surface reads settings through here, so none of them can disagree about routing.
  return { ...merged, ...reconcileProvider(merged) }
}

/**
 * An `sk-or-` key authenticates nowhere but OpenRouter, so trust the key over the dropdown
 * rather than posting it to OpenAI and getting a 401 the user cannot explain.
 */
export function reconcileProvider({
  apiKey,
  provider,
  model,
}: Pick<Settings, 'apiKey' | 'provider' | 'model'>): Pick<Settings, 'provider' | 'model'> {
  if (provider === 'openrouter' || !apiKey.trim().startsWith(OPENROUTER_KEY_PREFIX)) {
    return { provider, model }
  }

  // OpenRouter slugs are always `vendor/model`; a bare name is left over from the old provider.
  return { provider: 'openrouter', model: model.includes('/') ? model : DEFAULT_MODELS.openrouter }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
}
