// Replaces the <!-- ANALYTICS --> placeholder in dist/index.html with the
// contents of the ANALYTICS_SCRIPT env var. Runs automatically as `postbuild`
// after `npm run build`. When ANALYTICS_SCRIPT is unset (CI, dev machines),
// the placeholder is left untouched and renders as a harmless HTML comment.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const indexPath = resolve(here, '..', 'dist', 'index.html')
const script = process.env.ANALYTICS_SCRIPT?.trim()
const placeholder = '<!-- ANALYTICS -->'

if (!script) {
  console.log('[inject-analytics] ANALYTICS_SCRIPT not set; leaving placeholder.')
  process.exit(0)
}

if (!existsSync(indexPath)) {
  console.warn(`[inject-analytics] ${indexPath} not found; did vite build run?`)
  process.exit(0)
}

const html = readFileSync(indexPath, 'utf8')

if (!html.includes(placeholder)) {
  console.warn(`[inject-analytics] placeholder "${placeholder}" not found in ${indexPath}; nothing to inject.`)
  process.exit(0)
}

writeFileSync(indexPath, html.replace(placeholder, script))
console.log(`[inject-analytics] injected analytics script into ${indexPath}`)
