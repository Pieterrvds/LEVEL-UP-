// LEVEL-UP service worker: makes the site installable as an app.
// - Pages, scripts and styles always come from the network, so the app is always the latest version.
//   Without a connection, pages show offline.html (bookings and accounts need the server anyway).
// - Images and fonts come from the cache and are refreshed in the background, so the app opens fast.
// - Supabase, payments and other servers are never touched.
// - Push: shows the notifications the Edge Function "push" sends; tapping one opens the right page.
// Bump VERSION to clear old caches.
const VERSION = "levelup-v7";
const PRECACHE = ["offline.html", "img/app/icon-192.png", "img/app/badge-96.png"];

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

// ---------- Push notifications ----------
self.addEventListener("push", (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(msg.title || "LEVEL-UP", {
    body: msg.body || "",
    icon: "img/app/icon-192.png",
    badge: "img/app/badge-96.png",
    tag: msg.tag || undefined,
    renotify: Boolean(msg.tag),
    data: { url: msg.url || "profile.html" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "profile.html", self.registration.scope).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const tab = open.find((c) => c.url.startsWith(self.registration.scope));
    if (tab) {
      await tab.focus();
      return tab.navigate(url).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  })());
});
