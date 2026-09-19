import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const outDir = join(root, 'store')
const zip = join(outDir, 'irke.zip')

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/ is missing. Run npm run build first.')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
rmSync(zip, { force: true })
execSync('zip -r ../store/irke.zip . -x "*.map" -x "**/*.map"', { cwd: dist, stdio: 'inherit' })
console.log(`Wrote ${zip}`)
