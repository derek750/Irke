import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/ui/theme.css'
import { SidePanel } from './SidePanel'
import './sidepanel.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root')

createRoot(container).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
)
