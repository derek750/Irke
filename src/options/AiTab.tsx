import { useEffect, useRef, useState, type ReactNode } from 'react'

import { sendToBackground } from '@/lib/messages'
import { DEFAULT_MODELS, getSettings, reconcileProvider, saveSettings } from '@/lib/settings'
import type { GenerationMode, Letterhead, LlmProvider, Settings } from '@/lib/types'

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
}

const MODE_LABELS: Record<GenerationMode, string> = {
  polished: 'Polished',
  fast: 'Fast',
}

type SettingsGroupId = 'model' | 'instructions' | 'letterhead'

function SettingsGroup({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: SettingsGroupId
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="source-group">
      <button
        type="button"
        className="source-group-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`settings-${id}`}
      >
        <span className="source-group-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="source-group-label">{label}</span>
      </button>
      {open && (
        <div id={`settings-${id}`} className="source-group-body stack">
          {children}
        </div>
      )}
    </div>
  )
}

export function AiTab() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [openGroups, setOpenGroups] = useState<Partial<Record<SettingsGroupId, boolean>>>({})
  const [detectedName, setDetectedName] = useState<string | null>(null)
  const askedForName = useRef(false)

  useEffect(() => {
    void getSettings().then(setSettings)
  }, [])

  // Worth asking once the section is open, and only ever once: a lookup that finds nothing is
  // not cached in the worker, so re-asking on every expand would spend a model call each time.
  useEffect(() => {
    if (!openGroups.letterhead || askedForName.current) return
    askedForName.current = true

    void sendToBackground({ type: 'bg:resolveLetterheadName' }).then((response) => {
      if (response.ok && response.type === 'letterheadName') setDetectedName(response.name)
    })
  }, [openGroups.letterhead])

  if (!settings) return null

  const update = (changes: Partial<Settings>) => {
    setSettings({ ...settings, ...changes })
    setSavedAt(null)
  }

  const onProviderChange = (provider: LlmProvider) =>
    update({ provider, model: DEFAULT_MODELS[provider] })

  // Pasting an OpenRouter key switches the provider in front of the user, so the dropdown never
  // claims a destination the key cannot reach.
  const onApiKeyChange = (apiKey: string) =>
    update({ apiKey, ...reconcileProvider({ ...settings, apiKey }) })

  const updateLetterhead = (changes: Partial<Letterhead>) =>
    update({ letterhead: { ...settings.letterhead, ...changes } })

  const onSave = async () => {
    await saveSettings(settings)
    setSavedAt(Date.now())
  }

  const toggle = (id: SettingsGroupId) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }))
  }

  const isOpen = (id: SettingsGroupId) => openGroups[id] ?? false

  return (
    <section className="section">
      <div className="stack">
        <h3>Generation mode</h3>
        <select
          id="generation-mode"
          value={settings.generationMode}
          onChange={(event) => update({ generationMode: event.target.value as GenerationMode })}
          aria-label="Generation mode"
        >
          {(Object.keys(MODE_LABELS) as GenerationMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      <div className="doc-list">
        <SettingsGroup
          id="model"
          label="Model"
          open={isOpen('model')}
          onToggle={() => toggle('model')}
        >
          <div className="grid-2">
            <div>
              <label htmlFor="provider">Provider</label>
              <select
                id="provider"
                value={settings.provider}
                onChange={(event) => onProviderChange(event.target.value as LlmProvider)}
              >
                {(Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((provider) => (
                  <option key={provider} value={provider}>
                    {PROVIDER_LABELS[provider]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="model">Model</label>
              <input
                id="model"
                value={settings.model}
                onChange={(event) => update({ model: event.target.value })}
              />
            </div>
          </div>

          <div>
            <label htmlFor="api-key">API key</label>
            <input
              id="api-key"
              type="password"
              value={settings.apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup
          id="instructions"
          label="Instructions"
          open={isOpen('instructions')}
          onToggle={() => toggle('instructions')}
        >
          <div>
            <label htmlFor="extra">Extra instructions</label>
            <textarea
              id="extra"
              value={settings.extraInstructions}
              rows={5}
              onChange={(event) => update({ extraInstructions: event.target.value })}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup
          id="letterhead"
          label="Letterhead"
          open={isOpen('letterhead')}
          onToggle={() => toggle('letterhead')}
        >
          <div className="grid-2">
            <div>
              <label htmlFor="letterhead-name">Full name</label>
              <input
                id="letterhead-name"
                value={settings.letterhead.name}
                placeholder={detectedName ?? 'Found in your context when left blank'}
                onChange={(event) => updateLetterhead({ name: event.target.value })}
              />
            </div>

            <div>
              <label htmlFor="letterhead-email">Email</label>
              <input
                id="letterhead-email"
                value={settings.letterhead.email}
                onChange={(event) => updateLetterhead({ email: event.target.value })}
              />
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label htmlFor="letterhead-phone">Phone</label>
              <input
                id="letterhead-phone"
                value={settings.letterhead.phone}
                onChange={(event) => updateLetterhead({ phone: event.target.value })}
              />
            </div>

            <div>
              <label htmlFor="letterhead-location">Location</label>
              <input
                id="letterhead-location"
                value={settings.letterhead.location}
                placeholder="City, State"
                onChange={(event) => updateLetterhead({ location: event.target.value })}
              />
            </div>
          </div>

          <div>
            <label htmlFor="letterhead-links">Links</label>
            <input
              id="letterhead-links"
              value={settings.letterhead.links}
              placeholder="github.com/you · linkedin.com/in/you"
              onChange={(event) => updateLetterhead({ links: event.target.value })}
            />
          </div>
        </SettingsGroup>
      </div>

      <label className="settings-check" htmlFor="include-generated">
        <input
          id="include-generated"
          type="checkbox"
          checked={settings.includeGeneratedInRag}
          onChange={(event) => update({ includeGeneratedInRag: event.target.checked })}
        />
        Include AI generations as context
      </label>

      <div className="save-bar">
        <button className="primary" onClick={onSave}>
          Save
        </button>
        {savedAt && <span className="badge success">Saved</span>}
      </div>
    </section>
  )
}
