// Cache-first service worker.
//
// The app shell (HTML/CSS/JS/fixtures/icons) is served straight from cache, so
// returning visitors generate ~0 edge requests on Vercel (the big driver of the
// Edge Requests quota). Live game data (tips, results, players) comes from
// Firebase, which is NOT intercepted here, so scores/standings stay real-time.
//
// IMPORTANT: because assets aren't content-hashed, new code ships only when
// VERSION is bumped. Bump VERSION on every deploy that changes a shipped file.
const VERSION = 'wmtipp-v2';
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
  // Only intercept same-origin assets + the Firebase SDK CDN. Firebase RTDB /
  // auth traffic is never touched, so live data is unaffected.
  if (url.origin !== location.origin && !url.hostname.includes('jsdelivr.net')) return;

  // Cache-first: hit the network only for assets we don't already have. New
  // releases arrive via the VERSION bump (install re-precaches, activate purges).
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
