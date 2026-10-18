const VERSION = 'coastal-watch-v15-2';
const STATIC_CACHE = `${VERSION}-static`;
const DATA_CACHE = `${VERSION}-data`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const SHELL = [
  './', './index.html', './typhoon.html', './compare.html',
  './styles.css', './share.css', './detail.css', './responsive.css', './accessibility.css', './analytics.css',
  './app.js', './detail.js', './analytics.js', './pwa.js',
  './manifest.webmanifest', './icon.svg', './data/typhoon.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('coastal-watch-') && !key.startsWith(VERSION)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function offlineResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Coastal-Offline', 'true');
  return response.arrayBuffer().then((body) => new Response(body, { status: response.status, statusText: response.statusText, headers }));
}

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' }) || await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    if (fallback) return (await caches.match(fallback)) || Response.error();
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') { event.respondWith(networkFirst(request, RUNTIME_CACHE, './index.html')); return; }
  if (url.origin === self.location.origin && url.pathname.endsWith('/data/typhoon.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        const cached = await cache.match(request) || await caches.match('./data/typhoon.json');
        return cached ? offlineResponse(cached) : Response.error();
      }
    })());
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone())); return response; })));
    return;
  }
  if (url.hostname === 'unpkg.com') {
    event.respondWith(caches.open(RUNTIME_CACHE).then(async (cache) => { const cached = await cache.match(request); if (cached) return cached; const response = await fetch(request); cache.put(request, response.clone()); return response; }));
  }
});
