/*
 * Offline cache for the downloadable build.
 *
 * Two different strategies, because the two kinds of request fail differently:
 *
 *  - Navigations and sprites.json: network-first, cache as fallback. These are
 *    the two things that change between releases, and serving a stale
 *    index.html permanently pins the app to the previous build's assets — it
 *    references them by content hash, and those are cached too, so nothing
 *    ever upgrades.
 *  - Hashed assets (same origin): cache-first. Safe precisely because the hash
 *    changes when the content does.
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

/** Fresh when the network allows, cached when it doesn't. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
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
    // A navigation or the sprite manifest must never pin the app to an old
    // build; everything else same-origin is content-hashed and safe to keep.
    const mustBeFresh =
      request.mode === 'navigate' || url.pathname.endsWith('/sprites.json');
    event.respondWith(mustBeFresh ? networkFirst(request) : cacheFirst(request));
  } else if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request));
  }
});
