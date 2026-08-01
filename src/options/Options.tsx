import { useState } from 'react'

import { AiTab } from './AiTab'
import { AnswersTab } from './AnswersTab'
import { BrainTab } from './BrainTab'
import { ProfileTab } from './ProfileTab'

const TABS = [
  { id: 'brain', label: 'Brain', render: () => <BrainTab /> },
  { id: 'profile', label: 'Profile', render: () => <ProfileTab /> },
  { id: 'answers', label: 'Answer bank', render: () => <AnswersTab /> },
  { id: 'ai', label: 'AI provider', render: () => <AiTab /> },
] as const

export function Options() {
  const [active, setActive] = useState<(typeof TABS)[number]['id']>('brain')
  const current = TABS.find((tab) => tab.id === active) ?? TABS[0]

  return (
    <main className="shell">
      <header className="shell-header">
        <h1>Irke</h1>
        <p className="hint">
          Feed it your context once. It drafts application answers in your voice, grounded in your own
          documents, and never submits anything for you.
        </p>
      </header>

      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={active === tab.id ? 'primary' : 'ghost'}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {current.render()}
    </main>
  )
}
