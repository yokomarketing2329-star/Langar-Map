// Bhandara Map service worker: offline app shell + cached map tiles/photos.
// Live Bhandara data is NEVER served from cache (it must be fresh and respect expiry).
const SHELL = 'bm-shell-v1'
const RUNTIME = 'bm-runtime-v1'
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icons/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![SHELL, RUNTIME].includes(k)).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Never cache Supabase API / realtime calls.
  if (url.hostname.endsWith('.supabase.co') && !url.pathname.startsWith('/storage/v1/object/public/')) return

  // Page navigations: network first, fall back to cached shell (offline).
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')))
    return
  }

  // Static assets, map tiles, photos: stale-while-revalidate.
  const cacheable =
    url.origin === self.location.origin ||
    url.hostname.endsWith('tile.openstreetmap.org') ||
    url.pathname.startsWith('/storage/v1/object/public/') ||
    url.hostname.includes('fonts.g')
  if (!cacheable) return

  e.respondWith(
    caches.open(RUNTIME).then(async (cache) => {
      const hit = await cache.match(req)
      const net = fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone())
          return res
        })
        .catch(() => hit)
      return hit || net
    }),
  )
})
