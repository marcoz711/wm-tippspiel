// Self-destroying service worker.
//
// The previous worker was cache-first to cut Vercel edge requests. On GitHub
// Pages there is no edge-request quota, so that caching only caused harm: it
// pinned family devices to stale code and needed a VERSION bump every deploy.
// This worker exists solely to UNDO that — on activation it deletes all caches,
// unregisters itself, and reloads open tabs, so every device drops the old
// cache and loads the live version from the network. It has no fetch handler,
// so nothing is intercepted. After this ships the site runs with no service
// worker (app.js no longer registers one and clears any leftover).
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.clients.claim();
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      client.navigate(client.url);
    }
    await self.registration.unregister();
  })());
});
