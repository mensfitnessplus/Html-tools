/* ═══════════════════════════════════════════════════════════════
   Tool Hub — sw.js
   Offline-first service worker with cache-then-network strategy
   and auto-update support.

   Bump CACHE_VERSION when you deploy new app files.
═══════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'tool-hub-v2.3';

// Files to precache on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  // Skip waiting so the new SW activates immediately on update
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests and same-origin / local resources
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For app shell files: cache-first, fallback to network
  if (
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css')  ||
    url.pathname.endsWith('.js')   ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('/')     ||
    url.pathname.endsWith('/index.html')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // For icons and images in the app folder: cache-first
  if (
    url.pathname.includes('/icons/') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico)$/)
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else (e.g. content inside iframes, external requests):
  // network-first, don't cache
  event.respondWith(networkOnly(event.request));
});

// ── STRATEGIES ───────────────────────────────────────────────

/**
 * Cache-first: serve from cache; on miss, fetch, cache, and return.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not in cache — return a minimal offline page for navigations
    if (request.mode === 'navigate') {
      const cached404 = await caches.match('./index.html');
      if (cached404) return cached404;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Network-only: always go to the network; on failure return 503.
 */
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response('Network error', { status: 503, statusText: 'Service Unavailable' });
  }
}
