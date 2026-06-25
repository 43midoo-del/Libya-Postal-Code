/**
 * Map core: Leaflet init, bounds, base layers, mask, marker placement, coordinate capture,
 * HUD, address marker interactions, public AddrMap API.
 * Exposes shared state via window.MapCore for sibling modules (labels, shabiyat, parcel).
 */
(function () {
  'use strict';

  var root = document.getElementById('map-root');
  var el = document.getElementById('map');
  var latIn = document.getElementById('map-lat');
  var lngIn = document.getElementById('map-lng');
  var readoutVals = document.getElementById('map-coords-values');
  var readout = readoutVals || document.getElementById('map-coords-readout');
  if (!root || !el || typeof L === 'undefined') {
    return;
  }

  function resolveAssetUrl(rel) {
    if (!rel || /^https?:\/\//i.test(rel) || rel.indexOf('data:') === 0) {
      return rel;
    }
    rel = String(rel).replace(/^\//, '');
    var path = window.location.pathname || '/';
    if (!/\/$/.test(path)) {
      path = path.replace(/[^/]+$/, '');
    }
    try {
      return new URL(rel, window.location.origin + path).href;
    } catch (eUrl) {
      return path + rel;
    }
  }

  function configureLeafletDefaultIcons() {
    if (!L.Icon || !L.Icon.Default) {
      return;
    }
    var iconUrl = root.dataset.markerIcon || resolveAssetUrl('vendor/leaflet/1.9.4/images/marker-icon.png');
    var iconRetinaUrl = root.dataset.markerIcon2x || resolveAssetUrl('vendor/leaflet/1.9.4/images/marker-icon-2x.png');
    var shadowUrl = root.dataset.markerShadow || resolveAssetUrl('vendor/leaflet/1.9.4/images/marker-shadow.png');
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: iconRetinaUrl,
      iconUrl: iconUrl,
      shadowUrl: shadowUrl
    });
    if (L.Icon.prototype._createIcon && !L.Icon.prototype._libyaAltPatched) {
      var origCreateIcon = L.Icon.prototype._createIcon;
      L.Icon.prototype._createIcon = function (name, tag, cls) {
        var el = origCreateIcon.call(this, name, tag, cls);
        if (el && el.tagName === 'IMG') {
          el.alt = '';
        }
        return el;
      };
      L.Icon.prototype._libyaAltPatched = true;
    }
  }

  var ADDRESS_PIN_SVG =
    '<svg class="addr-map-pin__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41" aria-hidden="true" focusable="false">' +
    '<path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z" fill="#7c3aed" stroke="#fff" stroke-width="1.25"/>' +
    '<circle cx="12.5" cy="12.5" r="4.5" fill="#fff" opacity="0.92"/>' +
    '</svg>';

  function createAddressPinIcon() {
    return L.divIcon({
      className: 'addr-map-pin',
      html: ADDRESS_PIN_SVG,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28]
    });
  }

  configureLeafletDefaultIcons();

  function haversineKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = ((lat2 - lat1) * Math.PI) / 180;
    var dLng = ((lng2 - lng1) * Math.PI) / 180;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function loadRegions() {
    var elData = document.getElementById('postal-map-regions-data');
    if (!elData) {
      return [];
    }
    try {
      var arr = JSON.parse(elData.textContent || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  var regions = loadRegions();

  var WILKEY_TO_PROV_FORM = { barqa: 'B', tripolitania: 'T', fezzan: 'F' };

  function nearestRegion(lat, lng) {
    if (!regions.length) {
      return null;
    }
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i];
      if (typeof r.lat !== 'number' || typeof r.lng !== 'number') {
        continue;
      }
      var d = haversineKm(lat, lng, r.lat, r.lng);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  var southWest = L.latLng(parseFloat(root.dataset.swLat), parseFloat(root.dataset.swLng));
  var northEast = L.latLng(parseFloat(root.dataset.neLat), parseFloat(root.dataset.neLng));
  var bounds = L.latLngBounds(southWest, northEast);

  var minZ = parseInt(root.dataset.minZoom, 10) || 5;
  var maxZ = parseInt(root.dataset.maxZoom, 10) || 19;
  var maxZSat = parseInt(root.dataset.maxZoomSat, 10) || 17;
  var readOnly = root.dataset.readOnly === '1';
  var skipNeighborBoundaryTiles = root.dataset.skipNeighborBoundaries === '1';

  var preferOffline = root.dataset.preferOffline === '1';
  var allowRemoteTiles = root.dataset.allowRemoteTiles === '1';
  var offlineMaxZ = parseInt(root.dataset.offlineMaxZoom, 10) || 17;
  var offlineSatMaxZ = parseInt(root.dataset.offlineSatMaxZoom, 10) || 16;
  var hasOfflineSat = root.dataset.offlineSat === '1';
  var hasOfflineLabelsTransport = root.dataset.offlineLabelsTransport === '1';
  var hasOfflineLabelsPlaces = root.dataset.offlineLabelsPlaces === '1';
  var offlineLabelsMaxZ = parseInt(root.dataset.offlineLabelsMaxZoom, 10) || 16;
  var focusOnLoad = root.dataset.focusOnLoad === '1';
  var focusLat = parseFloat(root.dataset.focusLat || '');
  var focusLng = parseFloat(root.dataset.focusLng || '');
  var focusZoom = parseInt(root.dataset.focusZoom, 10) || 14;
  var tileKeepBuffer = parseInt(root.dataset.tileKeepBuffer, 10);
  if (isNaN(tileKeepBuffer) || tileKeepBuffer < 1) {
    tileKeepBuffer = 2;
  }
  var tileUpdateIdle = root.dataset.tileUpdateIdle !== '0';

  var offlineTileZones = [];
  try {
    offlineTileZones = JSON.parse(root.dataset.offlineTileZones || '[]');
  } catch (eTileZones) {
    offlineTileZones = [];
  }
  if (!Array.isArray(offlineTileZones)) {
    offlineTileZones = [];
  }
  var DEFAULT_OFFLINE_TILE_ZONES = [
    { zmin: 5, zmax: 8, south: 19.4, west: 9.2, north: 33.45, east: 25.15 },
    { zmin: 9, zmax: 12, south: 30.79, west: 21.92, north: 33.08, east: 23.35 },
    { zmin: 13, zmax: 16, south: 32.68, west: 22.48, north: 32.88, east: 22.84 },
    { zmin: 17, zmax: 17, south: 32.728, west: 22.595, north: 32.792, east: 22.725 }
  ];

  var defaultBase = root.dataset.defaultBase || '';
  if (defaultBase !== 'offline' && defaultBase !== 'sat' && defaultBase !== 'osm') {
    if (preferOffline) {
      defaultBase = 'offline';
    } else {
      defaultBase = root.dataset.satellite === '1' ? 'sat' : 'osm';
    }
  }
  var currentBaseKind = defaultBase;

  function effectiveMaxZoom() {
    if (currentBaseKind === 'sat') {
      if (allowRemoteTiles) {
        return maxZSat;
      }
      return Math.min(maxZSat, offlineSatMaxZ);
    }
    if (currentBaseKind === 'offline') {
      return Math.min(maxZ, offlineMaxZ);
    }
    return maxZ;
  }

  function applyMapMaxZoomForBase(kind) {
    var cap = kind === 'sat'
      ? (allowRemoteTiles ? maxZSat : Math.min(maxZSat, offlineSatMaxZ))
      : kind === 'offline'
        ? Math.min(maxZ, offlineMaxZ)
        : maxZ;
    map.setMaxZoom(cap);
    if (map.getZoom() > cap) {
      map.setZoom(cap);
    }
  }

  var ilat = parseFloat(root.dataset.initialLat || '');
  var ilng = parseFloat(root.dataset.initialLng || '');
  var skipAutoOverviewFit =
    readOnly && !isNaN(ilat) && !isNaN(ilng) && bounds.contains(L.latLng(ilat, ilng));

  var defaultCenterLat = parseFloat(root.dataset.centerLat);
  var defaultCenterLng = parseFloat(root.dataset.centerLng);
  var defaultInitZoom = parseInt(root.dataset.zoom, 10);

  var map = L.map('map', {
    maxBounds: bounds,
    maxBoundsViscosity: 1.0,
    minZoom: minZ,
    maxZoom: effectiveMaxZoom()
  });

  map.createPane('maskPane');
  map.getPane('maskPane').style.zIndex = 550;
  map.getPane('maskPane').style.pointerEvents = 'none';
  map.createPane('starsPane');
  map.getPane('starsPane').style.zIndex = 445;
  map.getPane('starsPane').style.pointerEvents = 'none';
  map.createPane('shabiyatPane');
  map.getPane('shabiyatPane').style.zIndex = 560;
  map.createPane('cityBoundPane');
  map.getPane('cityBoundPane').style.zIndex = 565;
  map.createPane('cityPane');
  map.getPane('cityPane').style.zIndex = 680;
  map.createPane('postalLabels');
  map.getPane('postalLabels').style.zIndex = 680;
  /* Entity labels (postal codes, city pins, boundary tooltips) must sit above maskPane. */
  if (map.getPane('tooltipPane')) {
    map.getPane('tooltipPane').style.zIndex = 690;
  }

  function libyaLandLatLngBounds() {
    var ring = null;
    if (landMaskRing && landMaskRing.length >= 4) {
      ring = landMaskRing;
    } else if (Array.isArray(window.LP_LIBYA_MASK_RING) && window.LP_LIBYA_MASK_RING.length >= 4) {
      ring = ringLngLatToLatLng(window.LP_LIBYA_MASK_RING);
    }
    if (!ring || ring.length < 4) {
      return bounds;
    }
    try {
      return L.latLngBounds(ring);
    } catch (eLb) {
      return bounds;
    }
  }

  function libyaOverviewFitBounds() {
    var lb = libyaLandLatLngBounds();
    var sw = lb.getSouthWest();
    var ne = lb.getNorthEast();
    var latSpan = Math.max(0.8, ne.lat - sw.lat);
    var lngSpan = Math.max(0.8, ne.lng - sw.lng);
    return L.latLngBounds(
      L.latLng(sw.lat - latSpan * 0.06, sw.lng - lngSpan * 0.05),
      L.latLng(ne.lat + latSpan * 0.28, ne.lng + lngSpan * 0.05)
    );
  }

  function libyaOverviewFitOptions(extra) {
    var o = extra || {};
    var mapH = map && typeof map.getSize === 'function' ? map.getSize().y : 640;
    var topPad = Math.min(220, Math.max(140, Math.round(mapH * 0.16)));
    return {
      paddingTopLeft: L.point(32, topPad),
      paddingBottomRight: L.point(88, 24),
      animate: !!o.animate,
      maxZoom: Math.min(effectiveMaxZoom(), o.maxZoom != null ? o.maxZoom : 5)
    };
  }

  /* Leaflet whenReady only runs after the first view is set. New-address pages boot
   * on a full-country fit; edit/read-only pages keep their saved center. */
  function bootOverviewView() {
    map.fitBounds(libyaOverviewFitBounds(), libyaOverviewFitOptions({ animate: false }));
  }

  if (!skipAutoOverviewFit) {
    bootOverviewView();
  } else if (isFinite(defaultCenterLat) && isFinite(defaultCenterLng)) {
    var bootZoom = isNaN(defaultInitZoom) ? 6 : defaultInitZoom;
    map.setView(
      [defaultCenterLat, defaultCenterLng],
      Math.max(minZ, Math.min(effectiveMaxZoom(), bootZoom)),
      { animate: false }
    );
  } else {
    bootOverviewView();
  }

  var marker = null;

  var CITY_SELECT_EXTRA_ZOOM = 3;

  function bumpMapZoomLevels(steps, opts) {
    if (!map || !steps || steps < 1) {
      return;
    }
    opts = opts || {};
    var cap = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : maxZ;
    var target = Math.min(map.getZoom() + steps, cap);
    if (target > map.getZoom()) {
      map.setZoom(target, {
        animate: opts.animate !== false,
        duration: opts.duration != null ? opts.duration : 0.48
      });
    }
  }

  function scheduleAfterMapFly(callback, maxWaitMs) {
    if (!map || typeof callback !== 'function') {
      return;
    }
    var done = false;
    function run() {
      if (done) {
        return;
      }
      done = true;
      callback();
    }
    map.once('zoomend', run);
    setTimeout(run, maxWaitMs != null ? maxWaitMs : 900);
  }

  /* Shared "module-scope" state — exposed on window.MapCore for sibling modules. */
  var state = {
    markerModePending: false,
    selectedPlace: null,
    lastShabiyaDetail: null,
    shabiyatLayer: null,
    selectedShabiyaLayer: null,
    cityPlacesLayer: null,
    cityBoundariesLayer: null,
    boundaryLabelLayer: null,
    boundariesLayerWanted: true,
    boundariesTemporarilyHidden: false,
    entityLabelsWanted: true,
    cityPlaceByName: {},
    drawMode: 'none',
    drawClickHandler: null,
    userOverviewLocked: false,
    activeTilePanBounds: null,
    activeAreaPanBounds: null,
    pilotAreaPlacementActive: false,
    pilotAreaBoundariesHidden: false,
    focusedAreaBounds: null,
    focusedAreaFeature: null,
    pilotAreaExitBusy: false
  };

  function hasPlacedAddressMarker() {
    if (readOnly) {
      return false;
    }
    if (marker) {
      return true;
    }
    if (!latIn || !lngIn) {
      return false;
    }
    var la = parseFloat(latIn.value);
    var ln = parseFloat(lngIn.value);
    if (!isFinite(la) || !isFinite(ln)) {
      return false;
    }
    return bounds.contains(L.latLng(la, ln));
  }

  function hasUserAnchoredMapCoords() {
    if (readOnly) {
      return false;
    }
    if (state.userOverviewLocked) {
      return true;
    }
    if (state.lastShabiyaDetail && String(state.lastShabiyaDetail.code || state.lastShabiyaDetail.name || '').trim()) {
      return true;
    }
    if (hasPlacedAddressMarker()) {
      return true;
    }
    return false;
  }

  function fitFullLibyaInView(opts) {
    var o = opts || {};
    if (skipAutoOverviewFit && !o.force) {
      return;
    }
    if (o.force) {
      clearTimeout(fitOverviewTimer);
      fitOverviewTimer = null;
      runFitFullLibyaInView(o);
      return;
    }
    var now = Date.now();
    if (now - lastFitOverviewMs < FIT_OVERVIEW_COOLDOWN_MS) {
      clearTimeout(fitOverviewTimer);
      fitOverviewTimer = setTimeout(function () {
        fitOverviewTimer = null;
        runFitFullLibyaInView(o);
      }, FIT_OVERVIEW_COOLDOWN_MS - (now - lastFitOverviewMs) + 16);
      return;
    }
    clearTimeout(fitOverviewTimer);
    fitOverviewTimer = setTimeout(function () {
      fitOverviewTimer = null;
      runFitFullLibyaInView(o);
    }, 16);
  }

  function runFitFullLibyaInView(o) {
    lastFitOverviewMs = Date.now();
    if (!o.force && hasUserAnchoredMapCoords()) {
      map.invalidateSize(false);
      return;
    }
    if (o.force) {
      state.userOverviewLocked = false;
    }
    map.invalidateSize(false);
    if (!readOnly && !o.force && focusOnLoad && isFinite(focusLat) && isFinite(focusLng) && bounds.contains(L.latLng(focusLat, focusLng))) {
      fitFocusAreaInView(o);
      applyTileCoveragePanLock({ snap: true, animate: !!o.animate });
      return;
    }
    map.fitBounds(libyaOverviewFitBounds(), libyaOverviewFitOptions({ animate: !!o.animate }));
    updateWorldMask();
    applyTileCoveragePanLock({ snap: true, animate: !!o.animate });
  }

  function fitFocusAreaInView(opts) {
    var o = opts || {};
    var pad = 0.045;
    var bb = L.latLngBounds(
      [focusLat - pad, focusLng - pad],
      [focusLat + pad, focusLng + pad]
    );
    map.fitBounds(bb, {
      padding: o.padding || [30, 40],
      animate: !!o.animate,
      maxZoom: Math.min(effectiveMaxZoom(), focusZoom)
    });
  }

  var BLANK_TILE_URL = resolveAssetUrl('data/tiles/blank-256.png');
  var SEA_TILE_URL = resolveAssetUrl('data/tiles/sea-256.png');
  var SEA_SAT_TILE_URL = resolveAssetUrl('data/tiles/sea-sat-256.png');
  var LAND_TILE_URL = resolveAssetUrl('data/tiles/land-256.png');

  var TILE_URL_REV = '21';

  var tilePerfOpts = {
    updateWhenIdle: tileUpdateIdle,
    updateWhenZooming: false,
    keepBuffer: preferOffline ? 0 : tileKeepBuffer,
    noWrap: true,
    detectRetina: false
  };

  var fitOverviewTimer = null;
  var lastFitOverviewMs = 0;
  var FIT_OVERVIEW_COOLDOWN_MS = 480;

  var offlineTilePerfOpts = Object.assign({}, tilePerfOpts, {
    keepBuffer: preferOffline ? 1 : 0,
    updateWhenIdle: false,
    updateWhenZooming: !!preferOffline
  });

  if (L.TileLayer && L.TileLayer.prototype && L.TileLayer.prototype.options) {
    L.TileLayer.prototype.options.errorTileUrl = BLANK_TILE_URL;
  }

  var tileBaseOptsOsm = Object.assign({
    maxZoom: maxZ,
    maxNativeZoom: 19,
    bounds: bounds
  }, tilePerfOpts);

  var offlineTileBaseOpts = Object.assign({
    maxZoom: maxZ,
    maxNativeZoom: 19,
    bounds: bounds
  }, offlineTilePerfOpts);

  var tileBaseOptsSat = Object.assign({
    maxZoom: maxZSat,
    maxNativeZoom: maxZSat,
    bounds: bounds
  }, tilePerfOpts);

  var osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
  var esriAttribution = '&copy; Esri, Maxar, Earthstar Geographics';
  var esriRefAttribution = '&copy; Esri — Boundaries, Places & Transportation';

  var osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    Object.assign({ attribution: osmAttribution, crossOrigin: 'anonymous' }, tileBaseOptsOsm)
  );
  var satLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    Object.assign({ attribution: esriAttribution, crossOrigin: 'anonymous', errorTileUrl: SEA_SAT_TILE_URL }, tileBaseOptsSat)
  );
  /* Offline base layer — backed by the local MBTiles file (Phase 1).
   * When a tile is missing it returns 204 and the SW falls back automatically. */
  var offlineLayer = L.tileLayer(
    'index.php?r=tile&z={z}&x={x}&y={y}&_rev=' + TILE_URL_REV,
    Object.assign(
      {
        attribution: 'Libya Postal (offline) / OSM',
        maxNativeZoom: offlineMaxZ,
        maxZoom: offlineMaxZ,
        errorTileUrl: LAND_TILE_URL
      },
      offlineTileBaseOpts
    )
  );

  var offlineSatLayer = L.tileLayer(
    'index.php?r=tile&layer=sat&z={z}&x={x}&y={y}&_rev=' + TILE_URL_REV,
    Object.assign(
      {
        attribution: 'Libya Postal (offline) / Esri',
        maxNativeZoom: offlineSatMaxZ,
        maxZoom: offlineSatMaxZ,
        errorTileUrl: SEA_SAT_TILE_URL
      },
      tileBaseOptsSat
    )
  );

  var labelsOverlayWanted = false;
  var labelsTileBounds = bounds;
  var allLabelsOverlayLayers = [];

  map.createPane('labelsTilesPane');
  map.getPane('labelsTilesPane').style.zIndex = 685;
  map.getPane('labelsTilesPane').style.pointerEvents = 'none';

  var labelsOverlayOpts = Object.assign({}, tileBaseOptsSat, {
    pane: 'labelsTilesPane',
    attribution: esriRefAttribution,
    opacity: 0.95,
    bounds: labelsTileBounds
  });

  var refBoundariesLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    labelsOverlayOpts
  );
  var refTransportLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    labelsOverlayOpts
  );

  var offlineLabelsOpts = Object.assign({}, labelsOverlayOpts, {
    maxNativeZoom: offlineLabelsMaxZ,
    maxZoom: offlineLabelsMaxZ,
    errorTileUrl: BLANK_TILE_URL,
    detectRetina: false
  });

  var offlineRefTransportLayer = L.tileLayer(
    'index.php?r=tile&layer=labels-transport&z={z}&x={x}&y={y}&_rev=' + TILE_URL_REV,
    offlineLabelsOpts
  );
  var offlineRefPlacesLayer = L.tileLayer(
    'index.php?r=tile&layer=labels-places&z={z}&x={x}&y={y}&_rev=' + TILE_URL_REV,
    offlineLabelsOpts
  );
  allLabelsOverlayLayers = [
    refBoundariesLayer,
    refTransportLayer,
    offlineRefTransportLayer,
    offlineRefPlacesLayer
  ];

  function syncLabelsTileLayerBounds() {
    var lb = libyaLandLatLngBounds();
    if (!lb || typeof lb.isValid !== 'function' || !lb.isValid()) {
      labelsTileBounds = bounds;
    } else {
      labelsTileBounds = lb.pad(0.012);
    }
    allLabelsOverlayLayers.forEach(function (ly) {
      ly.options.bounds = labelsTileBounds;
      if (map.hasLayer(ly) && typeof ly.redraw === 'function') {
        ly.redraw();
      }
    });
  }

  function decimateRingForClip(ring, maxPts) {
    if (!ring || ring.length <= maxPts) {
      return ring;
    }
    var step = Math.max(1, Math.ceil(ring.length / maxPts));
    var out = [];
    var i;
    for (i = 0; i < ring.length; i += step) {
      out.push(ring[i]);
    }
    return out.length >= 3 ? out : ring;
  }

  function clearPaneClipPath(pane) {
    if (!pane) {
      return;
    }
    pane.style.clipPath = 'none';
    pane.style.webkitClipPath = 'none';
  }

  function mapHasLayoutSize() {
    if (!map || typeof map.getSize !== 'function') {
      return false;
    }
    try {
      var sz = map.getSize();
      return !!(sz && sz.x > 0 && sz.y > 0);
    } catch (eSz) {
      return false;
    }
  }

  function clipPaneToMaskHole(pane) {
    if (!pane || !mapHasLayoutSize()) {
      return;
    }
    var holeRing = resolveMaskHoleRing();
    if (!holeRing || holeRing.length < 4) {
      clearPaneClipPath(pane);
      return;
    }
    try {
      var clipRing = decimateRingForClip(holeRing, 120);
      var pts = [];
      var ci;
      for (ci = 0; ci < clipRing.length; ci++) {
        var layerPt = map.latLngToLayerPoint(L.latLng(clipRing[ci][0], clipRing[ci][1]));
        pts.push(Math.round(layerPt.x) + 'px ' + Math.round(layerPt.y) + 'px');
      }
      if (pts.length < 3) {
        clearPaneClipPath(pane);
        return;
      }
      var clipValue = 'polygon(' + pts.join(', ') + ')';
      pane.style.clipPath = clipValue;
      pane.style.webkitClipPath = clipValue;
    } catch (eClip) {
      clearPaneClipPath(pane);
    }
  }

  function isMapDrilldownView() {
    if (state.userOverviewLocked) {
      return true;
    }
    if (state.lastShabiyaDetail) {
      var detailKey = String(state.lastShabiyaDetail.code || state.lastShabiyaDetail.name || '').trim();
      if (detailKey) {
        return true;
      }
    }
    if (map && typeof map.getZoom === 'function') {
      try {
        if (map.getZoom() >= 10) {
          return true;
        }
      } catch (eDrillZoom) {}
    }
    return false;
  }

  function shouldClipPanesToMaskHole() {
    return !isMapDrilldownView();
  }

  function updateTilePaneClip() {
    var pane = map.getPane('tilePane');
    if (!shouldClipPanesToMaskHole()) {
      clearPaneClipPath(pane);
      return;
    }
    clipPaneToMaskHole(pane);
  }

  function updateLabelsPaneClip() {
    var pane = map.getPane('labelsTilesPane');
    if (!pane) {
      return;
    }
    if (!labelsOverlayShouldBeOn() || !shouldClipPanesToMaskHole()) {
      clearPaneClipPath(pane);
      return;
    }
    clipPaneToMaskHole(pane);
  }

  function updateMapClipOverlays() {
    if (!mapHasLayoutSize()) {
      return;
    }
    try {
      updateTilePaneClip();
      updateLabelsPaneClip();
    } catch (eMapClip) {}
  }

  function labelsOverlayShouldBeOn() {
    if (currentBaseKind !== 'sat' || !labelsOverlayWanted) {
      return false;
    }
    if (allowRemoteTiles) {
      return true;
    }
    return hasOfflineLabelsTransport;
  }

  function activeTransportLabelsLayer() {
    return !allowRemoteTiles && hasOfflineLabelsTransport ? offlineRefTransportLayer : refTransportLayer;
  }

  function activePlacesLabelsLayer() {
    return !allowRemoteTiles && hasOfflineLabelsPlaces ? offlineRefPlacesLayer : refBoundariesLayer;
  }

  function removeLabelsOverlayLayers() {
    allLabelsOverlayLayers.forEach(function (ly) {
      if (map.hasLayer(ly)) {
        map.removeLayer(ly);
      }
    });
    clearPaneClipPath(map.getPane('labelsTilesPane'));
  }

  function applyLabelsOverlay() {
    var on = labelsOverlayShouldBeOn();
    removeLabelsOverlayLayers();
    if (on) {
      syncLabelsTileLayerBounds();
      var transport = activeTransportLabelsLayer();
      var places = activePlacesLabelsLayer();
      var addPlaces = allowRemoteTiles ? !skipNeighborBoundaryTiles : hasOfflineLabelsPlaces;
      if (addPlaces) {
        places.addTo(map);
      }
      transport.addTo(map);
      updateMapClipOverlays();
    }
    syncBaseLayerUi();
  }

  function syncSatButtonUi() {
    var bs = document.getElementById('addr-map-btn-sat');
    if (!bs) {
      return;
    }
    var satActive = currentBaseKind === 'sat';
    var labelsOn = labelsOverlayShouldBeOn();
    var canLabels = allowRemoteTiles || hasOfflineLabelsTransport;
    var offlineSatHint = hasOfflineSat && !allowRemoteTiles ? ' — offline' : '';
    bs.classList.toggle('is-active', satActive);
    bs.classList.toggle('is-labels-on', satActive && labelsOn);
    bs.setAttribute('aria-pressed', satActive ? 'true' : 'false');
    if (!satActive) {
      bs.title = 'أقمار صناعية' + offlineSatHint;
      bs.setAttribute('aria-label', 'عرض صور الأقمار الصناعية' + offlineSatHint);
      return;
    }
    if (!canLabels) {
      bs.title = 'أقمار صناعية' + offlineSatHint + ' — حمّل بلاطات الأسماء المحلية';
      bs.setAttribute('aria-label', 'أقمار صناعية — بلاطات الأسماء غير متوفرة');
      return;
    }
    if (labelsOn) {
      bs.title = 'أقمار صناعية' + offlineSatHint + ' — إخفاء الطرق والأسماء';
      bs.setAttribute('aria-label', 'أقمار صناعية مع الطرق والأسماء — انقر لإخفائها');
      return;
    }
    bs.title = 'أقمار صناعية' + offlineSatHint + ' — إظهار الطرق والأسماء';
    bs.setAttribute('aria-label', 'أقمار صناعية — انقر لإظهار الطرق والأسماء');
  }

  function syncBaseLayerUi() {
    var satActive = currentBaseKind === 'sat';
    var osmActive = currentBaseKind === 'osm';
    var offActive = currentBaseKind === 'offline';
    var bo = document.getElementById('addr-map-btn-osm');
    var boff = document.getElementById('addr-map-btn-offline');
    syncSatButtonUi();
    if (bo) {
      bo.classList.toggle('is-active', osmActive);
      bo.setAttribute('aria-pressed', osmActive ? 'true' : 'false');
    }
    if (boff) {
      boff.classList.toggle('is-active', offActive);
      boff.setAttribute('aria-pressed', offActive ? 'true' : 'false');
    }
  }

  function removeAllBaseLayers() {
    if (map.hasLayer(satLayer)) {
      map.removeLayer(satLayer);
    }
    if (map.hasLayer(osmLayer)) {
      map.removeLayer(osmLayer);
    }
    if (map.hasLayer(offlineLayer)) {
      map.removeLayer(offlineLayer);
    }
    if (map.hasLayer(offlineSatLayer)) {
      map.removeLayer(offlineSatLayer);
    }
  }

  function setBaseLayer(kind) {
    if (kind === 'sat' && !allowRemoteTiles && !hasOfflineSat) {
      showApiMsg('بلاطات الأقمار المحلية غير متوفرة — شغّل scripts/seed_derna_sat_tiles.php', false);
      scheduleAutoHide(4200);
      return;
    }
    if (kind === 'osm' && !allowRemoteTiles) {
      kind = 'offline';
    }
    if (kind !== 'sat' && kind !== 'osm' && kind !== 'offline') {
      return;
    }
    currentBaseKind = kind;
    removeAllBaseLayers();
    if (kind === 'sat') {
      if (allowRemoteTiles) {
        satLayer.addTo(map);
      } else {
        offlineSatLayer.addTo(map);
      }
    } else if (kind === 'osm') {
      osmLayer.addTo(map);
    } else {
      offlineLayer.addTo(map);
    }
    applyLabelsOverlay();
    applyMapMaxZoomForBase(kind);
    syncBaseLayerUi();
    updateWorldMask();
    map.invalidateSize(false);
    var activeLayer =
      kind === 'sat'
        ? (allowRemoteTiles ? satLayer : offlineSatLayer)
        : kind === 'osm'
          ? osmLayer
          : offlineLayer;
    if (activeLayer && typeof activeLayer.redraw === 'function') {
      activeLayer.redraw();
    }
    applyTileCoveragePanLock({ snap: true, animate: false });
    scheduleOfflineTileRefresh();
  }

  function toggleLabelsOverlay() {
    if (currentBaseKind !== 'sat') {
      return;
    }
    if (!allowRemoteTiles && !hasOfflineLabelsTransport) {
      showApiMsg('بلاطات الأسماء المحلية غير متوفرة — شغّل scripts/seed_derna_labels_tiles.php', false);
      scheduleAutoHide(4200);
      return;
    }
    labelsOverlayWanted = !labelsOverlayWanted;
    applyLabelsOverlay();
  }

  function wireBaseLayerButtons() {
    var bs = document.getElementById('addr-map-btn-sat');
    var bo = document.getElementById('addr-map-btn-osm');
    var bf = document.getElementById('addr-map-btn-fit');
    if (bs) {
      bs.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (currentBaseKind === 'sat') {
          toggleLabelsOverlay();
          return;
        }
        if (allowRemoteTiles || hasOfflineLabelsTransport) {
          labelsOverlayWanted = true;
        }
        setBaseLayer('sat');
      });
    }
    if (bo) {
      bo.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setBaseLayer(allowRemoteTiles ? 'osm' : 'offline');
      });
    }
    var boff = document.getElementById('addr-map-btn-offline');
    if (boff) {
      boff.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setBaseLayer('offline');
      });
    }
    if (bf) {
      bf.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        fitLibya({ reset: true });
      });
    }
  }
  wireBaseLayerButtons();

  if (currentBaseKind === 'sat' && allowRemoteTiles) {
    satLayer.addTo(map);
  } else if (currentBaseKind === 'osm' && allowRemoteTiles) {
    osmLayer.addTo(map);
  } else {
    currentBaseKind = 'offline';
    offlineLayer.addTo(map);
  }
  applyLabelsOverlay();
  syncBaseLayerUi();
  publishMapCoreApi();

  function offlineTileZoneCatalog() {
    return offlineTileZones.length ? offlineTileZones : DEFAULT_OFFLINE_TILE_ZONES;
  }

  function zoneToLatLngBounds(zone, insetRatio) {
    if (!zone) {
      return null;
    }
    var south = Number(zone.south);
    var west = Number(zone.west);
    var north = Number(zone.north);
    var east = Number(zone.east);
    if (![south, west, north, east].every(isFinite)) {
      return null;
    }
    var inset = insetRatio > 0 ? insetRatio : 0;
    if (inset > 0) {
      var latPad = (north - south) * inset;
      var lngPad = (east - west) * inset;
      south += latPad;
      north -= latPad;
      west += lngPad;
      east -= lngPad;
    }
    if (south >= north || west >= east) {
      return null;
    }
    return L.latLngBounds([south, west], [north, east]);
  }

  function clampBoundsToOfflineTileZone(bb, zoomHint) {
    if (!shouldEnforceOfflineTilePanLock() || !bb || typeof bb.isValid !== 'function' || !bb.isValid()) {
      return bb;
    }
    var z = zoomHint != null ? Math.round(zoomHint) : (map ? map.getZoom() : 10);
    var zone = resolveOfflineTileZoneForZoom(z);
    var zb = zoneToLatLngBounds(zone, 0.008);
    if (!zb || !zb.isValid()) {
      return bb;
    }
    var south = Math.max(bb.getSouth(), zb.getSouth());
    var west = Math.max(bb.getWest(), zb.getWest());
    var north = Math.min(bb.getNorth(), zb.getNorth());
    var east = Math.min(bb.getEast(), zb.getEast());
    if (south >= north - 1e-9 || west >= east - 1e-9) {
      return zb;
    }
    return L.latLngBounds([south, west], [north, east]);
  }

  function resolveOfflineTileZoneForZoom(zoom) {
    var zones = offlineTileZoneCatalog();
    var z = Math.round(zoom);
    var i;
    for (i = zones.length - 1; i >= 0; i--) {
      var zone = zones[i];
      var zmin = parseInt(zone.zmin, 10);
      var zmax = parseInt(zone.zmax, 10);
      if (z >= zmin && z <= zmax) {
        return zone;
      }
    }
    return zones[0] || null;
  }

  function isPilotShabiyaActive() {
    var detail = state.lastShabiyaDetail;
    if (!detail) {
      return false;
    }
    var mc = window.MapCore;
    if (mc && typeof mc.isPilotShabiya === 'function') {
      return mc.isPilotShabiya(detail.name, detail.code);
    }
    var code = String(detail.code || '').trim().toUpperCase();
    var name = String(detail.name || '').trim();
    return code === 'B2' || name === 'درنة' || name.indexOf('درنة') === 0;
  }

  function shouldEnforceOfflineTilePanLock() {
    if (!preferOffline || allowRemoteTiles) {
      return false;
    }
    if (isPilotShabiyaActive()) {
      return true;
    }
    if (!hasUserAnchoredMapCoords() && map && map.getZoom() <= 8) {
      return true;
    }
    return false;
  }

  function refreshOfflineTileLayers() {
    if (!map || !preferOffline) {
      return;
    }
    [offlineLayer, offlineSatLayer].forEach(function (ly) {
      if (ly && map.hasLayer(ly) && typeof ly.redraw === 'function') {
        ly.redraw();
      }
    });
  }

  var offlineTileRefreshTimer = null;
  function scheduleOfflineTileRefresh() {
    if (!preferOffline || !map) {
      return;
    }
    if (offlineTileRefreshTimer != null) {
      clearTimeout(offlineTileRefreshTimer);
    }
    offlineTileRefreshTimer = window.setTimeout(function () {
      offlineTileRefreshTimer = null;
      refreshOfflineTileLayers();
    }, 48);
  }

  function syncOfflineTileLayerBounds(panBounds) {
    var tileBounds = bounds;
    if (panBounds && panBounds.isValid()) {
      var useZoneBounds = !isMapDrilldownView() || isPilotShabiyaActive();
      if (useZoneBounds) {
        tileBounds = panBounds;
      }
    }
    [offlineLayer, offlineSatLayer].forEach(function (ly) {
      if (!ly || !ly.options) {
        return;
      }
      ly.options.bounds = tileBounds;
      if (map.hasLayer(ly) && typeof ly.redraw === 'function') {
        ly.redraw();
      }
    });
  }

  function expandLatLngBounds(bb, padDeg) {
    if (!bb || !bb.isValid()) {
      return null;
    }
    var pad = padDeg != null ? padDeg : 0.008;
    return L.latLngBounds(
      [bb.getSouth() - pad, bb.getWest() - pad],
      [bb.getNorth() + pad, bb.getEast() + pad]
    );
  }

  /* Re-entrancy guard: setMaxBounds()/panInsideBounds() fire 'moveend'/'zoomend'
   * synchronously. Without this guard the pan-lock handlers re-pan on every such
   * event, and when the viewport is larger than the lock zone (e.g. the initial
   * Libya overview) `pb.contains(mapBounds)` never becomes true — causing an
   * infinite synchronous loop that overflows the stack and aborts map init
   * before the address-placement click handlers are bound. */
  var mapPanLockBusy = false;
  function runPanLocked(fn) {
    if (mapPanLockBusy) {
      return;
    }
    mapPanLockBusy = true;
    try {
      fn();
    } finally {
      mapPanLockBusy = false;
    }
  }

  function applyAreaPanLock(areaBounds, opts) {
    opts = opts || {};
    if (!map || !areaBounds || !areaBounds.isValid()) {
      return;
    }
    var panBounds = expandLatLngBounds(areaBounds, opts.pad != null ? opts.pad : 0.008);
    if (!panBounds || !panBounds.isValid()) {
      return;
    }
    state.activeAreaPanBounds = panBounds;
    state.pilotAreaPlacementActive = true;
    runPanLocked(function () {
      map.setMaxBounds(panBounds);
      map.options.maxBoundsViscosity = 1.0;
      if (opts.snap !== false && typeof map.panInsideBounds === 'function') {
        map.panInsideBounds(panBounds, {
          animate: !!opts.animate,
          duration: opts.animate ? 0.28 : 0,
          easeLinearity: 0.22,
          noMoveStart: true
        });
      }
    });
  }

  function clearAreaPanLock(opts) {
    opts = opts || {};
    state.activeAreaPanBounds = null;
    state.pilotAreaPlacementActive = false;
    state.focusedAreaBounds = null;
    state.focusedAreaFeature = null;
    applyTileCoveragePanLock({ snap: opts.snap !== false, animate: !!opts.animate });
  }

  function enforceAreaPanInsideView() {
    if (!state.activeAreaPanBounds || !map || typeof map.panInsideBounds !== 'function') {
      return;
    }
    var pb = state.activeAreaPanBounds;
    var mapBounds = map.getBounds();
    if (mapBounds && pb.contains(mapBounds)) {
      return;
    }
    runPanLocked(function () {
      map.panInsideBounds(pb, {
        animate: true,
        duration: 0.18,
        easeLinearity: 0.25,
        noMoveStart: true
      });
    });
  }

  function onMapViewChangeForAreaPanLock(opts) {
    opts = opts || {};
    if (!state.activeAreaPanBounds || !state.activeAreaPanBounds.isValid()) {
      return false;
    }
    if (opts.checkAreaExit && window.MapCore && typeof window.MapCore.watchPilotAreaViewportExit === 'function') {
      window.MapCore.watchPilotAreaViewportExit();
    }
    scheduleOfflineTileRefresh();
    return true;
  }

  function applyTileCoveragePanLock(opts) {
    opts = opts || {};
    if (!map) {
      return;
    }
    if (state.activeAreaPanBounds && state.activeAreaPanBounds.isValid()) {
      return;
    }
    if (!shouldEnforceOfflineTilePanLock()) {
      state.activeTilePanBounds = null;
      runPanLocked(function () {
        map.setMaxBounds(bounds);
        map.options.maxBoundsViscosity = 1.0;
      });
      syncOfflineTileLayerBounds(bounds);
      return;
    }
    var zone = resolveOfflineTileZoneForZoom(map.getZoom());
    var panBounds = zoneToLatLngBounds(zone, 0.012);
    if (!panBounds || !panBounds.isValid()) {
      state.activeTilePanBounds = null;
      runPanLocked(function () {
        map.setMaxBounds(bounds);
      });
      syncOfflineTileLayerBounds(bounds);
      return;
    }
    state.activeTilePanBounds = panBounds;
    runPanLocked(function () {
      map.setMaxBounds(panBounds);
      map.options.maxBoundsViscosity = 1.0;
    });
    syncOfflineTileLayerBounds(panBounds);
    if (opts.snap !== false && typeof map.panInsideBounds === 'function') {
      runPanLocked(function () {
        map.panInsideBounds(panBounds, {
          animate: !!opts.animate,
          duration: opts.animate ? 0.28 : 0,
          easeLinearity: 0.22,
          noMoveStart: true
        });
      });
    }
  }

  function enforceTileCoverageInsideView() {
    if (!state.activeTilePanBounds || !map || typeof map.panInsideBounds !== 'function') {
      return;
    }
    runPanLocked(function () {
      map.panInsideBounds(state.activeTilePanBounds, { animate: true, duration: 0.22, easeLinearity: 0.22, noMoveStart: true });
    });
  }

  map.on('zoomend', function () {
    if (mapPanLockBusy) {
      return;
    }
    if (onMapViewChangeForAreaPanLock({ checkAreaExit: true })) {
      return;
    }
    applyTileCoveragePanLock({ snap: true, animate: true });
    scheduleOfflineTileRefresh();
  });
  map.on('moveend', function () {
    if (mapPanLockBusy) {
      return;
    }
    if (onMapViewChangeForAreaPanLock({ checkAreaExit: false })) {
      return;
    }
    if (!state.activeTilePanBounds) {
      scheduleOfflineTileRefresh();
      return;
    }
    if (isMapDrilldownView()) {
      scheduleOfflineTileRefresh();
      return;
    }
    if (typeof map.panInsideBounds !== 'function') {
      return;
    }
    var pb = state.activeTilePanBounds;
    var mapBounds = map.getBounds();
    if (mapBounds && pb.contains(mapBounds)) {
      return;
    }
    runPanLocked(function () {
      map.panInsideBounds(pb, { animate: true, duration: 0.18, easeLinearity: 0.25, noMoveStart: true });
    });
  });

  map.whenReady(function () {
    syncBaseLayerUi();
    syncDashboardHud();
    bootWorldMask();
    if (!skipAutoOverviewFit && !hasUserAnchoredMapCoords()) {
      runFitFullLibyaInView({ animate: false });
    } else {
      map.invalidateSize(false);
    }
    bootWorldMask();
    updateMapClipOverlays();
    applyTileCoveragePanLock({ snap: true, animate: false });
  });

  (function addSkyVignette() {
    var wrap = el.parentNode;
    if (!wrap) {
      return;
    }
    if (wrap.querySelector('.libya-sky-vignette')) {
      return;
    }
    var vig = document.createElement('div');
    vig.className = 'libya-sky-vignette';
    wrap.appendChild(vig);
  })();

  function ringLngLatToLatLng(ring) {
    var out = [];
    for (var i = 0; i < ring.length; i++) {
      var c = ring[i];
      out.push([c[1], c[0]]);
    }
    return out;
  }

  function boundsToLatLngRing(b) {
    var sw = b.getSouthWest();
    var ne = b.getNorthEast();
    return [
      [sw.lat, sw.lng],
      [ne.lat, sw.lng],
      [ne.lat, ne.lng],
      [sw.lat, ne.lng],
      [sw.lat, sw.lng]
    ];
  }

  var worldMaskLayer = null;
  var libyaOutlineLayer = null;
  var libyaOutlineGlow = null;

  function ensureOppositeWinding(outerRing, holeRing) {
    var out = outerRing.slice();
    var hole = holeRing.slice();
    if (ringSignedAreaLatLng(out) > 0) {
      out.reverse();
    }
    if (ringSignedAreaLatLng(hole) < 0) {
      hole.reverse();
    }
    return { outer: out, hole: hole };
  }

  function buildNorthernCoastProfile(landRing) {
    var profile = {};
    var i;
    for (i = 0; i < landRing.length; i++) {
      var lat = landRing[i][0];
      var lng = landRing[i][1];
      var key = Math.round(lng * 4) / 4;
      if (profile[key] == null || lat > profile[key]) {
        profile[key] = lat;
      }
    }
    return profile;
  }

  function northernCoastLatAt(profile, lng) {
    var key = Math.round(lng * 4) / 4;
    if (profile[key] != null) {
      return profile[key];
    }
    var bestKey = null;
    var bestD = Infinity;
    for (var k in profile) {
      if (!Object.prototype.hasOwnProperty.call(profile, k)) {
        continue;
      }
      var d = Math.abs(parseFloat(k) - lng);
      if (d < bestD) {
        bestD = d;
        bestKey = k;
      }
    }
    return bestKey != null ? profile[bestKey] : null;
  }

  /** Modest maritime buffer that preserves the true land coastline shape. */
  function buildLibyaSeaMaskRing(landRing) {
    if (!landRing || landRing.length < 4) {
      return landRing;
    }
    var profile = buildNorthernCoastProfile(landRing);
    var northPush = 0.22;
    var sirteSouthPush = 0.28;
    var coastTol = 0.22;
    var out = [];
    var i;
    for (i = 0; i < landRing.length; i++) {
      var lat = landRing[i][0];
      var lng = landRing[i][1];
      var coastLat = northernCoastLatAt(profile, lng);
      if (lng >= 9.2 && lng <= 25.2 && coastLat != null && coastLat >= 28.8) {
        var onNorthCoast = lat >= coastLat - coastTol;
        var inSirteGulf = lng >= 16 && lng <= 20.5 && lat < coastLat - 0.08 && lat >= 29.8 && lat <= 32.2;
        if (onNorthCoast) {
          lat = lat + northPush;
        } else if (inSirteGulf) {
          lat = lat - sirteSouthPush;
        }
      }
      out.push([lat, lng]);
    }
    return out;
  }

  function isValidMaskHoleRing(ring) {
    if (!ring || ring.length < 4) {
      return false;
    }
    var copy = ring.slice();
    return ringSignedAreaLatLng(copy) < 0;
  }

  function ringSignedAreaLatLng(ring) {
    var a = 0;
    var n = ring.length;
    var i;
    for (i = 0; i < n - 1; i++) {
      a += (ring[i][1] - ring[i + 1][1]) * (ring[i][0] + ring[i + 1][0]);
    }
    if (n > 1) {
      a += (ring[n - 1][1] - ring[0][1]) * (ring[n - 1][0] + ring[0][0]);
    }
    return a * 0.5;
  }

  function normalizeMaskHoleRing(ring) {
    if (!ring || ring.length < 4) {
      return ring;
    }
    var copy = ring.slice();
    if (ringSignedAreaLatLng(copy) > 0) {
      copy.reverse();
    }
    return copy;
  }

  function worldMaskOuterRing() {
    return [
      [56, -48],
      [56, 68],
      [-22, 68],
      [-22, -48],
      [56, -48]
    ];
  }

  function viewportMaskOuterRing() {
    var padPx = 96;
    if (map && mapHasLayoutSize() && typeof map.containerPointToLatLng === 'function') {
      try {
        var size = map.getSize();
        var sw = map.containerPointToLatLng(L.point(-padPx, size.y + padPx));
        var ne = map.containerPointToLatLng(L.point(size.x + padPx, -padPx));
        if (sw && ne) {
          return [
            [ne.lat, sw.lng],
            [ne.lat, ne.lng],
            [sw.lat, ne.lng],
            [sw.lat, sw.lng],
            [ne.lat, sw.lng]
          ];
        }
      } catch (eVp) {}
    }
    var padLat = 16;
    var padLng = 22;
    var bSw = bounds.getSouthWest();
    var bNe = bounds.getNorthEast();
    return [
      [bNe.lat + padLat, bSw.lng - padLng],
      [bNe.lat + padLat, bNe.lng + padLng],
      [bSw.lat - padLat, bNe.lng + padLng],
      [bSw.lat - padLat, bSw.lng - padLng],
      [bNe.lat + padLat, bSw.lng - padLng]
    ];
  }

  function applyMaskHoleOnly(innerLatLngRing) {
    if (!innerLatLngRing) {
      if (worldMaskLayer) {
        try {
          map.removeLayer(worldMaskLayer);
        } catch (eRmNone) {}
        worldMaskLayer = null;
      }
      return;
    }
    var hole = normalizeMaskHoleRing(innerLatLngRing);
    var outer = viewportMaskOuterRing();
    var wound = ensureOppositeWinding(outer, hole);
    if (worldMaskLayer) {
      try {
        map.removeLayer(worldMaskLayer);
      } catch (eRm) {}
      worldMaskLayer = null;
    }
    worldMaskLayer = L.polygon([wound.outer, wound.hole], {
      stroke: false,
      fillColor: '#010308',
      fillOpacity: 1,
      fillRule: 'evenodd',
      interactive: false,
      pane: 'maskPane'
    }).addTo(map);
    if (worldMaskLayer.bringToFront) {
      worldMaskLayer.bringToFront();
    }
  }

  function applyLibyaDecorations(innerLatLngRing) {
    if (libyaOutlineGlow) {
      try { map.removeLayer(libyaOutlineGlow); } catch (eG) {}
      libyaOutlineGlow = null;
    }
    if (libyaOutlineLayer) {
      try { map.removeLayer(libyaOutlineLayer); } catch (eO) {}
      libyaOutlineLayer = null;
    }
    libyaOutlineGlow = L.polyline(innerLatLngRing, {
      color: '#38bdf8',
      weight: 6,
      opacity: 0.18,
      smoothFactor: 0,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
      pane: 'maskPane'
    }).addTo(map);
    libyaOutlineLayer = L.polyline(innerLatLngRing, {
      color: '#fbbf24',
      weight: 1.6,
      opacity: 0.95,
      smoothFactor: 0,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
      pane: 'maskPane'
    }).addTo(map);
    if (libyaOutlineLayer.bringToFront) {
      libyaOutlineLayer.bringToFront();
    }
    if (libyaOutlineGlow && libyaOutlineGlow.bringToFront) {
      libyaOutlineGlow.bringToFront();
    }
  }

  var landMaskRing = null;
  var visibleMaskRing = null;

  function baseLandMaskRing() {
    if (landMaskRing && landMaskRing.length >= 4) {
      return landMaskRing;
    }
    return boundsToLatLngRing(bounds);
  }

  function resolveMaskHoleRing() {
    var ring = baseLandMaskRing();
    if (!landMaskRing || landMaskRing.length < 4) {
      return ring;
    }
    if (visibleMaskRing && visibleMaskRing.length >= 4) {
      return visibleMaskRing.slice();
    }
    var seaRing = buildLibyaSeaMaskRing(landMaskRing.slice());
    if (isValidMaskHoleRing(seaRing)) {
      return seaRing;
    }
    return landMaskRing.slice();
  }

  function refreshMapMaskForView(optionalLandRing) {
    updateWorldMask(optionalLandRing);
  }

  function syncShabiyatAboveMask() {
    if (!state.shabiyatLayer || typeof state.shabiyatLayer.eachLayer !== 'function') {
      return;
    }
    state.shabiyatLayer.eachLayer(function (layer) {
      if (layer && layer.bringToFront) {
        layer.bringToFront();
      }
    });
  }

  function clearLibyaDecorations() {
    if (libyaOutlineGlow) {
      try { map.removeLayer(libyaOutlineGlow); } catch (eG) {}
      libyaOutlineGlow = null;
    }
    if (libyaOutlineLayer) {
      try { map.removeLayer(libyaOutlineLayer); } catch (eO) {}
      libyaOutlineLayer = null;
    }
  }

  function updateWorldMask(landRing) {
    if (landRing && landRing.length >= 4) {
      landMaskRing = landRing;
    }
    if (isMapDrilldownView()) {
      applyMaskHoleOnly(null);
      clearLibyaDecorations();
    } else {
      applyMaskHoleOnly(resolveMaskHoleRing());
      if (landMaskRing && landMaskRing.length >= 4) {
        applyLibyaDecorations(landMaskRing);
      } else {
        clearLibyaDecorations();
      }
    }
    syncShabiyatAboveMask();
    updateMapClipOverlays();
  }

  function setWorldMask(landRing, opts) {
    opts = opts || {};
    if (opts.includeMaritime === false) {
      landMaskRing = landRing;
      applyMaskHoleOnly(landRing);
      applyLibyaDecorations(landRing);
      return;
    }
    updateWorldMask(landRing);
  }

  function setLayerCheckbox(id, checked) {
    var cb = document.getElementById(id);
    if (!cb || cb.checked === !!checked) {
      return;
    }
    cb.checked = !!checked;
    try {
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (eCh) {
      if (typeof Event === 'function') {
        cb.dispatchEvent(new Event('change'));
      }
    }
  }

  function resetMapToCleanState() {
    try {
      window.dispatchEvent(new Event('addr-map-clear-annotations'));
    } catch (eAnn) {}

    if (window.MapCore && typeof window.MapCore.resetMapLayersForHierarchyChange === 'function') {
      window.MapCore.resetMapLayersForHierarchyChange({
        clearPlaces: true,
        resetShabiya: true,
        keepShabiyaDetail: false,
        clearSelectedPlace: true
      });
    } else {
      clearMapSelection();
    }

    state.userOverviewLocked = false;
    state.markerModePending = false;
    syncMarkerModeButton();
    syncMapCrosshairCursor();
    clearAddressMarker();

    if (window.MapCore && typeof window.MapCore.resetDraw === 'function') {
      window.MapCore.resetDraw();
    }

    setLayerCheckbox('layer-labels', false);
    setLayerCheckbox('layer-entity-labels', false);
    setLayerCheckbox('layer-boundaries', true);

    if (window.MapCore && typeof window.MapCore.restoreDefaultBoundaryLayers === 'function') {
      window.MapCore.restoreDefaultBoundaryLayers();
    }
    labelsOverlayWanted = false;
    applyLabelsOverlay();

    var targetBase = defaultBase;
    if (targetBase === 'osm' && !allowRemoteTiles) {
      targetBase = 'offline';
    }
    if (currentBaseKind !== targetBase) {
      setBaseLayer(targetBase);
    } else {
      syncBaseLayerUi();
    }

    showApiMsg('', false);
    syncMarkerCtaReveal();
    applyTileCoveragePanLock({ snap: true, animate: false });
  }

  function fitLibya(opts) {
    opts = opts || {};
    var doReset = opts.reset === true;
    try {
      var u = new URL(window.location.href);
      var route = u.searchParams.get('r') || '';
      if (route === 'address_new' || route === 'address_edit') {
        if (typeof map.stop === 'function') {
          map.stop();
        }
        if (doReset) {
          if (!readOnly && window.AddressForm && typeof window.AddressForm.resetAddFormFields === 'function') {
            window.AddressForm.resetAddFormFields(true);
          }
          try {
            window.dispatchEvent(new Event('addr-map-reset'));
          } catch (eRst) {}
        }
        fitFullLibyaInView({ force: true, animate: doReset && opts.animate !== false });
        return;
      }
      window.location.href = 'index.php?r=address_new';
    } catch (_) {
      window.location.href = 'index.php?r=address_new';
    }
  }

  function resolveMaskUrl(u) {
    return resolveAssetUrl(u);
  }

  function isValidInnerRing(ring) {
    if (!ring || ring.length < 4) {
      return false;
    }
    for (var vi = 0; vi < ring.length; vi++) {
      var p = ring[vi];
      if (!Array.isArray(p) || p.length < 2) {
        return false;
      }
      if (!isFinite(p[0]) || !isFinite(p[1])) {
        return false;
      }
    }
    return true;
  }

  function bootWorldMask() {
    if (loadEmbeddedMaskRing()) {
      return true;
    }
    updateWorldMask(boundsToLatLngRing(bounds));
    return false;
  }

  function readEmbeddedMaskCoords() {
    if (Array.isArray(window.LP_LIBYA_MASK_RING) && window.LP_LIBYA_MASK_RING.length >= 4) {
      return window.LP_LIBYA_MASK_RING;
    }
    var dataEl = document.getElementById('libya-mask-ring-data');
    if (!dataEl) {
      return null;
    }
    try {
      var coords = JSON.parse(dataEl.textContent || '[]');
      return Array.isArray(coords) && coords.length >= 4 ? coords : null;
    } catch (eParse) {
      return null;
    }
  }

  function readEmbeddedVisibleMaskCoords() {
    if (Array.isArray(window.LP_LIBYA_VISIBLE_MASK_RING) && window.LP_LIBYA_VISIBLE_MASK_RING.length >= 4) {
      return window.LP_LIBYA_VISIBLE_MASK_RING;
    }
    return null;
  }

  function loadEmbeddedMaskRing() {
    var coords = readEmbeddedMaskCoords();
    if (!coords) {
      return false;
    }
    try {
      var inner = ringLngLatToLatLng(coords);
      if (!isValidInnerRing(inner)) {
        return false;
      }
      visibleMaskRing = null;
      var visibleCoords = readEmbeddedVisibleMaskCoords();
      if (visibleCoords) {
        var visible = ringLngLatToLatLng(visibleCoords);
        if (isValidMaskHoleRing(visible)) {
          visibleMaskRing = visible;
        }
      }
      updateWorldMask(inner);
      syncLabelsTileLayerBounds();
      updateMapClipOverlays();
      return true;
    } catch (eMaskEmb) {
      return false;
    }
  }

  function publishMapCoreApi() {
    /* Public API for cross-module + external consumers (forms, save flow). */
    window.MapCore = {
      map: map,
      bounds: bounds,
      minZ: minZ,
      maxZ: maxZ,
      /* base layers exposed so other pages can re-use them and toggle local/offline tiles */
      osmLayer: osmLayer,
      satLayer: satLayer,
      offlineLayer: offlineLayer,
      offlineSatLayer: offlineSatLayer,
      hasOfflineSat: hasOfflineSat,
      hasOfflineLabelsTransport: hasOfflineLabelsTransport,
      hasOfflineLabelsPlaces: hasOfflineLabelsPlaces,
      readOnly: readOnly,
      regions: regions,
      WILKEY_TO_PROV_FORM: WILKEY_TO_PROV_FORM,
      state: state,
      el: el,
      latIn: latIn,
      lngIn: lngIn,
      readout: readout,
      readoutVals: readoutVals,
      /* state mutators */
      setMarkerModePending: function (b) { state.markerModePending = !!b; syncMarkerModeButton(); },
      /* helpers */
      nearestRegion: nearestRegion,
      hasPlacedAddressMarker: hasPlacedAddressMarker,
      placeAddressMarker: placeAddressMarker,
      setFields: setFields,
      syncMarkerModeButton: syncMarkerModeButton,
      syncMapCrosshairCursor: syncMapCrosshairCursor,
      syncMarkerCtaReveal: syncMarkerCtaReveal,
      syncDashboardHud: syncDashboardHud,
      showApiMsg: showApiMsg,
      showPilotTrialNotice: showPilotTrialNotice,
      scheduleApiMsgAutoHide: scheduleAutoHide,
      clearAddrApiMsgHideTimer: clearAddrApiMsgHideTimer,
      flyToPlace: flyToPlace,
      flyToEntityLocation: flyToEntityLocation,
      bumpMapZoomLevels: bumpMapZoomLevels,
      scheduleAfterMapFly: scheduleAfterMapFly,
      CITY_SELECT_EXTRA_ZOOM: CITY_SELECT_EXTRA_ZOOM,
      flyToWilayahKey: flyToWilayahKey,
      clearMapSelection: clearMapSelection,
      resetMapToCleanState: resetMapToCleanState,
      fitLibya: fitLibya,
      fitFullLibyaInView: fitFullLibyaInView,
      fitFocusAreaInView: fitFocusAreaInView,
      setBaseLayer: setBaseLayer,
      preferOffline: preferOffline,
      allowRemoteTiles: allowRemoteTiles,
      currentBaseKind: function () { return currentBaseKind; },
      toggleLabelsOverlay: toggleLabelsOverlay,
      refreshMapMaskForView: refreshMapMaskForView,
      updateMapClipOverlays: updateMapClipOverlays,
      isMapDrilldownView: isMapDrilldownView,
      clampBoundsToOfflineTileZone: clampBoundsToOfflineTileZone,
      applyTileCoveragePanLock: applyTileCoveragePanLock,
      applyAreaPanLock: applyAreaPanLock,
      clearAreaPanLock: clearAreaPanLock,
      enforceTileCoverageInsideView: enforceTileCoverageInsideView,
      refreshOfflineTileLayers: refreshOfflineTileLayers,
      scheduleOfflineTileRefresh: scheduleOfflineTileRefresh,
      setDrawClickHandler: function (fn) { state.drawClickHandler = (typeof fn === 'function') ? fn : null; },
      /* placeholders to be implemented by sibling modules */
      clearCityPlaces: function () {},
      resetDraw: function () {}
    };

    /* AddrMap external API (back-compat with previous global). */
    window.AddrMap = {
      cancelAddrApiMsgAutoHide: clearAddrApiMsgHideTimer,
      bootstrapMarkerGateContext: function (opts) {
        var o = opts || {};
        if (readOnly) {
          return;
        }
        var pv = String(o.province || '').trim();
        if (pv) {
          state.lastShabiyaDetail = {
            province: pv,
            n: o.area != null && o.area !== '' ? o.area : '',
            name: o.shabiyaName ? String(o.shabiyaName).trim() : '',
            code: o.code ? String(o.code).trim() : ''
          };
        } else {
          state.lastShabiyaDetail = null;
        }
        var cname = o.cityAreaName ? String(o.cityAreaName).trim() : '';
        if (cname) {
          state.selectedPlace = { name: cname, lat: NaN, lng: NaN, type: '' };
        } else {
          state.selectedPlace = null;
        }
        syncMarkerCtaReveal();
      },
      flyTo: function (lat, lng, z) {
        if (map && typeof map.stop === 'function') {
          map.stop();
        }
        var zz = z != null ? z : Math.max(minZ, Math.min(maxZ, 14));
        map.setView([lat, lng], zz, { animate: false });
      },
      flyToWilayahKey: flyToWilayahKey,
      flyToEntityLocation: flyToEntityLocation,
      hasPlacedAddressMarker: hasPlacedAddressMarker,
      bumpMapZoomLevels: bumpMapZoomLevels,
      scheduleAfterMapFly: scheduleAfterMapFly,
      CITY_SELECT_EXTRA_ZOOM: CITY_SELECT_EXTRA_ZOOM,
      showCityBoundaryOnly: function (cityId, regionId) {
        if (window.MapCore && typeof window.MapCore.showCityBoundaryOnly === 'function') {
          window.MapCore.showCityBoundaryOnly(cityId, regionId);
        }
      },
      showCityChildBoundaries: function (cityId, opts) {
        if (window.MapCore && typeof window.MapCore.showCityChildBoundaries === 'function') {
          return window.MapCore.showCityChildBoundaries(cityId, opts);
        }
        return Promise.resolve(false);
      },
      showPilotDernaCityBoundaries: function (cityId, opts) {
        if (window.MapCore && typeof window.MapCore.showPilotDernaCityBoundaries === 'function') {
          return window.MapCore.showPilotDernaCityBoundaries(cityId, opts);
        }
        return Promise.resolve(false);
      },
      showPilotDernaAreaView: function (areaId, cityId, opts) {
        if (window.MapCore && typeof window.MapCore.showPilotDernaAreaView === 'function') {
          return window.MapCore.showPilotDernaAreaView(areaId, cityId, opts);
        }
        return Promise.resolve(false);
      },
      showAreaWithStreets: function (areaId, cityId, opts) {
        if (window.MapCore && typeof window.MapCore.showAreaWithStreets === 'function') {
          return window.MapCore.showAreaWithStreets(areaId, cityId, opts);
        }
        return Promise.resolve(false);
      },
      showBlockBoundaryOnly: function (level, entityId, parentId) {
        if (window.MapCore && typeof window.MapCore.showBlockBoundaryOnly === 'function') {
          window.MapCore.showBlockBoundaryOnly(level, entityId, parentId);
        }
      },
      showWilayahRegionGrids: function (wilayahKey) {
        if (window.MapCore && typeof window.MapCore.showWilayahRegionGrids === 'function') {
          window.MapCore.showWilayahRegionGrids(wilayahKey);
        }
      },
      restoreShabiyatLayerIfHidden: function () {
        if (window.MapCore && typeof window.MapCore.restoreShabiyatLayerIfHidden === 'function') {
          window.MapCore.restoreShabiyatLayerIfHidden();
        }
      },
      hideBoundariesForAddressPick: function () {
        if (window.MapCore && typeof window.MapCore.hideBoundariesForAddressPick === 'function') {
          window.MapCore.hideBoundariesForAddressPick();
        }
      },
      restoreBoundariesLayerPreference: function () {
        if (window.MapCore && typeof window.MapCore.restoreBoundariesLayerPreference === 'function') {
          window.MapCore.restoreBoundariesLayerPreference();
        }
      },
      restoreDefaultBoundaryLayers: function () {
        if (window.MapCore && typeof window.MapCore.restoreDefaultBoundaryLayers === 'function') {
          window.MapCore.restoreDefaultBoundaryLayers();
        }
      },
      flyToLoadedCityPlace: function (name) {
        if (readOnly || !name || hasPlacedAddressMarker()) {
          return;
        }
        var k = String(name).trim();
        if (!k) {
          return;
        }
        var rec = state.cityPlaceByName[k];
        if (!rec || !isFinite(rec.lat) || !isFinite(rec.lng)) {
          return;
        }
        if (map && typeof map.stop === 'function') {
          map.stop();
        }
        flyToPlace(rec.lat, rec.lng, rec.type);
        state.selectedPlace = { name: k, lat: rec.lat, lng: rec.lng, type: rec.type || '' };
        syncMarkerCtaReveal();
      },
      showSavedLocation: function (lat, lng, z) {
        if (!isFinite(lat) || !isFinite(lng)) {
          return;
        }
        if (map && typeof map.stop === 'function') {
          map.stop();
        }
        var zz = z != null ? z : Math.max(minZ, Math.min(maxZ, 15));
        map.setView([lat, lng], zz, { animate: false });
        if (readOnly) {
          if (readoutVals) {
            readoutVals.textContent = lat.toFixed(6) + ' ، ' + lng.toFixed(6);
          } else if (readout) {
            readout.textContent = lat.toFixed(6) + ' ، ' + lng.toFixed(6);
          }
          syncMarkerCtaReveal();
          return;
        }
        if (marker) {
          map.removeLayer(marker);
        }
        marker = makeAddressMarker([lat, lng]);
        setFields(lat, lng);
        syncMarkerCtaReveal();
      },
      setMarkerMode: function (on) {
        if (readOnly) {
          return;
        }
        state.markerModePending = !!on;
        syncMarkerModeButton();
        syncMapCrosshairCursor();
        if (state.markerModePending) {
          var wrapOn = document.getElementById('map-marker-cta-slot');
          if (wrapOn) {
            wrapOn.hidden = false;
            wrapOn.setAttribute('aria-hidden', 'false');
          }
          syncDashboardHud();
        } else {
          syncMarkerCtaReveal();
        }
      },
      clearSelection: function () {
        clearMapSelection();
      },
      clearMapSelection: function () {
        clearMapSelection();
      },
      prepareHierarchyChange: prepareHierarchyChange,
      clearAddressMarker: clearAddressMarker,
      fillFromLatLng: function (lat, lng) {
        if (readOnly) {
          return;
        }
        var nr = nearestRegion(lat, lng);
        if (nr) {
          window.dispatchEvent(
            new CustomEvent('addr-map-fill', {
              detail: {
                province: nr.province,
                area: nr.n,
                city: nr.city != null ? nr.city : 1,
                sector: 'S',
                place: nr.name || '',
                code: nr.code || ''
              }
            })
          );
        }
      },
      getMap: function () { return map; },
      setBaseLayer: setBaseLayer,
      resetMapToCleanState: resetMapToCleanState,
      fitLibya: fitLibya,
      fitFullLibyaInView: fitFullLibyaInView,
      toggleLabelsOverlay: toggleLabelsOverlay,
      exportPng: exportPng
    };
  }

  var maskUrl = root.dataset.maskUrl || '';
  bootWorldMask();
  if (maskUrl) {
    fetch(resolveMaskUrl(maskUrl), { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) {
          throw new Error('mask http ' + r.status);
        }
        return r.json();
      })
      .then(function (geo) {
        var coords = geo.geometry && geo.geometry.coordinates;
        if (!coords || !coords[0]) {
          return;
        }
        var inner = ringLngLatToLatLng(coords[0]);
        if (!isValidInnerRing(inner)) {
          return;
        }
        updateWorldMask(inner);
      })
      .catch(function () {});
  }

  map.on('zoomend moveend resize', function () {
    updateWorldMask();
  });

  /* HUD + API messaging */
  var addrApiMsgHideTimer = null;
  function clearAddrApiMsgHideTimer() {
    if (addrApiMsgHideTimer != null) {
      clearTimeout(addrApiMsgHideTimer);
      addrApiMsgHideTimer = null;
    }
  }
  function showApiMsg(text, isErr) {
    clearAddrApiMsgHideTimer();
    var msg = document.getElementById('addr-api-msg');
    if (!msg) {
      return;
    }
    if (!text) {
      msg.hidden = true;
      msg.textContent = '';
      msg.className = 'addr-api-msg';
      return;
    }
    msg.hidden = false;
    msg.textContent = text;
    msg.className = 'addr-api-msg' + (isErr ? ' addr-api-msg--err' : ' addr-api-msg--ok');
  }
  function showPilotTrialNotice() {
    clearAddrApiMsgHideTimer();
    var msg = document.getElementById('addr-api-msg');
    if (!msg) {
      return;
    }
    msg.hidden = false;
    msg.className = 'addr-api-msg addr-api-msg--pilot';
    msg.innerHTML =
      '<span class="addr-api-msg__title">قريباً</span>' +
      '<span class="addr-api-msg__body">النظام في <strong>فترة تجريبية</strong> — الخدمة متاحة حالياً في <strong>شعبية درنة</strong> فقط.</span>';
    scheduleAutoHide(4200);
  }
  function scheduleAutoHide(ms) {
    addrApiMsgHideTimer = setTimeout(function () {
      addrApiMsgHideTimer = null;
      showApiMsg('', false);
    }, ms);
  }

  function zoomForPlaceType(t) {
    var pt = String(t || '').toLowerCase();
    if (pt === 'city') { return 13; }
    if (pt === 'town') { return 14; }
    if (pt === 'village') { return 14; }
    if (pt === 'suburb') { return 15; }
    return 14;
  }

  function flyToPlace(lat, lng, placeType) {
    var pt = String(placeType || '').toLowerCase();
    var pad = pt === 'city' ? 0.055 : pt === 'town' ? 0.04 : 0.028;
    var bb = L.latLngBounds([lat - pad, lng - pad], [lat + pad, lng + pad]);
    var zCap = pt === 'city' ? 12 : pt === 'town' ? 13 : Math.min(maxZ, zoomForPlaceType(placeType) + 1);
    map.flyToBounds(bb, {
      paddingTopLeft: [32, 44],
      paddingBottomRight: [32, 32],
      maxZoom: Math.min(maxZ, zCap),
      duration: 0.5
    });
  }

  function maxZoomForEntityLevel(level) {
    var lv = String(level || '').toLowerCase();
    if (lv === 'street') { return Math.min(maxZ, 17); }
    if (lv === 'area') { return Math.min(maxZ, 16); }
    if (lv === 'city') { return Math.min(maxZ, 14); }
    return Math.min(maxZ, 12);
  }

  function flyToEntityLocation(level, entityId) {
    if (readOnly || !map || !level || !entityId) {
      return Promise.resolve(false);
    }
    if (hasPlacedAddressMarker()) {
      return Promise.resolve(false);
    }
    if (typeof map.stop === 'function') {
      map.stop();
    }
    var url =
      'index.php?r=boundary_entity_loc&level=' +
      encodeURIComponent(String(level)) +
      '&entity_id=' +
      encodeURIComponent(String(entityId));
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) { throw new Error('entity_loc http ' + r.status); }
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok) {
          return false;
        }
        var zCap = maxZoomForEntityLevel(level);
        if (data.bounds && Array.isArray(data.bounds) && data.bounds.length === 4) {
          var south = parseFloat(data.bounds[0]);
          var west = parseFloat(data.bounds[1]);
          var north = parseFloat(data.bounds[2]);
          var east = parseFloat(data.bounds[3]);
          if (isFinite(south) && isFinite(west) && isFinite(north) && isFinite(east)) {
            var bb = L.latLngBounds([south, west], [north, east]);
            if (bb.isValid()) {
              map.flyToBounds(bb, {
                paddingTopLeft: [48, 64],
                paddingBottomRight: [48, 48],
                maxZoom: zCap,
                duration: 0.55
              });
              if (String(level).toLowerCase() === 'city') {
                scheduleAfterMapFly(function () {
                  bumpMapZoomLevels(CITY_SELECT_EXTRA_ZOOM);
                });
              }
              return true;
            }
          }
        }
        var lat = parseFloat(data.lat);
        var lng = parseFloat(data.lng);
        if (!isFinite(lat) || !isFinite(lng)) {
          return false;
        }
        var ll = L.latLng(lat, lng);
        if (!bounds.contains(ll)) {
          return false;
        }
        var zz = data.zoom != null ? Number(data.zoom) : zCap;
        if (!isFinite(zz)) {
          zz = zCap;
        }
        zz = Math.max(minZ, Math.min(maxZ, zz));
        var pad = String(level).toLowerCase() === 'street' ? 0.012 : 0.022;
        var ptBb = L.latLngBounds([lat - pad, lng - pad], [lat + pad, lng + pad]);
        map.flyToBounds(ptBb, {
          paddingTopLeft: [48, 64],
          paddingBottomRight: [48, 48],
          maxZoom: zCap,
          duration: 0.55
        });
        if (String(level).toLowerCase() === 'city') {
          scheduleAfterMapFly(function () {
            bumpMapZoomLevels(CITY_SELECT_EXTRA_ZOOM);
          });
        }
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function clearAddressMarker() {
    if (marker) {
      map.removeLayer(marker);
      marker = null;
    }
    if (latIn) {
      latIn.value = '';
    }
    if (lngIn) {
      lngIn.value = '';
    }
    if (readoutVals) {
      readoutVals.textContent = '— ، —';
    } else if (readout) {
      readout.textContent = '— ، —';
    }
  }

  function clearMapSelection() {
    if (state.selectedShabiyaLayer && state.shabiyatLayer && typeof state.shabiyatLayer.resetStyle === 'function') {
      state.shabiyatLayer.resetStyle(state.selectedShabiyaLayer);
    }
    state.selectedShabiyaLayer = null;
    state.lastShabiyaDetail = null;
    state.selectedPlace = null;
    state.userOverviewLocked = false;
    if (window.MapCore && typeof window.MapCore.restoreShabiyatLayerIfHidden === 'function') {
      window.MapCore.restoreShabiyatLayerIfHidden();
    }
    if (window.MapCore && typeof window.MapCore.clearCityPlaces === 'function') {
      window.MapCore.clearCityPlaces();
    }
    showApiMsg('', false);
    syncMarkerCtaReveal();
    updateWorldMask();
  }

  function prepareHierarchyChange(level) {
    if (readOnly) {
      return;
    }
    var lv = String(level || '').trim();
    if (lv === 'wilayah') {
      state.userOverviewLocked = false;
    }
    try {
      window.dispatchEvent(new Event('addr-map-clear-annotations'));
    } catch (eHc) {}
    if (window.MapCore && typeof window.MapCore.resetMapLayersForHierarchyChange === 'function') {
      if (lv === 'city') {
        window.MapCore.resetMapLayersForHierarchyChange({
          clearPlaces: true,
          resetShabiya: false,
          keepShabiyaDetail: true,
          clearSelectedPlace: true
        });
      } else if (lv === 'shabiya') {
        window.MapCore.resetMapLayersForHierarchyChange({
          clearPlaces: true,
          resetShabiya: true,
          keepShabiyaDetail: false,
          clearSelectedPlace: true
        });
      } else {
        window.MapCore.resetMapLayersForHierarchyChange({
          clearPlaces: true,
          resetShabiya: true,
          keepShabiyaDetail: false,
          clearSelectedPlace: true
        });
      }
    } else {
      clearMapSelection();
    }
    if (lv === 'wilayah' || lv === 'shabiya' || lv === 'city') {
      clearAddressMarker();
    }
    state.markerModePending = false;
    syncMarkerModeButton();
    syncMapCrosshairCursor();
    if (window.MapCore && typeof window.MapCore.resetDraw === 'function') {
      window.MapCore.resetDraw();
    }
    showApiMsg('', false);
    syncMarkerCtaReveal();
    updateWorldMask();
  }

  function flyToWilayahKey(wk) {
    if (readOnly || !map) {
      return;
    }
    state.userOverviewLocked = true;
    var prov = WILKEY_TO_PROV_FORM[wk];
    if (!prov) {
      return;
    }
    if (typeof map.stop === 'function') {
      map.stop();
    }
    var combined = null;
    if (state.shabiyatLayer) {
      state.shabiyatLayer.eachLayer(function (layer) {
        var pr = layer.feature && layer.feature.properties && layer.feature.properties.province;
        if (String(pr || '') !== prov) {
          return;
        }
        try {
          var lb = layer.getBounds();
          if (lb && lb.isValid()) {
            combined = combined ? combined.extend(lb) : lb;
          }
        } catch (eL) {}
      });
    }
    if (combined && combined.isValid()) {
      map.flyToBounds(combined, {
        paddingTopLeft: [48, 80],
        paddingBottomRight: [48, 48],
        maxZoom: Math.min(maxZ, 9),
        duration: 0.55
      });
      return;
    }
    var latLngs = [];
    for (var ri = 0; ri < regions.length; ri++) {
      var reg = regions[ri];
      if (reg && String(reg.province || '') === prov && typeof reg.lat === 'number' && typeof reg.lng === 'number') {
        latLngs.push([reg.lat, reg.lng]);
      }
    }
    if (latLngs.length === 1) {
      map.flyTo(latLngs[0], Math.min(maxZ, 8), { duration: 0.55 });
      return;
    }
    if (latLngs.length > 1) {
      var bb = L.latLngBounds(latLngs);
      map.flyToBounds(bb.pad(0.22), {
        paddingTopLeft: [48, 80],
        paddingBottomRight: [48, 48],
        maxZoom: Math.min(maxZ, 8),
        duration: 0.55
      });
    }
  }

  function syncMarkerModeButton() {
    var btn = document.getElementById('btn-place-marker-toggle');
    if (!btn) {
      return;
    }
    btn.classList.toggle('is-active', state.markerModePending);
    btn.setAttribute('aria-pressed', state.markerModePending ? 'true' : 'false');
    syncMapCrosshairCursor();
  }

  var MARKER_CTA_MIN_ZOOM = 13;

  function ensureMapZoomPill() {
    var wrap = document.querySelector('.map-canvas-wrap--mgr');
    if (!wrap || document.getElementById('addr-map-zoom-pill')) {
      return;
    }
    var pill = document.createElement('button');
    pill.type = 'button';
    pill.id = 'addr-map-zoom-pill';
    pill.className = 'addr-map-zoom-float addr-zoom-pill';
    pill.setAttribute('aria-live', 'polite');
    pill.setAttribute('aria-label', 'مستوى التكبير');
    pill.title = 'مستوى التكبير الحالي';
    pill.disabled = true;
    pill.tabIndex = -1;
    pill.textContent = '×—';
    wrap.appendChild(pill);
  }
  ensureMapZoomPill();

  function hasMarkerCtaShabiyaContext() {
    return !!(state.lastShabiyaDetail && String(state.lastShabiyaDetail.province || '').length);
  }
  function hasMarkerCtaCityAreaContext() {
    if (state.selectedPlace && String(state.selectedPlace.name || '').trim()) {
      return true;
    }
    var elI = document.getElementById('addr-city-area');
    if (elI && String(elI.value || '').trim()) {
      return true;
    }
    var neighEl = document.getElementById('addr-neighborhood');
    if (neighEl && String(neighEl.value || '').trim()) {
      return true;
    }
    if (state.focusedAreaId > 0 && state.focusedCityId > 0) {
      if (window.MapCore && typeof window.MapCore.isPilotPrimaryCityId === 'function') {
        return window.MapCore.isPilotPrimaryCityId(state.focusedCityId);
      }
    }
    return false;
  }

  function syncDashboardHud() {
    if (!map || typeof map.getZoom !== 'function') {
      return;
    }
    var z = map.getZoom();
    var zLbl = Number.isFinite(z) ? Math.round(z * 10) / 10 : z;
    var pill = document.getElementById('addr-map-zoom-pill');
    if (pill) {
      pill.textContent = typeof zLbl === 'number' ? '×' + zLbl : '×';
      pill.setAttribute('aria-label', typeof zLbl === 'number' ? 'مستوى التكبير: ' + zLbl : 'مستوى التكبير');
      pill.classList.toggle('addr-zoom-pill--threshold', z >= MARKER_CTA_MIN_ZOOM);
    }
    var flowRoot = document.getElementById('addr-map-flow');
    if (!flowRoot || readOnly) {
      return;
    }
    var s1 = hasMarkerCtaShabiyaContext();
    var s2 = hasMarkerCtaCityAreaContext();
    var s3 = z >= MARKER_CTA_MIN_ZOOM;
    var latInEl = document.getElementById('map-lat');
    var lngInEl = document.getElementById('map-lng');
    var coordsOk =
      latInEl && lngInEl &&
      String(latInEl.value || '').trim() !== '' &&
      String(lngInEl.value || '').trim() !== '';
    var s4 = coordsOk || !!state.markerModePending;
    var steps = flowRoot.querySelectorAll('.addr-map-flow__step');
    var predicates = [s1, s2, s3, s4];
    var foundCur = false;
    for (var fi = 0; fi < steps.length && fi < predicates.length; fi++) {
      var li = steps[fi];
      var done = predicates[fi];
      li.classList.remove('is-done', 'is-current', 'is-next');
      if (done) {
        li.classList.add('is-done');
      } else if (!foundCur) {
        li.classList.add('is-current');
        foundCur = true;
      } else {
        li.classList.add('is-next');
      }
    }
  }

  function syncMarkerCtaReveal() {
    syncDashboardHud();
    var wrap = document.getElementById('map-marker-cta-slot');
    var btnMt = document.getElementById('btn-place-marker-toggle');
    if (readOnly || !wrap || !btnMt || !map || typeof map.getZoom !== 'function') {
      return;
    }
    var z = map.getZoom();
    var eligible = hasMarkerCtaShabiyaContext() && hasMarkerCtaCityAreaContext() && z >= MARKER_CTA_MIN_ZOOM;
    if (
      state.pilotAreaPlacementActive &&
      state.focusedAreaId > 0 &&
      z >= MARKER_CTA_MIN_ZOOM &&
      window.MapCore &&
      typeof window.MapCore.isPilotPrimaryCityId === 'function' &&
      window.MapCore.isPilotPrimaryCityId(state.focusedCityId)
    ) {
      eligible = true;
    }
    wrap.hidden = !eligible;
    wrap.setAttribute('aria-hidden', eligible ? 'false' : 'true');
    var keepPilotAreaMarkerMode =
      state.markerModePending &&
      state.focusedAreaId > 0 &&
      window.MapCore &&
      typeof window.MapCore.isPilotPrimaryCityId === 'function' &&
      window.MapCore.isPilotPrimaryCityId(state.focusedCityId);
    if (!eligible && state.markerModePending && !keepPilotAreaMarkerMode && !hasMarkerCtaShabiyaContext()) {
      state.markerModePending = false;
      syncMarkerModeButton();
      syncMapCrosshairCursor();
    }
  }

  map.on('zoomend', syncMarkerCtaReveal);
  map.on('zoom zoomend move moveend', syncDashboardHud);

  var mapContainer = map.getContainer();
  mapContainer.setAttribute('tabindex', '0');
  mapContainer.addEventListener('mousedown', function () {
    mapContainer.focus({ preventScroll: true });
  });

  function isMapKeyboardTypingTarget(node) {
    if (!node) {
      return false;
    }
    if (node.isContentEditable) {
      return true;
    }
    var tag = (node.tagName || '').toLowerCase();
    if (tag === 'textarea') {
      return true;
    }
    if (tag === 'input') {
      var type = (node.type || 'text').toLowerCase();
      return (
        type === 'text' ||
        type === 'search' ||
        type === 'email' ||
        type === 'tel' ||
        type === 'url' ||
        type === 'password' ||
        type === 'number'
      );
    }
    return false;
  }

  function shouldBlockMapKeyboardShortcut(e) {
    var active = document.activeElement;
    if (isMapKeyboardTypingTarget(active) || isMapKeyboardTypingTarget(e.target)) {
      return true;
    }
    return false;
  }

  function shouldBlockMapPanShortcut(e) {
    if (shouldBlockMapKeyboardShortcut(e)) {
      return true;
    }
    var active = document.activeElement;
    var tag = active && active.tagName ? active.tagName.toLowerCase() : '';
    return tag === 'select';
  }

  function isMapZoomInKey(e) {
    return e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+';
  }

  function isMapZoomOutKey(e) {
    return e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-' || e.key === '_';
  }

  function isMapPanKey(e) {
    return (
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    );
  }

  var MAP_PAN_STEP_PX = 80;

  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }

    if (isMapPanKey(e)) {
      if (shouldBlockMapPanShortcut(e)) {
        return;
      }
      var dx = 0;
      var dy = 0;
      if (e.code === 'ArrowUp') {
        dy = -MAP_PAN_STEP_PX;
      } else if (e.code === 'ArrowDown') {
        dy = MAP_PAN_STEP_PX;
      } else if (e.code === 'ArrowLeft') {
        dx = -MAP_PAN_STEP_PX;
      } else if (e.code === 'ArrowRight') {
        dx = MAP_PAN_STEP_PX;
      }
      e.preventDefault();
      map.panBy([dx, dy]);
      return;
    }

    if (e.repeat || shouldBlockMapKeyboardShortcut(e)) {
      return;
    }
    var numpad = e.code === 'NumpadAdd' || e.code === 'NumpadSubtract';
    var shiftCombo = e.shiftKey;
    if (!shiftCombo && !numpad) {
      return;
    }
    if (isMapZoomInKey(e)) {
      e.preventDefault();
      map.zoomIn();
    } else if (isMapZoomOutKey(e)) {
      e.preventDefault();
      map.zoomOut();
    }
  }, true);

  /* Coordinate readout + capture */
  function setFields(lat, lng) {
    if (latIn) {
      latIn.value = lat.toFixed(7);
    }
    if (lngIn) {
      lngIn.value = lng.toFixed(7);
    }
    if (readoutVals) {
      readoutVals.textContent = lat.toFixed(6) + ' ، ' + lng.toFixed(6);
    } else if (readout) {
      readout.textContent = lat.toFixed(6) + ' ، ' + lng.toFixed(6);
    }
  }

  function setReadoutFromEvent(e) {
    if (!e || !e.latlng) {
      return;
    }
    var ll = e.latlng;
    if (!bounds.contains(ll)) {
      if (readoutVals) {
        readoutVals.textContent = '— ، —';
      } else if (readout) {
        readout.textContent = '— ، —';
      }
      return;
    }
    if (readoutVals) {
      readoutVals.textContent = ll.lat.toFixed(6) + ' ، ' + ll.lng.toFixed(6);
    } else if (readout) {
      readout.textContent = ll.lat.toFixed(6) + ' ، ' + ll.lng.toFixed(6);
    }
  }

  map.on('mousemove', setReadoutFromEvent);

  function reverseGeocodeNeighborhood(lat, lng) {
    if (!allowRemoteTiles || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return;
    }
    var url =
      'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
      encodeURIComponent(lat) +
      '&lon=' +
      encodeURIComponent(lng) +
      '&accept-language=ar&zoom=18&addressdetails=1';
    fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'ar',
        'User-Agent': 'LibyaPostalAddr/1.0 (internal demo)'
      }
    })
      .then(function (r) {
        if (!r.ok) {
          throw new Error('nom ' + r.status);
        }
        return r.json();
      })
      .then(function (data) {
        var ad = (data && data.address) || {};
        var neigh = ad.neighbourhood || ad.suburb || ad.quarter || ad.hamlet || ad.village || '';
        if (neigh) {
          window.dispatchEvent(
            new CustomEvent('addr-neighborhood-fill', { detail: { neighborhood: String(neigh) } })
          );
        }
      })
      .catch(function () {});
  }

  function focusViewOnAddressPin(ll) {
    if (!map || !ll || !bounds.contains(ll)) {
      return;
    }
    if (typeof map.stop === 'function') {
      map.stop();
    }
    var curZ = typeof map.getZoom === 'function' ? map.getZoom() : MARKER_CTA_MIN_ZOOM;
    var floorZ = Math.max(MARKER_CTA_MIN_ZOOM + 1, 15);
    var z = Math.min(maxZ, Math.max(curZ, floorZ));
    map.flyTo(ll, z, { duration: 0.42, easeLinearity: 0.25 });
  }

  function bindAddressMarkerInteraction(m) {
    if (!m || typeof m.on !== 'function') {
      return;
    }
    m._libyaAddrPinClick = function (e) {
      if (L && L.DomEvent) { L.DomEvent.stopPropagation(e); }
      if (e && e.originalEvent && L && L.DomEvent) { L.DomEvent.stop(e.originalEvent); }
      focusViewOnAddressPin(m.getLatLng());
    };
    m._libyaAddrPinDbl = function (e) {
      if (L && L.DomEvent) { L.DomEvent.stopPropagation(e); }
      if (e && e.originalEvent && L && L.DomEvent) { L.DomEvent.stop(e.originalEvent); }
    };
    m.on('click', m._libyaAddrPinClick);
    m.on('dblclick', m._libyaAddrPinDbl);
    if (!readOnly && m.options && m.options.draggable) {
      m._libyaAddrPinDragEnd = function (ev) {
        var llx = ev.target.getLatLng();
        if (!bounds.contains(llx)) {
          return;
        }
        setFields(llx.lat, llx.lng);
        reverseGeocodeNeighborhood(llx.lat, llx.lng);
        syncMarkerCtaReveal();
        try {
          window.dispatchEvent(
            new CustomEvent('addr-address-marker-placed', { detail: { lat: llx.lat, lng: llx.lng } })
          );
        } catch (eDrag) {}
      };
      m.on('dragend', m._libyaAddrPinDragEnd);
    }
  }

  function makeAddressMarker(ll) {
    var m = L.marker(ll, {
      keyboard: false,
      draggable: !readOnly,
      zIndexOffset: 1400,
      icon: createAddressPinIcon()
    }).addTo(map);
    bindAddressMarkerInteraction(m);
    return m;
  }

  function placeAddressMarker(ll) {
    if (map && typeof map.stop === 'function') {
      map.stop();
    }
    if (marker) {
      map.removeLayer(marker);
    }
    marker = makeAddressMarker(ll);
    setFields(ll.lat, ll.lng);
    if (!state.lastShabiyaDetail || !state.lastShabiyaDetail.province) {
      var nr0 = nearestRegion(ll.lat, ll.lng);
      if (nr0) {
        window.dispatchEvent(
          new CustomEvent('addr-map-fill', {
            detail: {
              province: nr0.province,
              area: nr0.n,
              city: nr0.city != null ? nr0.city : 1,
              sector: 'S',
              place: nr0.name || '',
              code: nr0.code || ''
            }
          })
        );
      }
    }
    if (state.selectedPlace && state.selectedPlace.name) {
      var cityFieldEl = document.getElementById('addr-city-area');
      var cityFieldVal = cityFieldEl ? String(cityFieldEl.value || '').trim() : '';
      if (!cityFieldVal) {
        window.dispatchEvent(
          new CustomEvent('addr-map-fill', { detail: { level: 'city', place: state.selectedPlace.name } })
        );
      }
    }
    reverseGeocodeNeighborhood(ll.lat, ll.lng);
    syncMarkerCtaReveal();
    try {
      window.dispatchEvent(
        new CustomEvent('addr-address-marker-placed', { detail: { lat: ll.lat, lng: ll.lng } })
      );
    } catch (ePlace) {}
    if (window.MapCore && typeof window.MapCore.syncBoundaryLabelsForAddressScene === 'function') {
      window.MapCore.syncBoundaryLabelsForAddressScene();
    }
    if (window.MapCore && typeof window.MapCore.applyBoundariesLayerVisibility === 'function') {
      window.MapCore.applyBoundariesLayerVisibility();
    }
  }

  var addressPlacementUiBound = false;

  function syncMapCrosshairCursor() {
    var container = map && typeof map.getContainer === 'function' ? map.getContainer() : null;
    if (container) {
      var crosshairActive = !!state.markerModePending || state.drawMode === 'parcel';
      container.classList.toggle('map-canvas--crosshair-mode', crosshairActive);
    }
  }

  function onMapClickForAddressPlacement(e) {
    var ll = e && e.latlng;
    if (!ll || !bounds.contains(ll)) {
      return;
    }
    if (readOnly) {
      if (readoutVals) {
        readoutVals.textContent = ll.lat.toFixed(6) + ' ، ' + ll.lng.toFixed(6);
      } else if (readout) {
        readout.textContent = ll.lat.toFixed(6) + ' ، ' + ll.lng.toFixed(6);
      }
      return;
    }
    if (typeof state.drawClickHandler === 'function' && state.drawClickHandler(ll)) {
      return;
    }
    if (state.markerModePending) {
      if (map && typeof map.stop === 'function') {
        map.stop();
      }
      placeAddressMarker(ll);
      state.markerModePending = false;
      syncMarkerModeButton();
      syncMapCrosshairCursor();
      syncMarkerCtaReveal();
    }
  }

  function onMarkerToggleButtonClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) {
        e.stopImmediatePropagation();
      }
    }
    if (readOnly) {
      return;
    }
    state.markerModePending = !state.markerModePending;
    syncMarkerModeButton();
    if (state.markerModePending) {
      if (window.MapCore && typeof window.MapCore.hideBoundariesForAddressPick === 'function') {
        window.MapCore.hideBoundariesForAddressPick();
      }
      var wrapOn = document.getElementById('map-marker-cta-slot');
      if (wrapOn) {
        wrapOn.hidden = false;
        wrapOn.setAttribute('aria-hidden', 'false');
      }
      showApiMsg('انقر على الخريطة لوضع علامة الموقع', false);
      scheduleAutoHide(3600);
      syncDashboardHud();
      return;
    }
    showApiMsg('', false);
    if (
      !state.pilotAreaPlacementActive &&
      window.MapCore &&
      typeof window.MapCore.restoreBoundariesLayerPreference === 'function'
    ) {
      window.MapCore.restoreBoundariesLayerPreference();
    }
    syncMarkerCtaReveal();
  }

  function bindAddressPlacementUi() {
    if (readOnly || !map) {
      return;
    }
    if (!addressPlacementUiBound) {
      addressPlacementUiBound = true;
      map.on('click', onMapClickForAddressPlacement);
    }
    var btnMk = document.getElementById('btn-place-marker-toggle');
    if (btnMk && !btnMk._addrMarkerClickBound) {
      btnMk._addrMarkerClickBound = true;
      btnMk.addEventListener('click', onMarkerToggleButtonClick);
      btnMk.addEventListener('mousedown', function (ev) {
        ev.stopPropagation();
      });
    }
  }

  bindAddressPlacementUi();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAddressPlacementUi);
  }

  function bindLateMapUi() {
    bindAddressPlacementUi();

    if (!isNaN(ilat) && !isNaN(ilng) && bounds.contains(L.latLng(ilat, ilng))) {
      marker = makeAddressMarker([ilat, ilng]);
      setFields(ilat, ilng);
      map.setView(
        [ilat, ilng],
        Math.max(minZ, Math.min(maxZ, isFinite(defaultInitZoom) ? defaultInitZoom : 12)),
        { animate: false }
      );
    }

    window.addEventListener('addr-marker-cta-refresh', syncMarkerCtaReveal);
    var addrCityAreaMkEl = document.getElementById('addr-city-area');
    if (addrCityAreaMkEl) {
      addrCityAreaMkEl.addEventListener('input', syncMarkerCtaReveal);
      addrCityAreaMkEl.addEventListener('change', syncMarkerCtaReveal);
    }

    var wrapEl = typeof el.closest === 'function' ? el.closest('.map-canvas-wrap') : null;
    var roFitTimer = null;
    var winFitTimer = null;
    var lastWrapW = 0;
    var lastWrapH = 0;
    if (wrapEl && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function (entries) {
        var entry = entries && entries[0];
        var rect = entry && entry.contentRect;
        if (rect) {
          var dw = Math.abs(rect.width - lastWrapW);
          var dh = Math.abs(rect.height - lastWrapH);
          if (dw < 3 && dh < 3) {
            return;
          }
          lastWrapW = rect.width;
          lastWrapH = rect.height;
        }
        clearTimeout(roFitTimer);
        roFitTimer = setTimeout(function () {
          map.invalidateSize(false);
          refreshMapMaskForView();
          updateMapClipOverlays();
        }, 120);
      }).observe(wrapEl);
    }
    window.addEventListener(
      'resize',
      function () {
        clearTimeout(winFitTimer);
        winFitTimer = setTimeout(function () {
          map.invalidateSize(false);
          refreshMapMaskForView();
          updateMapClipOverlays();
        }, 180);
      },
      false
    );

    syncBaseLayerUi();
    syncMarkerCtaReveal();

    /* Reset / new-scene events */
  }
  try {
    bindLateMapUi();
  } catch (eLateUi) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('bindLateMapUi', eLateUi);
    }
  }

    window.addEventListener('addr-map-reset', function () {
    if (readOnly) {
      return;
    }
    resetMapToCleanState();
    fitFullLibyaInView({ force: true, animate: false });
  });

  var EXPORT_CANVAS_SCALE = 2;
  var EXPORT_TILE_WAIT_MS = 350;

  function waitForExportReady(mapRef, ms) {
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) {
          return;
        }
        done = true;
        resolve();
      }
      if (mapRef && typeof mapRef.once === 'function') {
        mapRef.once('moveend', finish);
      }
      setTimeout(finish, ms != null ? ms : EXPORT_TILE_WAIT_MS);
    });
  }

  function paintLeafletTilesOnCanvas(ctx, mapRef, scale) {
    var container = mapRef.getContainer();
    var pane = mapRef.getPane('tilePane');
    if (!ctx || !container || !pane) {
      return 0;
    }
    var mapRect = container.getBoundingClientRect();
    var imgs = pane.querySelectorAll('img.leaflet-tile');
    var drawn = 0;
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!img || !img.src || !img.complete || !img.naturalWidth) {
        continue;
      }
      var r = img.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        continue;
      }
      var x = (r.left - mapRect.left) * scale;
      var y = (r.top - mapRect.top) * scale;
      try {
        ctx.drawImage(img, x, y, r.width * scale, r.height * scale);
        drawn += 1;
      } catch (tileErr) {}
    }
    return drawn;
  }

  function paintPostalLabelsOnCanvas(ctx, mapRef, scale) {
    var regions = window.MapCore && window.MapCore.regions ? window.MapCore.regions : [];
    var paintFn =
      window.MapCore && typeof window.MapCore.paintBoundaryLabelOnCanvas === 'function'
        ? window.MapCore.paintBoundaryLabelOnCanvas
        : null;
    if (!ctx || !mapRef || !paintFn || !regions.length) {
      return;
    }
    var viewBounds = typeof mapRef.getBounds === 'function' ? mapRef.getBounds() : null;
    var resolvePos =
      window.MapCore && typeof window.MapCore.getRegionLabelPosition === 'function'
        ? window.MapCore.getRegionLabelPosition
        : null;
    for (var i = 0; i < regions.length; i++) {
      var lb = regions[i];
      var code = lb.code || (lb.province && lb.n ? lb.province + lb.n : '');
      var pos = resolvePos ? resolvePos(lb) : null;
      if (!pos && typeof lb.lat === 'number' && typeof lb.lng === 'number') {
        pos = { lat: lb.lat, lng: lb.lng };
      }
      if (!code || !pos) {
        continue;
      }
      var ll = L.latLng(pos.lat, pos.lng);
      if (viewBounds && !viewBounds.contains(ll)) {
        continue;
      }
      paintFn(ctx, mapRef, scale, String(code), ll, false);
    }
  }

  function buildMapExportCanvas(mapRef, scale, payload) {
    scale = scale || 1;
    var size = mapRef.getSize();
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(size.x * scale));
    canvas.height = Math.max(1, Math.round(size.y * scale));
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('canvas');
    }
    ctx.fillStyle = '#01030a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paintLeafletTilesOnCanvas(ctx, mapRef, scale);
    var opts = payload && payload.opts ? payload.opts : {};
    if (window.MapCore && typeof window.MapCore.compositeMapExportCanvasSync === 'function') {
      window.MapCore.compositeMapExportCanvasSync(canvas, mapRef, scale, payload);
    }
    if (opts.includePostalLabels !== false) {
      paintPostalLabelsOnCanvas(ctx, mapRef, scale);
    }
    return canvas;
  }

  function beginMapExport() {
    var restoreFns = [];

    if (marker && map.hasLayer(marker)) {
      map.removeLayer(marker);
      restoreFns.push(function () {
        marker.addTo(map);
      });
    }

    if (map.zoomControl) {
      map.removeControl(map.zoomControl);
      restoreFns.push(function () {
        map.addControl(map.zoomControl);
      });
    }

    if (map.attributionControl) {
      map.removeControl(map.attributionControl);
      restoreFns.push(function () {
        map.addControl(map.attributionControl);
      });
    }

    return function restoreMapExport() {
      for (var i = restoreFns.length - 1; i >= 0; i--) {
        try {
          restoreFns[i]();
        } catch (exportRestoreErr) {}
      }
      map.invalidateSize(false);
    };
  }

  function resolveExportSnapshot() {
    if (window.MapCore && typeof window.MapCore.captureFullExportSnapshot === 'function') {
      return Promise.resolve(window.MapCore.captureFullExportSnapshot());
    }
    if (window.MapCore && typeof window.MapCore.resolveExportBoundarySnapshot === 'function') {
      return window.MapCore.resolveExportBoundarySnapshot();
    }
    return Promise.resolve({ items: [], opts: {} });
  }

  function exportPng() {
    if (!map || typeof map.getSize !== 'function') {
      return Promise.reject(new Error('map'));
    }

    var savedCenter = map.getCenter();
    var savedZoom = map.getZoom();
    var exportPayload = null;

    return resolveExportSnapshot()
      .then(function (payload) {
        exportPayload = payload || { items: [], opts: {} };
        var restoreMapExport = beginMapExport();
        return waitForExportReady(map, EXPORT_TILE_WAIT_MS)
          .then(function () {
            var canvas = buildMapExportCanvas(map, EXPORT_CANVAS_SCALE, exportPayload);
            var a = document.createElement('a');
            a.download = 'libya-map-export.png';
            a.href = canvas.toDataURL('image/png');
            a.click();
          })
          .finally(function () {
            restoreMapExport();
            map.setView(savedCenter, savedZoom, { animate: false });
          });
      });
  }

})();
