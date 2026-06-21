/* Minimal harness to find where core.js throws during boot */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const corePath = path.join(__dirname, '../js/map/core.js');
let src = fs.readFileSync(corePath, 'utf8');

const layers = [];
const handlers = {};
const mapEl = {
  id: 'map',
  className: 'map-canvas',
  parentNode: { appendChild() {}, querySelector() { return null; } },
  closest() { return { }; },
  setAttribute() {},
  addEventListener() {},
  getContainer() { return mapEl; },
  dataset: {},
};
const rootEl = {
  dataset: {
    swLat: '19.5', swLng: '9.0', neLat: '33.5', neLng: '25.5',
    minZoom: '5', maxZoom: '19', maxZoomSat: '17',
    centerLat: '27', centerLng: '17', zoom: '5',
    offlineMaxZoom: '17', offlineSatMaxZoom: '16',
    offlineLabelsMaxZoom: '16', tileKeepBuffer: '2',
    offlineTileZones: '[]', defaultBase: 'offline',
    preferOffline: '1', allowRemoteTiles: '0',
    skipNeighborBoundaries: '1', maskUrl: '',
    shabiyatUrl: 'data/libya-shabiyat.geojson',
    markerIcon: '', markerIcon2x: '', markerShadow: '',
    satellite: '0', offlineSat: '0',
    offlineLabelsTransport: '0', offlineLabelsPlaces: '0',
    focusOnLoad: '0', readOnly: '0',
    tileUpdateIdle: '0',
  },
};

function makeLayer() {
  return {
    addTo() { return this; },
    remove() {},
    removeLayer() {},
    on() { return this; },
    once(evt, fn) { if (evt === 'ready' || evt === 'load') setTimeout(fn, 0); return this; },
    whenReady(fn) { setTimeout(fn, 0); return this; },
    getSize() { return { x: 800, y: 600 }; },
    getZoom() { return 5; },
    getCenter() { return { lat: 27, lng: 17 }; },
    getBounds() { return L.latLngBounds([19.5, 9], [33.5, 25.5]); },
    getMaxZoom() { return 19; },
    getPane() { return { style: {}, querySelectorAll() { return []; } }; },
    containerPointToLatLng(p) { return L.latLng(30, 20); },
    latLngToLayerPoint() { return L.point(100, 100); },
    hasLayer() { return false; },
    invalidateSize() {},
    fitBounds() {},
    setView() {},
    setMaxBounds() {},
    stop() {},
    panInsideBounds() {},
    createPane() {},
    addLayer() {},
    removeLayer() {},
    getContainer() { return mapEl; },
  };
}

const L = {
  map() { return makeLayer(); },
  latLng(a, b) { return typeof a === 'object' ? a : { lat: a, lng: b }; },
  latLngBounds(a, b) {
    return {
      getSouthWest() { return { lat: 19.5, lng: 9 }; },
      getNorthEast() { return { lat: 33.5, lng: 25.5 }; },
      isValid() { return true; },
      contains() { return true; },
      pad() { return this; },
      extend() { return this; },
    };
  },
  tileLayer() { return { addTo() { return this; }, on() { return this; }, setUrl() {}, options: {} }; },
  layerGroup() { return { addTo() { return this; }, clearLayers() {}, eachLayer() {} }; },
  divIcon(o) { return o; },
  point(x, y) { return { x, y }; },
  Icon: { Default: { mergeOptions() {} }, prototype: { _createIcon: null } },
  DomEvent: { stopPropagation() {} },
  geoJSON() { return { addTo() { return this; }, eachLayer() {}, getBounds() { return L.latLngBounds(); } }; },
  polygon(latlngs, opts) {
    return { addTo() { return this; }, on() { return this; }, setStyle() {}, bringToFront() {}, getBounds() { return L.latLngBounds(); } };
  },
  polyline(latlngs, opts) {
    return { addTo() { return this; }, on() { return this; }, setStyle() {}, bringToFront() {}, getBounds() { return L.latLngBounds(); } };
  },
};

const document = {
  getElementById(id) {
    if (id === 'map-root') return rootEl;
    if (id === 'map') return mapEl;
    if (id === 'map-lat' || id === 'map-lng') return { value: '' };
    if (id === 'layer-boundaries') return { checked: true, addEventListener() {} };
    if (id === 'layer-entity-labels') return { checked: true, addEventListener() {} };
    if (id === 'layer-labels') return { checked: true, addEventListener() {} };
    return null;
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { className: '', style: {}, appendChild() {} }; },
  addEventListener(type, fn) { handlers[type] = fn; },
  activeElement: null,
};

const maskGeo = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/libya-mask-inner-ring.geojson'), 'utf8'));
const visibleGeo = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/libya-visible-mask-ring.geojson'), 'utf8'));
const embeddedRing = maskGeo.geometry.coordinates[0];
const embeddedVisible = visibleGeo.geometry.coordinates[0];

const window = {
  MapCore: undefined,
  AddrMap: undefined,
  LP_LIBYA_MASK_RING: embeddedRing,
  LP_LIBYA_VISIBLE_MASK_RING: embeddedVisible,
  location: { pathname: '/Libya Postal/Projict/index.php', origin: 'http://localhost:8080', href: 'http://localhost:8080/Libya Postal/Projict/index.php?r=address_new' },
  addEventListener(type, fn) { handlers[type] = fn; },
  dispatchEvent() { return true; },
  ResizeObserver: class { observe() {} },
  requestIdleCallback(fn) { setTimeout(fn, 0); },
  setTimeout,
  clearTimeout,
  fetch() { return Promise.resolve({ ok: false }); },
  URL: class { constructor(u, b) { this.href = u; } },
};

const context = { window, document, L, console, setTimeout, clearTimeout, JSON, Math, Date, parseInt, parseFloat, isNaN, isFinite, Array, Object, String, Number, Error, WeakMap, ResizeObserver: window.ResizeObserver, requestIdleCallback: window.requestIdleCallback, fetch: window.fetch, URL: window.URL, Event: class { constructor(t) { this.type = t; } } };
context.global = context;
vm.createContext(context);

try {
  vm.runInContext(src, context, { filename: 'core.js', timeout: 5000 });
  console.log('MapCore:', !!context.window.MapCore);
  console.log('AddrMap:', !!context.window.AddrMap);
} catch (e) {
  console.error('THROW:', e.stack || e);
}
