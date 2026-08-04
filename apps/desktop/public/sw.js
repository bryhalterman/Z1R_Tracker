/*
 * Offline cache for the downloadable build.
 *
 * Two different strategies, because the two kinds of request fail differently:
 *
 *  - App shell (same origin): cache-first. It only changes when you download a
 *    new release, and a stale shell is better than a blank window.
 *  - Sprite art (cross origin): stale-while-revalidate. Art is fetched from
 *    third-party hosts that may rate-limit or vanish. Once an image has been
 *    seen it is served from cache forever, and refreshed in the background.
 */

const SHELL_CACHE = 'z1r-shell-v1';
const SPRITE_CACHE = 'z1r-sprites-v1';

self.addEventListener('install', (event) => {
  // The precise asset names are hashed at build time, so warm the entry point
  // only and let the fetch handler fill in the rest on first run.
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(['./', './index.html'])).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== SPRITE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SPRITE_CACHE);
  const hit = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      // Opaque responses (no-cors images) report status 0 but are still usable.
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);

  return hit ?? network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  } else if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request));
  }
});
