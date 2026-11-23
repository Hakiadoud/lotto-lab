const CACHE = "lottolab-v2";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./app.js", "./i18n.js", "./data.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Google Fonts: serve from cache, refresh in background
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r;
    }).catch(() => caches.match("./index.html"))));
  }
});
