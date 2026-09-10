import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8')
}

function requireCondition(condition, message) {
  if (!condition) failures.push(message)
}

function requireFile(relativePath) {
  const absolutePath = path.join(frontendRoot, relativePath)
  requireCondition(fs.existsSync(absolutePath), `missing ${relativePath}`)
  return absolutePath
}

function readPngSize(relativePath) {
  const buffer = fs.readFileSync(requireFile(relativePath))
  requireCondition(buffer.subarray(1, 4).toString('ascii') === 'PNG', `${relativePath} is not a PNG`)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function requirePngSize(relativePath, expected) {
  const size = readPngSize(relativePath)
  requireCondition(
    size.width === expected && size.height === expected,
    `${relativePath} must be ${expected}x${expected}, got ${size.width}x${size.height}`,
  )
}

const manifest = JSON.parse(read('public/manifest.json'))
const indexHtml = read('index.html')
const sourceWorker = read('public/sw.js')
const mainSource = read('src/main.tsx')
const updateHookSource = read('src/hooks/useServiceWorkerUpdate.ts')
const updateLifecycleSource = read('src/platform/updateLifecycle.ts')
const viteConfigSource = read('vite.config.ts')
const robotsPath = requireFile('public/robots.txt')
const robotsSource = fs.readFileSync(robotsPath, 'utf8')
const crawlerDirectives = 'noindex, nofollow, noarchive, nosnippet, noimageindex'

requireCondition(
  robotsSource.trim() === 'User-agent: *\nDisallow: /',
  'robots.txt must deny all crawlers by default',
)
requireCondition(
  indexHtml.includes(`name="robots" content="${crawlerDirectives}, nocache"`),
  'index.html must keep the private-app robots meta policy',
)
requireCondition(
  viteConfigSource.includes(`'X-Robots-Tag': '${crawlerDirectives}'`),
  'Vite must emit the private-app X-Robots-Tag policy in dev and preview',
)

for (const field of ['name', 'short_name', 'id', 'start_url', 'scope', 'display']) {
  requireCondition(Boolean(manifest[field]), `manifest is missing ${field}`)
}

requireCondition(manifest.display === 'standalone', 'manifest display must remain standalone')
requireCondition(manifest.id === '/', 'manifest id must remain stable at /')
requireCondition(Array.isArray(manifest.icons), 'manifest icons must be an array')

const iconAtSize = (size, purpose = 'any') => manifest.icons?.some((icon) =>
  icon.sizes === `${size}x${size}` && (icon.purpose ?? 'any').split(' ').includes(purpose),
)

requireCondition(iconAtSize(192), 'manifest needs a 192x192 any-purpose icon')
requireCondition(iconAtSize(512), 'manifest needs a 512x512 any-purpose icon')
requireCondition(iconAtSize(512, 'maskable'), 'manifest needs a 512x512 maskable icon')
requireCondition(
  manifest.icons?.some((icon) =>
    icon.src === '/icon-maskable.svg' &&
    icon.sizes === 'any' &&
    icon.purpose.split(' ').includes('maskable'),
  ),
  'manifest needs a scalable maskable icon',
)

requirePngSize('public/icon-192.png', 192)
requirePngSize('public/icon-512.png', 512)
requirePngSize('public/icon-maskable-512.png', 512)
requirePngSize('public/apple-touch-icon.png', 180)
requireFile('public/favicon.svg')
requireFile('public/icon-maskable.svg')

requireCondition(/<link[^>]+rel="manifest"[^>]+href="\/manifest\.json"/.test(indexHtml), 'index.html must link /manifest.json')
const appleTouchIcons = indexHtml.match(/<link[^>]+rel="apple-touch-icon"[^>]*>/g) ?? []
requireCondition(appleTouchIcons.length === 1, 'index.html must have one canonical Apple touch icon')
requireCondition(
  appleTouchIcons[0]?.includes('sizes="180x180"') && appleTouchIcons[0]?.includes('href="/apple-touch-icon.png"'),
  'Apple touch icon must be the 180x180 PNG',
)

const htmlTheme = indexHtml.match(/<meta[^>]+name="theme-color"[^>]+content="([^"]+)"/)?.[1]
requireCondition(Boolean(htmlTheme), 'index.html is missing theme-color')
requireCondition(htmlTheme === manifest.theme_color, 'HTML and manifest theme colors must match')
requireCondition(manifest.background_color === htmlTheme, 'manifest background_color must match first-paint theme color')

requireCondition(sourceWorker.includes("const CACHE_PREFIX = 'beskarfolio'"), 'service-worker cache prefix changed unexpectedly')
requireCondition(sourceWorker.includes("key.startsWith(`${CACHE_PREFIX}-`)"), 'cache cleanup must remain prefix-scoped')
requireCondition(sourceWorker.includes("url.pathname.startsWith('/api/')"), 'service worker must identify /api requests')
requireCondition(
  /navigator\.serviceWorker\.register\('\/sw\.js'[,)]/.test(updateLifecycleSource),
  'service worker URL must remain /sw.js',
)
const installHandler = sourceWorker.match(/self\.addEventListener\('install',[\s\S]*?\n}\)/)?.[0] ?? ''
requireCondition(!installHandler.includes('skipWaiting'), 'install handler must leave a new worker waiting')
requireCondition(sourceWorker.includes("event.data?.type !== 'SKIP_WAITING'"), 'worker must accept only the SKIP_WAITING update message')
requireCondition(sourceWorker.includes('event.waitUntil(self.skipWaiting())'), 'SKIP_WAITING must extend the worker message lifetime')
requireCondition(mainSource.includes('startUpdateLifecycle'), 'main entrypoint must start the update lifecycle')
requireCondition(updateHookSource.includes('subscribeToUpdateLifecycle'), 'update hook must subscribe to lifecycle state')
requireCondition(updateLifecycleSource.includes("addEventListener('updatefound'"), 'update lifecycle must observe newly installed workers')
requireCondition(updateLifecycleSource.includes("addEventListener('controllerchange'"), 'update lifecycle must observe worker control changes')
requireCondition(updateLifecycleSource.includes('reloaded'), 'controller changes need a guarded reload')
requireCondition(updateLifecycleSource.includes('60 * 60 * 1000'), 'automatic update checks must be hourly')
requireCondition(updateLifecycleSource.includes("document.visibilityState === 'visible'"), 'returning to a visible app must check overdue updates')

const builtWorkerPath = requireFile('dist/sw.js')
const builtWorker = fs.readFileSync(builtWorkerPath, 'utf8')
const builtRobotsPath = requireFile('dist/robots.txt')
const builtRobots = fs.readFileSync(builtRobotsPath, 'utf8')
requireCondition(
  builtRobots.trim() === robotsSource.trim(),
  'built robots.txt must preserve the private-app crawler policy',
)
requireCondition(!builtWorker.includes('__BUILD_VERSION__'), 'generated worker still contains BUILD_VERSION placeholder')
requireCondition(!builtWorker.includes('__PRECACHE_URLS__'), 'generated worker still contains PRECACHE_URLS placeholder')

const precacheText = builtWorker.match(/const PRECACHE_URLS = (\[[\s\S]*?\])\n/)?.[1]
requireCondition(Boolean(precacheText), 'generated worker has no readable precache list')

if (precacheText) {
  const precache = JSON.parse(precacheText)
  for (const requiredPath of ['/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']) {
    requireCondition(precache.includes(requiredPath), `precache is missing ${requiredPath}`)
  }
  requireCondition(precache.some((item) => /^\/assets\/.*\.js$/.test(item)), 'precache is missing the JavaScript bundle')
  requireCondition(precache.some((item) => /^\/assets\/.*\.css$/.test(item)), 'precache is missing the CSS bundle')
}

if (failures.length > 0) {
  console.error('PWA contract failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('PWA contract passed (user-controlled waiting-worker activation)')
