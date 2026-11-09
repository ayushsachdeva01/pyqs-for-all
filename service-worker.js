// JEEwise service worker.
// - App shell + manifest: network first (so updates always arrive), cache as offline fallback.
// - Question JSON files: cache first, refreshed quietly in the background.
// - MathJax from the CDN: cached after first use so maths works offline.
const VERSION = 'jeewise-v7';
const SHELL = VERSION + '-shell';
const DATA = VERSION + '-data';
const CDN = VERSION + '-cdn';
const CORE = ['./', './index.html', './styles.css', './app.js', './teacher.js', './manifest.webmanifest', './questions/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL).then(c => Promise.allSettled(CORE.map(u => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(response => { if (response && response.ok) cache.put(request, response.clone()); return response; })
    .catch(() => null);
  if (cached) { refresh.catch(() => {}); return cached; }
  const fresh = await refresh;
  if (fresh) return fresh;
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    const isQuestionFile = url.pathname.includes('/questions/') && url.pathname.endsWith('.json') && !url.pathname.endsWith('/manifest.json');
    event.respondWith(isQuestionFile ? cacheFirst(request, DATA) : networkFirst(request, SHELL));
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(request, CDN));
  }
});
