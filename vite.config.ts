import { fileURLToPath } from 'node:url'

import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import manifest from './manifest.config'

export default defineConfig(({ mode }) => ({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',
    // Keep maps in `vite` / `vite build --mode development`. The Chrome Web Store zip
    // is production, and maps would ship the full source inside the package.
    sourcemap: mode !== 'production',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
}))
