import { useState } from 'react'

import { AiTab } from './AiTab'
import { AnswersTab } from './AnswersTab'
import { ContextTab } from './ContextTab'

const TABS = [
  { id: 'context', label: 'Context', render: () => <ContextTab /> },
  { id: 'answers', label: 'Answer bank', render: () => <AnswersTab /> },
  { id: 'ai', label: 'AI provider', render: () => <AiTab /> },
] as const

export function Options() {
  const [active, setActive] = useState<(typeof TABS)[number]['id']>('context')
  const current = TABS.find((tab) => tab.id === active) ?? TABS[0]

  return (
    <main className="shell">
      <header className="shell-header">
        <h1>Irke</h1>
        <p className="hint">
          Connect your context once. Irke drafts the open-ended application questions — cover letters,
          "tell us about a time", why this company — in your voice, from your own material, and never
          submits anything for you.
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
