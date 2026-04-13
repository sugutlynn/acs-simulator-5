/**
 * ACS Simulator — Service Worker
 * Caches all static assets on install.
 * Serves from cache first, falls back to network.
 * Runs entirely offline after first load.
 */

const CACHE_NAME = 'acs-v1';

// Assets to pre-cache on install
const PRECACHE = [
  '/',
  '/manifest.json',
];

// ─── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ─── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch: cache-first with network fallback ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't cache API calls or cross-origin requests
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return; // Pass through to network
  }

  // Cache-first strategy for all other assets
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        // Only cache successful GET responses
        if (request.method !== 'GET' || !response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (request.destination === 'document') {
          return caches.match('/');
        }
      });
    })
  );
});
