const CACHE = "ihealth-private-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isPrivateApi = url.pathname.startsWith("/api/v1/");
  const isKnowledgeAsset = url.pathname.startsWith("/api/v1/search/") || url.pathname.startsWith("/api/v1/assets/");

  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && (!isPrivateApi || isKnowledgeAsset || url.pathname === "/api/v1/releases/current")) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") return (await caches.match("/")) ?? Response.error();
    return Response.error();
  }));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_PRIVATE_DATA") event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
});
