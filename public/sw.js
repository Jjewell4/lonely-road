// Offline support: serve from cache, refresh the cache in the background.
const CACHE = 'lonely-road-v2';
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (request.headers.has('range')) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // "/?play=1" should hit the cached "/".
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(url.pathname === '/' ? '/' : request, res.clone());
          return res;
        })
        .catch(() => cached || Response.error());
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network;
    })
  );
});
