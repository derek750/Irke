import { useState } from 'react'

import { AiTab } from './AiTab'
import { AnswersTab } from './AnswersTab'
import { ConnectorsTab } from './ConnectorsTab'
import { DataTab } from './DataTab'

const TABS = [
  { id: 'data', label: 'Data', render: () => <DataTab /> },
  { id: 'connectors', label: 'Connectors', render: () => <ConnectorsTab /> },
  { id: 'answers', label: 'Answer bank', render: () => <AnswersTab /> },
  { id: 'ai', label: 'AI provider', render: () => <AiTab /> },
] as const

export function Options() {
  const [active, setActive] = useState<(typeof TABS)[number]['id']>('data')
  const current = TABS.find((tab) => tab.id === active) ?? TABS[0]

  return (
    <main className="shell">
      <header className="shell-header">
        <h1>Dashboard</h1>
        <p className="hint">Wire up context and your API key. UI is rough — functional for now.</p>
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
