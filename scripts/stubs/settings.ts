/** Throwaway stub for `@/lib/settings`. */
import type { Settings } from '../../src/lib/types.ts'

export const DEFAULT_MODELS = { openai: 'gpt-test', anthropic: 'claude-test', openrouter: 'or-test' }

const settings: Settings = {
  provider: 'openai',
  apiKey: 'test-key',
  model: 'gpt-test',
  temperature: 0.4,
  extraInstructions: 'Always write plainly.',
  generationMode: 'polished',
  includeGeneratedInRag: false,
  letterhead: { name: '', email: '', phone: '', location: '', links: '' },
}

export async function getSettings(): Promise<Settings> {
  return settings
}

export async function saveSettings(): Promise<void> {}
