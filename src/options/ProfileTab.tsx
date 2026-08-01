import { useEffect, useState } from 'react'

import { PROFILE_FIELD_LABELS, getProfile, saveProfile } from '@/lib/settings'
import type { Profile } from '@/lib/types'

const MULTI_CHOICE_HINTS: Partial<Record<keyof Profile, string>> = {
  workAuthorization: 'e.g. Authorized to work in the US without sponsorship',
  needsSponsorship: 'Yes or No',
  salaryExpectation: 'e.g. $120,000',
  noticePeriod: 'e.g. 2 weeks',
}

export function ProfileTab() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    void getProfile().then(setProfile)
  }, [])

  if (!profile) return <p className="hint">Loading…</p>

  const update = (key: keyof Profile, value: string) => {
    setProfile({ ...profile, [key]: value })
    setSavedAt(null)
  }

  const onSave = async () => {
    await saveProfile(profile)
    setSavedAt(Date.now())
  }

  return (
    <section className="section">
      <div>
        <h3>Repeat answers</h3>
        <p className="hint">
          These fill instantly on every application, with no AI call and no cost.
        </p>
      </div>

      <div className="field-grid">
        {(Object.keys(PROFILE_FIELD_LABELS) as (keyof Profile)[]).map((key) => (
          <div key={key}>
            <label htmlFor={key}>{PROFILE_FIELD_LABELS[key]}</label>
            <input
              id={key}
              value={profile[key]}
              placeholder={MULTI_CHOICE_HINTS[key] ?? ''}
              onChange={(event) => update(key, event.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="save-bar">
        <button className="primary" onClick={onSave}>
          Save profile
        </button>
        {savedAt && <span className="badge success">Saved</span>}
      </div>
    </section>
  )
}
