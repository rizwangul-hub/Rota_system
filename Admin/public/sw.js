const CACHE_NAME = 'rota-system-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest'
];

// Install event - pre-cache core shell & skip waiting to activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Activate event - clean old cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network-first for assets, always bypass API and return valid Response on error
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Never intercept API requests, backend endpoints, or non-HTTP schemes
  if (url.pathname.startsWith('/api') || url.hostname !== self.location.hostname || !url.protocol.startsWith('http')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for same-origin static assets
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          }).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        // Fallback 1: Return cached version if available
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        // Fallback 2: For page navigation (SPA routes like /dashboard), return index.html
        if (event.request.mode === 'navigate') {
          const indexFallback = await caches.match('/index.html');
          if (indexFallback) return indexFallback;
        }

        // Fallback 3: NEVER return undefined — always return a valid Response instance
        return new Response('Network offline. Please check your internet connection and refresh.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
