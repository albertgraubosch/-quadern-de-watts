// Quadern de Watts service worker. Bump VERSION on every release so phones pick up the new app.
const VERSION = "qw-1.1.1";
const SHELL = [
  "./", "index.html", "app.css", "app.js", "manifest.webmanifest",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "media/hero-poster.jpg", "media/nomercy-poster.jpg", "media/gravel.webp", "media/mud.webp",
  "media/portrait.webp", "media/watermelon.webp", "media/group.webp", "media/mano.webp", "media/peloton.webp"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("qw-") && k !== VERSION && !k.startsWith("qw-streams")).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Strava and fonts go straight to the network
  if (url.pathname.endsWith(".mp4")) return; // videos stream directly (range requests)
  if (url.pathname.endsWith("plan.json")) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; }).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  })));
});
