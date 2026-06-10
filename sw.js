// Network-first service worker: the app always gets fresh code when
// online (Vercel deploys propagate immediately); the cache only serves
// as an offline fallback. Bump VERSION to drop old caches.
const VERSION = 'wmtipp-v1';
const PRECACHE = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js', 'js/store.js', 'js/scoring.js', 'js/i18n.js', 'js/sync.js', 'js/config.js', 'js/confetti.js',
  'data/matches.json', 'data/teams-info.json',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Never intercept Firebase/auth traffic.
  if (url.origin !== location.origin && !url.hostname.includes('jsdelivr.net')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: url.origin === location.origin && url.pathname.endsWith('/') }))
  );
});
