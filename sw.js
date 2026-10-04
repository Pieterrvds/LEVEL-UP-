// LEVEL-UP service worker: makes the site installable as an app.
// - Pages, scripts and styles always come from the network, so the app is always the latest version.
//   Without a connection, pages show offline.html (bookings and accounts need the server anyway).
// - Images and fonts come from the cache and are refreshed in the background, so the app opens fast.
// - Supabase, payments and other servers are never touched.
// Bump VERSION to clear old caches.
const VERSION = "levelup-v1";
const PRECACHE = ["offline.html", "img/app/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isFont = (url) => url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("offline.html")));
    return;
  }

  const image = url.origin === self.location.origin && req.destination === "image";
  if (image || isFont(url)) {
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const fresh = fetch(req)
        .then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; })
        .catch(() => cached || Response.error());
      return cached || fresh;
    }));
  }
  // everything else (scripts, styles, Supabase, Mollie, PayPal …): straight to the network
});
