// Neon Arcade Multi-Game - PWA Service Worker
const CACHE_NAME = "neon-arcade-v4";
const ASSETS_TO_CACHE = [
  "/",
  "/hub",
  "/connect4",
  "/snake",
  "/pong",
  "/chess",
  "/ludo",
  "/manifest.json",
  "/assets/css/style.css",
  "/assets/css/hub.css",
  "/assets/css/connect4.css",
  "/assets/css/snake.css",
  "/assets/css/pong.css",
  "/assets/css/chess.css",
  "/assets/css/ludo.css",
  "/assets/images/icon-192.png",
  "/assets/images/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("[SW] Cache preload warning:", err);
      });
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
  if (event.request.method !== "GET" || event.request.url.includes("/api/") || event.request.url.includes("/socket.io/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
