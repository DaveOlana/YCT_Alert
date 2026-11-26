/**
 * YCT Alert — Production Service Worker
 * 
 * Strict safety rules:
 * 1. Never cache incident submissions or API mutative requests.
 * 2. Never serve stale cached data for incident reporting intake or sync.
 * 3. Provide offline application shell so users can open the app and see status.
 */

const CACHE_NAME = 'yct-alert-v1.0.0';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. SAFEGUARD: Never cache any API requests or non-GET requests
  if (request.method !== 'GET' || url.pathname.startsWith('/api') || url.hostname.includes('onrender.com') && url.pathname.startsWith('/api')) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. Navigation requests (HTML documents): Network first, falling back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html') || caches.match('/'))
    );
    return;
  }

  // 3. Static assets (JS, CSS, images, fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
