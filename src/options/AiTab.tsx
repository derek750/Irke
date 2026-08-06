import { useEffect, useState } from 'react'

import { DEFAULT_MODELS, getSettings, saveSettings } from '@/lib/settings'
import type { GenerationMode, LlmProvider, Settings } from '@/lib/types'

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  openrouter: 'OpenRouter',
}

const MODE_LABELS: Record<GenerationMode, string> = {
  polished: 'Polished (draft + revise)',
  fast: 'Fast (draft only)',
}

export function AiTab() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    void getSettings().then(setSettings)
  }, [])

  if (!settings) return <p className="hint">Loading…</p>

  const update = (changes: Partial<Settings>) => {
    setSettings({ ...settings, ...changes })
    setSavedAt(null)
  }

  const onProviderChange = (provider: LlmProvider) =>
    update({ provider, model: DEFAULT_MODELS[provider] })

  const onSave = async () => {
    await saveSettings(settings)
    setSavedAt(Date.now())
  }

  return (
    <section className="section">
      <div>
        <h3>AI provider</h3>
        <p className="hint">
          Your key is stored locally and used only for direct calls from this browser to your provider.
          Irke has no server.
        </p>
      </div>

      <div className="card stack">
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
            placeholder={settings.provider === 'openrouter' ? 'sk-or-…' : 'sk-…'}
            onChange={(event) => update({ apiKey: event.target.value })}
          />
        </div>

        <div>
          <label htmlFor="temperature">Temperature — {settings.temperature.toFixed(2)}</label>
          <input
            id="temperature"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.temperature}
            onChange={(event) => update({ temperature: Number(event.target.value) })}
          />
          <p className="hint">Lower stays close to your documents. Higher varies the wording.</p>
        </div>

        <div>
          <label htmlFor="generation-mode">Generation mode</label>
          <select
            id="generation-mode"
            value={settings.generationMode}
            onChange={(event) => update({ generationMode: event.target.value as GenerationMode })}
          >
            {(Object.keys(MODE_LABELS) as GenerationMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <p className="hint">
            Polished runs a second editor pass that strips AI tells. Fast skips it — roughly half the
            wait and cost when you are iterating.
          </p>
        </div>

        <div>
          <label htmlFor="extra">Extra instructions</label>
          <textarea
            id="extra"
            value={settings.extraInstructions}
            rows={4}
            placeholder="e.g. Keep it direct and plain. No corporate buzzwords. Never mention salary."
            onChange={(event) => update({ extraInstructions: event.target.value })}
          />
          <p className="hint">
            Also editable on the Generate tab when you want to try a draft with different steering.
          </p>
        </div>

        <div className="save-bar">
          <button className="primary" onClick={onSave}>
            Save
          </button>
          {savedAt && <span className="badge success">Saved</span>}
        </div>
      </div>
    </section>
  )
}
