// Service worker minimal : coquille d'application en cache, données API « réseau d'abord ».
const CACHE = "intelliflood-v1";
const SHELL = ["/", "/app/", "/vendor/three.min.js", "/manifest.webmanifest"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.pathname.startsWith("/api/") || u.port === "8000") return; // l'API gère son propre cache local
  e.respondWith(fetch(r).then((res) => { if (res.ok && u.origin === location.origin) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); } return res; }).catch(() => caches.match(r).then((m) => m || caches.match("/app/"))));
});
