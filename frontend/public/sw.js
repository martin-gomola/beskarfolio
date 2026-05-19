// BeskarFolio Service Worker
// Build metadata is injected at build time by Vite.
const BUILD_VERSION = '__BUILD_VERSION__'
const CACHE_NAME = `beskarfolio-${BUILD_VERSION}`
const OFFLINE_DOCUMENT_URL = '/index.html'
const PRECACHE_URLS = __PRECACHE_URLS__

const STATIC_ASSETS = Array.from(new Set([
  '/',
  OFFLINE_DOCUMENT_URL,
  '/manifest.json',
  ...PRECACHE_URLS,
]))

const isSameOrigin = (url) => url.origin === self.location.origin

const isCacheableStaticRequest = (request, url) => (
  isSameOrigin(url) &&
  !url.pathname.startsWith('/api/') &&
  request.mode !== 'navigate'
)

const getCacheKey = (request) => {
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    return OFFLINE_DOCUMENT_URL
  }

  if (isCacheableStaticRequest(request, url)) {
    return url.pathname
  }

  return request
}

const matchCachedResponse = (request) => caches.match(getCacheKey(request))

const cachePutSafe = async (request, response) => {
  if (!response || response.bodyUsed) return
  if (!response.ok) return
  if (response.status === 206) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(getCacheKey(request), response.clone())
  } catch (_) {
    // Ignore cache failures (e.g., opaque responses or quota issues)
  }
}

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  // Activate immediately (don't wait for old SW to stop)
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('beskarfolio-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    })
  )
  // Take control of all pages immediately
  self.clients.claim()
})

// Fetch strategy:
// - Navigation (HTML): network-first (always get latest index.html)
// - API calls: network-only (no caching)
// - Static assets: stale-while-revalidate (fast load + background update)
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // API calls: network-only with offline fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => null)
        .then((r) => r || new Response('Offline', { status: 503, statusText: 'Service Unavailable' }))
    )
    return
  }

  // Navigation requests (HTML pages): network-first
  // This ensures users always get the latest index.html after a deploy
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh response for offline use
          event.waitUntil(cachePutSafe(request, response))
          return response
        })
        .catch(() => {
          return matchCachedResponse(request)
            .then((cached) => cached || caches.match('/'))
            .then((r) => r || new Response('Offline', { status: 503, statusText: 'Service Unavailable' }))
        })
    )
    return
  }

  // Static assets (JS, CSS, images): stale-while-revalidate
  event.respondWith(
    matchCachedResponse(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (isCacheableStaticRequest(request, url)) {
            event.waitUntil(cachePutSafe(request, response))
          }
          return response
        })
        .catch(() => cached)

      return Promise.resolve(cached || networkFetch)
        .then((r) => r || new Response('Not Found', { status: 404 }))
    })
  )
})
