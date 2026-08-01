import { defineManifest } from '@crxjs/vite-plugin'
import { loadEnv } from 'vite'

import pkg from './package.json'

/**
 * Your own Google Cloud OAuth client (application type: Chrome Extension), set as
 * VITE_GOOGLE_CLIENT_ID in `.env.local`. Chrome refuses to load the extension if `oauth2` is
 * present but empty, so the block is omitted entirely when it is unset — everything except the
 * Google Drive connection still works.
 */
const googleClientId = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), 'VITE_')
  .VITE_GOOGLE_CLIENT_ID

export default defineManifest({
  manifest_version: 3,
  name: 'Irke — Job Application Copilot',
  short_name: 'Irke',
  version: pkg.version,
  description: pkg.description,
  permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'webNavigation', 'identity'],
  host_permissions: ['<all_urls>'],
  ...(googleClientId
    ? {
        oauth2: {
          client_id: googleClientId,
          scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        },
      }
    : {}),
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
