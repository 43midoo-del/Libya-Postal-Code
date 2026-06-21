/**
 * Libya Postal — offline-first service worker.
 *
 * Strategies:
 *   - cache-first (+ background refresh) for tile responses
 *   - cache-first for GeoJSON, CSS, JS, fonts, vendor libs
 *   - network-first (fall back to cache) for HTML/dynamic GETs
 *   - never cache POST / dynamic mutations
 */
const VERSION = 'v15';
const TILE_MIN_VALID_BYTES = 800;
const TILE_BLANK_MIN = 300;
const TILE_BLANK_MAX = 500;
const TILE_ERROR_BAND_MIN = 6000;
const TILE_ERROR_BAND_MAX = 7200;
const CACHES = {
  tiles:  'libya-tiles-' + VERSION,
  static: 'libya-static-' + VERSION,
  data:   'libya-data-' + VERSION,
  pages:  'libya-pages-' + VERSION,
};

const STATIC_PRECACHE = [
  '../css/app.css',
  '../vendor/leaflet/1.9.4/leaflet.css',
  '../vendor/leaflet/1.9.4/leaflet.js',
  '../vendor/leaflet/1.9.4/images/marker-icon.png',
  '../vendor/leaflet/1.9.4/images/marker-icon-2x.png',
  '../vendor/leaflet/1.9.4/images/marker-shadow.png',
  '../vendor/leaflet/1.9.4/images/layers.png',
  '../vendor/leaflet/1.9.4/images/layers-2x.png',
  '../vendor/html2canvas/1.4.1/html2canvas.min.js',
  '../vendor/qrcodejs/1.0.0/qrcode.min.js',
  '../vendor/chart.js/4.4.1/chart.umd.min.js',
  '../js/map/core.js',
  '../js/map/labels.js',
  '../js/map/shabiyat.js',
  '../js/map/province_colors.js',
  '../js/addresses/form.js',
  '../js/addresses/save.js',
  '../data/libya-shabiyat.geojson',
  '../data/libya-mask-inner-ring.geojson',
  '../data/libya-visible-mask-ring.geojson',
  '../data/tiles/blank-256.png',
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
      names.map((n) => {
        if (n.startsWith('libya-tiles-')) {
          return caches.delete(n);
        }
        if (!Object.values(CACHES).includes(n)) {
          return caches.delete(n);
        }
        return Promise.resolve(false);
      })
    ))
  );
  self.clients.claim();
});

function tileBodyLooksValid(buf, zoom) {
  if (!buf || !buf.byteLength) { return false; }
  if (buf.byteLength >= TILE_BLANK_MIN && buf.byteLength <= TILE_BLANK_MAX) { return true; }
  if (buf.byteLength < TILE_MIN_VALID_BYTES) { return false; }
  const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 8));
  if (head[0] !== 0x89 || head[1] !== 0x50 || head[2] !== 0x4e || head[3] !== 0x47) { return false; }
  const bandMin = (typeof zoom === 'number' && zoom <= 8) ? 5500 : TILE_ERROR_BAND_MIN;
  if (buf.byteLength >= bandMin && buf.byteLength <= TILE_ERROR_BAND_MAX) { return false; }
  if (buf.byteLength === 6987) { return false; }
  return true;
}

function tileZoomFromRequest(req) {
  try {
    return parseInt(new URL(req.url).searchParams.get('z') || '99', 10);
  } catch (e) {
    return 99;
  }
}

function blankTileHttpResponse() {
  return blankTileResponse().then(function (bytes) {
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
    });
  });
}

async function storeTileIfValid(cache, req, response, zoom) {
  if (!response || !response.ok) {
    return false;
  }
  const buf = await response.clone().arrayBuffer();
  if (!tileBodyLooksValid(buf, zoom)) {
    await cache.delete(req).catch(function () {});
    return false;
  }
  cache.put(req, response.clone()).catch(function () {});
  return true;
}

async function revalidateTileInBackground(req, cache, zoom) {
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    await storeTileIfValid(cache, req, fresh, zoom);
  } catch (e) { /* offline — keep cached tile */ }
}

/** Cache-first with background refresh — avoids blocking map paint on network+validate. */
async function tileCacheFirst(req) {
  const cache = await caches.open(CACHES.tiles);
  const zoom = tileZoomFromRequest(req);
  const cached = await cache.match(req);
  if (cached) {
    revalidateTileInBackground(req, cache, zoom);
    return cached;
  }
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (await storeTileIfValid(cache, req, fresh, zoom)) {
      return fresh;
    }
    if (fresh.ok) {
      return blankTileHttpResponse();
    }
    return fresh;
  } catch (e) {
    return blankTileHttpResponse();
  }
}

let blankTileBytes = null;
async function blankTileResponse() {
  if (blankTileBytes) { return blankTileBytes; }
  try {
    const r = await fetch('../data/tiles/blank-256.png', { cache: 'force-cache' });
    if (r.ok) {
      blankTileBytes = await r.arrayBuffer();
      return blankTileBytes;
    }
  } catch (e) { /* ignore */ }
  blankTileBytes = new Uint8Array([137,80,78,71,13,10,26,10]).buffer;
  return blankTileBytes;
}

function isTileRequest(url) {
  return url.searchParams.get('r') === 'tile';
}
function isDataRequest(url) {
  return url.pathname.endsWith('.geojson') || url.pathname.includes('/data/');
}
function isAppJsRequest(url) {
  return /\/js\//.test(url.pathname) && /\.js(\?|$)/i.test(url.pathname);
}
function isVendorRequest(url) {
  return /\/vendor\//.test(url.pathname);
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
    return;
  }
  /* Tiles: bypass SW — TileController sends Cache-Control; SW intercept doubled load and froze the map. */
  if (isTileRequest(url)) {
    return;
  }
  if (isDataRequest(url)) {
    event.respondWith(cacheFirst(req, CACHES.data));
    return;
  }
  if (isVendorRequest(url) || isAppJsRequest(url)) {
    event.respondWith(cacheFirst(req, CACHES.static));
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
