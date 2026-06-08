/**
 * Libya Postal — offline-first service worker.
 *
 * Strategies:
 *   - cache-first for tile responses (index.php?r=tile&...), GeoJSON, CSS, JS, fonts
 *   - network-first (fall back to cache) for HTML/dynamic GETs
 *   - never cache POST / dynamic mutations
 *
 * Cache buckets:
 *   - libya-tiles   → tile blobs (long-lived, only invalidated by Tile Sync UI)
 *   - libya-static  → CSS, JS, fonts, images, manifest
 *   - libya-data    → GeoJSON files under data/
 *   - libya-pages   → HTML page shells (last-known good copy)
 */
const VERSION = 'v4';
const CACHES = {
  tiles:  'libya-tiles-' + VERSION,
  static: 'libya-static-' + VERSION,
  data:   'libya-data-' + VERSION,
  pages:  'libya-pages-' + VERSION,
};

const STATIC_PRECACHE = [
  'css/app.css',
  'js/map/core.js',
  'js/map/labels.js',
  'js/map/shabiyat.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHES.static).then((c) => c.addAll(STATIC_PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => !Object.values(CACHES).includes(n)).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

function isTileRequest(url) {
  return url.searchParams.get('r') === 'tile';
}
function isDataRequest(url) {
  return url.pathname.endsWith('.geojson') || url.pathname.includes('/data/');
}
function isAppJsRequest(url) {
  return /\/js\//.test(url.pathname) && /\.js(\?|$)/i.test(url.pathname);
}
function isStaticRequest(url) {
  return /\.(css|png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf)$/i.test(url.pathname);
}
function isApiRequest(url) {
  const r = url.searchParams.get('r') || '';
  return /^(boundary_|api_|addresses_json|tile_sync_status|postal_lookup_api|address_api)/.test(r);
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) { return cached; }
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (e) {
    /* offline + not cached */
    return new Response('', { status: 204, statusText: 'offline-no-cache' });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) { return cached; }
    return new Response('<h1>غير متصل</h1><p>الصفحة غير متاحة بدون اتصال.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') { return; }
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) {
    /* Only cache same-origin; let cross-origin (OSM remote, etc.) pass through. */
    return;
  }
  if (isTileRequest(url)) {
    event.respondWith(cacheFirst(req, CACHES.tiles));
    return;
  }
  if (isDataRequest(url)) {
    event.respondWith(cacheFirst(req, CACHES.data));
    return;
  }
  if (isAppJsRequest(url)) {
    event.respondWith(networkFirst(req, CACHES.static));
    return;
  }
  if (isStaticRequest(url)) {
    event.respondWith(cacheFirst(req, CACHES.static));
    return;
  }
  if (isApiRequest(url)) {
    event.respondWith(fetch(req));
    return;
  }
  /* Default: HTML and dynamic GETs go network-first. */
  event.respondWith(networkFirst(req, CACHES.pages));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.action === 'purge-tiles') {
    caches.delete(CACHES.tiles).then(() => {
      event.ports[0] && event.ports[0].postMessage({ ok: true });
    });
    return;
  }
  if (event.data && event.data.action === 'purge-static') {
    caches.delete(CACHES.static).then(() => {
      event.ports[0] && event.ports[0].postMessage({ ok: true });
    });
  }
});
