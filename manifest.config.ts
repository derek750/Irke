import { defineManifest } from '@crxjs/vite-plugin'

import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'Irke — Job Application Copilot',
  short_name: 'Irke',
  version: pkg.version,
  description: pkg.description,
  permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'webNavigation'],
  host_permissions: ['<all_urls>'],
  action: {
    default_title: 'Open Irke',
  },
  options_page: 'src/options/index.html',
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
      all_frames: true,
    },
  ],
})
