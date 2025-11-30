const CACHE_NAME = 'titlelab-pwa-v1';
const OFFLINE_ASSETS = [
  '/',
  '/index.html',
  '/title.html',
  '/content.html',
  '/login.html',
  '/settings.html',
  '/admin-center.html',
  '/assets/styles.css',
  '/assets/app-title.js',
  '/assets/app-content.js',
  '/assets/supabase.js',
  '/assets/classifier.js',
  '/manifest.webmanifest',
  '/icon/icon-192.png',
  '/icon/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return undefined;
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
