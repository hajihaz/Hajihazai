/* HajiHaz AI PWA service worker.
 * Dynamic/authenticated pages remain network-only. Only the offline shell and
 * immutable same-origin static assets are cached.
 */
const SHELL_CACHE = "hajihaz-shell-v2";
const STATIC_CACHE = "hajihaz-static-v2";
const MAX_STATIC_ASSETS = 150;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/branding/hajihaz-mark.png", "/branding/hajihaz-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, STATIC_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API/auth/session traffic or Next data payloads.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.searchParams.has("_rsc")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  const staticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/branding/") ||
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname);

  if (!staticAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const immutableNextAsset = url.pathname.startsWith("/_next/static/");
    const cached = await cache.match(request);
    // Only content-hashed Next assets are immutable. Branding images and icons
    // can change at the same URL after deployment, so prefer the network.
    if (immutableNextAsset && cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque") {
        // Cache writes are best-effort and must never break a network response.
        try {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          for (const old of keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ASSETS))) {
            await cache.delete(old);
          }
        } catch { /* Quota or private mode: network response is still valid */ }
      }
      return response;
    } catch {
      return cached ?? Response.error();
    }
  })());
});
