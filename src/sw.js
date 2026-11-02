// Service worker: keeps a copy of every app file on the phone, so the app opens with no internet.
// `npm run build` fills in FILES and VERSION (see swPlugin in vite.config.js) and saves this as dist/sw.js.
// It only stores the app's own files. Student data lives in IndexedDB and never passes through here.
const FILES = self.__FILES__;
const CACHE = "stcs-card-scan-" + self.__VERSION__;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

// A new version waits until the page says so (the "New version" banner), so a scan in progress is never cut off.
self.addEventListener("message", e => { if (e.data === "update") self.skipWaiting(); });

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("stcs-card-scan-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Opening the app (or any page in it) gets the saved index.html.
    if (req.mode === "navigate") return (await cache.match("./")) || fetch(req);
    return (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) || fetch(req);
  })());
});
