/**
 * BudgetVault Service Worker — Offline-First PWA
 * 
 * Caching strategies:
 * - Static assets (JS/CSS bundles): Cache-first with background update
 * - Google Fonts: Cache-first (immutable)
 * - Upload images: Cache-first with network fallback
 * - HTML shell: Cache-first for navigation (enables offline app start)
 * - API calls: Network-only (handled by IndexedDB in the app layer)
 */

const CACHE_STATIC = 'budgetvault-static-v2';
const CACHE_RUNTIME = 'budgetvault-runtime-v1';
const CACHE_IMAGES = 'budgetvault-images-v1';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
];

// ==================== INSTALL ====================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_STATIC, CACHE_RUNTIME, CACHE_IMAGES];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !currentCaches.includes(key))
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ==================== FETCH ====================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API calls — handled by IndexedDB in the app
  if (url.pathname.startsWith('/api/')) return;

  // Skip Chrome extensions and other schemes
  if (!url.protocol.startsWith('http')) return;

  // Navigation requests (HTML pages) — serve cached shell for offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Update the cache with fresh version
          const clone = response.clone();
          caches.open(CACHE_STATIC).then((cache) => cache.put('/', clone));
          return response;
        })
        .catch(() => {
          // Offline — serve cached shell
          return caches.match('/').then((cached) => {
            return cached || new Response('Application hors ligne. Veuillez vous reconnecter.', {
              status: 503,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          });
        })
    );
    return;
  }

  // Upload images — cache-first
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_IMAGES).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          return new Response('', { status: 404 });
        });
      })
    );
    return;
  }

  // Google Fonts — cache-first (immutable)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_RUNTIME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Static assets (JS, CSS, icons) — stale-while-revalidate
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_RUNTIME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // Network failed, cached version is fine
        });

        // Return cached immediately, update in background
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Default — network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_RUNTIME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ==================== PUSH NOTIFICATIONS ====================
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'BudgetVault', body: 'Nouvelle notification' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-72.png',
      tag: data.tag || 'default',
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
