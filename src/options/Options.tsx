import { useState, type ReactNode } from 'react'

import { AiTab } from './AiTab'
import { ConnectorsTab } from './ConnectorsTab'
import { DataTab } from './DataTab'
import { GenerateTab } from './GenerateTab'

type NavId = 'generate' | 'context' | 'connectors' | 'settings'

type NavItem = { id: NavId; label: string; icon: ReactNode; render: () => ReactNode }

const PRIMARY_NAVS: NavItem[] = [
  {
    id: 'generate',
    label: 'Generate',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
    render: () => <GenerateTab />,
  },
  {
    id: 'context',
    label: 'Context',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5v-9Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M8 9.5h8M8 12.5h8M8 15.5h5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
    render: () => <DataTab />,
  },
  {
    id: 'connectors',
    label: 'Connectors',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8.5 12h7M7 8.5a3.5 3.5 0 1 1 0 7H8.5M16 8.5H15.5a3.5 3.5 0 1 1 0 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    render: () => <ConnectorsTab />,
  },
]

const SETTINGS_NAV: NavItem = {
  id: 'settings',
  label: 'Settings',
  icon: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  render: () => <AiTab />,
}

const ALL_NAVS = [...PRIMARY_NAVS, SETTINGS_NAV]

function NavButton({
  nav,
  active,
  onSelect,
}: {
  nav: NavItem
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`topbar-link${active ? ' is-active' : ''}`}
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
    >
      <span className="topbar-icon">{nav.icon}</span>
      <span>{nav.label}</span>
    </button>
  )
}

export function Options() {
  const [active, setActive] = useState<NavId>('generate')
  const current = ALL_NAVS.find((nav) => nav.id === active) ?? PRIMARY_NAVS[0]

  return (
    <div className="app">
      <nav className="topbar" aria-label="Main">
        <div className="topbar-inner">
          <div className="topbar-primary">
            {PRIMARY_NAVS.map((nav) => (
              <NavButton
                key={nav.id}
                nav={nav}
                active={active === nav.id}
                onSelect={() => setActive(nav.id)}
              />
            ))}
          </div>
          <div className="topbar-trailing">
            <NavButton
              nav={SETTINGS_NAV}
              active={active === 'settings'}
              onSelect={() => setActive('settings')}
            />
          </div>
        </div>
      </nav>

      <main className="workspace">{current.render()}</main>
    </div>
  )
}
