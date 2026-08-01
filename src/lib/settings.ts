import type { LlmProvider, Profile, Settings } from './types'

const SETTINGS_KEY = 'irke:settings'
const PROFILE_KEY = 'irke:profile'

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKey: '',
  model: DEFAULT_MODELS.openai,
  temperature: 0.4,
  extraInstructions: '',
}

export const EMPTY_PROFILE: Profile = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  linkedinUrl: '',
  githubUrl: '',
  portfolioUrl: '',
  workAuthorization: '',
  needsSponsorship: '',
  salaryExpectation: '',
  noticePeriod: '',
  earliestStartDate: '',
  pronouns: '',
}

export const PROFILE_FIELD_LABELS: Record<keyof Profile, string> = {
  fullName: 'Full name',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  linkedinUrl: 'LinkedIn URL',
  githubUrl: 'GitHub URL',
  portfolioUrl: 'Portfolio / website',
  workAuthorization: 'Work authorization',
  needsSponsorship: 'Needs visa sponsorship',
  salaryExpectation: 'Salary expectation',
  noticePeriod: 'Notice period',
  earliestStartDate: 'Earliest start date',
  pronouns: 'Pronouns',
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined) }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
}

export async function getProfile(): Promise<Profile> {
  const stored = await chrome.storage.local.get(PROFILE_KEY)
  return { ...EMPTY_PROFILE, ...(stored[PROFILE_KEY] as Partial<Profile> | undefined) }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_KEY]: profile })
}
