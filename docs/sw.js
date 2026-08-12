const APP_SCOPE = "/cgv-api-watcher/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(APP_SCOPE)) return;

  const shouldBypassCache =
    request.mode === "navigate" ||
    request.destination === "document" ||
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "worker" ||
    url.pathname.endsWith(".json");

  if (!shouldBypassCache) return;

  event.respondWith(
    fetch(new Request(request, { cache: "no-store" })).catch(() => fetch(request)),
  );
});
