// Service Worker for offline support
const CACHE_NAME = "indoor-nav-v14";
const ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/buildings.js",
  "/js/roomParser.js",
  "/js/compass.js",
  "/js/pathfinder.js",
  "/js/gps.js",
  "/js/barometer.js",
  "/js/stepcounter.js",
  "/js/localizer.js",
  "/js/location-manager.js",
  "/js/app.js",
  "/manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("fetch", (e) => {
  // Network-first for all JS/CSS to pick up updates quickly
  if (e.request.url.match(/\.(js|css)(\?.*)?$/)) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const clone = r.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for everything else
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});
