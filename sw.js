// Neon Tic Tac Toe - PWA Service Worker
const CACHE_NAME = "neon-ttt-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/auth",
  "/auth/index.html",
  "/manifest.json",
  "/assets/css/style.css",
  "/assets/css/auth.css",
  "/assets/js/script.js",
  "/assets/js/api.js",
  "/assets/js/auth-guard.js",
  "/assets/images/icon-192.png",
  "/assets/images/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Let network handle API and socket requests directly
  if (event.request.url.includes("/api/") || event.request.url.includes("/socket.io/")) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => cached);
    })
  );
});
