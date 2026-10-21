// Quadern de Watts service worker.
// App files (html, js, css, plan) are network-first so a new release shows up on the next open;
// the cache is only a fallback for when there is no connection. Images are cache-first.
const VERSION = "qw-1.4.0";
const SHELL = [
  "./", "index.html", "app.css", "app.js", "manifest.webmanifest", "plan.json",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "media/hero-poster.jpg", "media/nomercy-poster.jpg", "media/gravel.webp", "media/mud.webp",
  "media/portrait.webp", "media/watermelon.webp", "media/group.webp", "media/mano.webp", "media/peloton.webp"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("qw-") && k !== VERSION && !k.startsWith("qw-streams")).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req) {
  return fetch(req, { cache: "no-cache" })
    .then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return r;
    })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("index.html")));
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Strava, Gemini and fonts go straight to the network
  if (url.pathname.endsWith(".mp4")) return;       // videos stream directly
  if (req.mode === "navigate" || /\.(html|js|css|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/")) {
    e.respondWith(networkFirst(req));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  })));
});
