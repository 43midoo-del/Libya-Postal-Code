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
  var readOnly = root.dataset.readOnly === '1';
  var skipNeighborBoundaryTiles = root.dataset.skipNeighborBoundaries === '1';

  var map = L.map('map', {
    maxBounds: bounds,
    maxBoundsViscosity: 1.0,
    minZoom: minZ,
    maxZoom: maxZ
  });

  var ilat = parseFloat(root.dataset.initialLat || '');
  var ilng = parseFloat(root.dataset.initialLng || '');
  var skipAutoOverviewFit =
    readOnly && !isNaN(ilat) && !isNaN(ilng) && bounds.contains(L.latLng(ilat, ilng));

  var marker = null;

  /* Shared "module-scope" state — exposed on window.MapCore for sibling modules. */
  var state = {
    markerModePending: false,
    selectedPlace: null,
    lastShabiyaDetail: null,
    shabiyatLayer: null,
    selectedShabiyaLayer: null,
    cityPlacesLayer: null,
    cityBoundariesLayer: null,
    cityPlaceByName: {},
    drawMode: 'none',
    drawClickHandler: null
  };

  function hasUserAnchoredMapCoords() {
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

  function fitFullLibyaInView(opts) {
    var o = opts || {};
    if (skipAutoOverviewFit && !o.force) {
      return;
    }
    map.invalidateSize(false);
    map.fitBounds(bounds, {
      padding: o.padding || [30, 40],
      animate: !!o.animate,
      maxZoom: maxZ
    });
  }

  var tileBaseOpts = {
    maxZoom: maxZ,
    maxNativeZoom: 19,
    bounds: bounds,
    noWrap: true
  };

  var osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
  var esriAttribution = '&copy; Esri, Maxar, Earthstar Geographics';
  var esriRefAttribution = '&copy; Esri — Boundaries, Places & Transportation';

  var osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    Object.assign({ attribution: osmAttribution }, tileBaseOpts)
  );
  var satLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    Object.assign({ attribution: esriAttribution }, tileBaseOpts)
  );
  /* Offline base layer — backed by the local MBTiles file (Phase 1).
   * When a tile is missing it returns 204 and the SW falls back automatically. */
  var offlineLayer = L.tileLayer(
    'index.php?r=tile&z={z}&x={x}&y={y}',
    Object.assign({ attribution: 'Libya Postal (offline) / OSM', maxNativeZoom: 18 }, tileBaseOpts)
  );

  var currentBaseKind = root.dataset.satellite === '1' ? 'sat' : 'osm';
  var labelsOverlayWanted = false;

  map.createPane('labelsTilesPane');
  map.getPane('labelsTilesPane').style.zIndex = 350;
  map.getPane('labelsTilesPane').style.pointerEvents = 'none';

  var labelsOverlayOpts = Object.assign({}, tileBaseOpts, {
    pane: 'labelsTilesPane',
    attribution: esriRefAttribution,
    opacity: 0.95
  });

  var refBoundariesLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    labelsOverlayOpts
  );
  var refTransportLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    labelsOverlayOpts
  );

  function labelsOverlayShouldBeOn() {
    return currentBaseKind === 'sat' && labelsOverlayWanted;
  }

  function applyLabelsOverlay() {
    var on = labelsOverlayShouldBeOn();
    if (on) {
      if (skipNeighborBoundaryTiles) {
        if (map.hasLayer(refBoundariesLayer)) {
          map.removeLayer(refBoundariesLayer);
        }
        if (!map.hasLayer(refTransportLayer)) {
          refTransportLayer.addTo(map);
        }
      } else {
        if (!map.hasLayer(refBoundariesLayer)) {
          refBoundariesLayer.addTo(map);
        }
        if (!map.hasLayer(refTransportLayer)) {
          refTransportLayer.addTo(map);
        }
      }
    } else {
      if (map.hasLayer(refBoundariesLayer)) {
        map.removeLayer(refBoundariesLayer);
      }
      if (map.hasLayer(refTransportLayer)) {
        map.removeLayer(refTransportLayer);
      }
    }
    syncLabelsOverlayUi();
  }

  function syncLabelsOverlayUi() {
    var btn = document.getElementById('addr-map-btn-labels');
    if (!btn) {
      return;
    }
    var on = labelsOverlayShouldBeOn();
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.disabled = currentBaseKind !== 'sat';
    btn.title = currentBaseKind === 'sat'
      ? (on ? 'إخفاء الطرق والأسماء' : 'إظهار الطرق والأسماء')
      : 'الطبقة مفعّلة فقط مع طبقة الأقمار';
  }

  function syncBaseLayerUi() {
    var satActive = map.hasLayer(satLayer);
    var bs = document.getElementById('addr-map-btn-sat');
    var bo = document.getElementById('addr-map-btn-osm');
    if (bs) {
      bs.classList.toggle('is-active', satActive);
      bs.setAttribute('aria-pressed', satActive ? 'true' : 'false');
    }
    if (bo) {
      bo.classList.toggle('is-active', !satActive);
      bo.setAttribute('aria-pressed', !satActive ? 'true' : 'false');
    }
    syncLabelsOverlayUi();
  }

  function setBaseLayer(kind) {
    if (kind !== 'sat' && kind !== 'osm') {
      return;
    }
    currentBaseKind = kind;
    if (kind === 'sat') {
      if (map.hasLayer(osmLayer)) {
        map.removeLayer(osmLayer);
      }
      if (!map.hasLayer(satLayer)) {
        satLayer.addTo(map);
      }
    } else {
      if (map.hasLayer(satLayer)) {
        map.removeLayer(satLayer);
      }
      if (!map.hasLayer(osmLayer)) {
        osmLayer.addTo(map);
      }
    }
    applyLabelsOverlay();
    syncBaseLayerUi();
    map.invalidateSize(false);
    if (typeof satLayer.redraw === 'function') {
      satLayer.redraw();
    }
    if (typeof osmLayer.redraw === 'function') {
      osmLayer.redraw();
    }
  }

  function toggleLabelsOverlay() {
    if (currentBaseKind !== 'sat') {
      return;
    }
    labelsOverlayWanted = !labelsOverlayWanted;
    applyLabelsOverlay();
  }

  function wireBaseLayerButtons() {
    var bs = document.getElementById('addr-map-btn-sat');
    var bo = document.getElementById('addr-map-btn-osm');
    var bl = document.getElementById('addr-map-btn-labels');
    var bf = document.getElementById('addr-map-btn-fit');
    if (bs) {
      bs.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setBaseLayer('sat');
      });
    }
    if (bo) {
      bo.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setBaseLayer('osm');
      });
    }
    if (bl) {
      bl.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleLabelsOverlay();
      });
    }
    if (bf) {
      bf.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        fitLibya();
      });
    }
  }
  wireBaseLayerButtons();

  if (currentBaseKind === 'sat') {
    satLayer.addTo(map);
  } else {
    osmLayer.addTo(map);
  }
  applyLabelsOverlay();
  syncBaseLayerUi();

  map.whenReady(function () {
    syncBaseLayerUi();
    fitFullLibyaInView({ animate: false });
    var refit = function () {
      fitFullLibyaInView({ animate: false });
      syncBaseLayerUi();
    };
    setTimeout(refit, 40);
    setTimeout(refit, 200);
    setTimeout(refit, 520);
  });

  map.createPane('maskPane');
  map.getPane('maskPane').style.zIndex = 430;
  map.createPane('starsPane');
  map.getPane('starsPane').style.zIndex = 445;
  map.getPane('starsPane').style.pointerEvents = 'none';
  map.createPane('shabiyatPane');
  map.getPane('shabiyatPane').style.zIndex = 460;
  map.createPane('cityBoundPane');
  map.getPane('cityBoundPane').style.zIndex = 462;
  map.createPane('cityPane');
  map.getPane('cityPane').style.zIndex = 465;
  map.createPane('postalLabels');
  map.getPane('postalLabels').style.zIndex = 480;

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

  function applyMaskHoleOnly(innerLatLngRing) {
    var outer = [
      [85, -180],
      [85, 180],
      [-85, 180],
      [-85, -180]
    ];
    if (worldMaskLayer) {
      try {
        map.removeLayer(worldMaskLayer);
      } catch (eRm) {}
      worldMaskLayer = null;
    }
    worldMaskLayer = L.polygon([outer, innerLatLngRing], {
      stroke: false,
      fillColor: '#02060f',
      fillOpacity: 1,
      fillRule: 'evenodd',
      interactive: false,
      pane: 'maskPane'
    }).addTo(map);
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
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
      pane: 'maskPane'
    }).addTo(map);
    libyaOutlineLayer = L.polyline(innerLatLngRing, {
      color: '#fbbf24',
      weight: 1.4,
      opacity: 0.9,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
      pane: 'maskPane'
    }).addTo(map);
  }

  function setWorldMask(innerLatLngRing) {
    applyMaskHoleOnly(innerLatLngRing);
    applyLibyaDecorations(innerLatLngRing);
  }

  function fitLibya() {
    try {
      var u = new URL(window.location.href);
      var route = u.searchParams.get('r') || '';
      if (route === 'address_edit') {
        var eid = u.searchParams.get('id');
        window.location.href = eid
          ? 'index.php?r=address_edit&id=' + encodeURIComponent(eid)
          : 'index.php?r=address_edit';
        return;
      }
      window.location.href = 'index.php?r=address_new';
      return;
    } catch (_) {
      window.location.href = 'index.php?r=address_new';
    }
  }

  function resolveMaskUrl(u) {
    if (!u) {
      return '';
    }
    if (/^https?:\/\//i.test(u)) {
      return u;
    }
    try {
      return new URL(u, window.location.href).toString();
    } catch (eU) {
      return u;
    }
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

  setWorldMask(boundsToLatLngRing(bounds));

  var maskUrl = root.dataset.maskUrl || '';
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
        applyMaskHoleOnly(boundsToLatLngRing(bounds));
        applyLibyaDecorations(inner);
      })
      .catch(function () {});
  }

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
    if (lv === 'street') { return Math.min(maxZ, 16); }
    if (lv === 'area') { return Math.min(maxZ, 15); }
    if (lv === 'city') { return Math.min(maxZ, 13); }
    return Math.min(maxZ, 12);
  }

  function flyToEntityLocation(level, entityId) {
    if (readOnly || !map || !level || !entityId) {
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
                paddingTopLeft: [56, 92],
                paddingBottomRight: [56, 56],
                maxZoom: zCap,
                duration: 0.55
              });
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
          paddingTopLeft: [56, 92],
          paddingBottomRight: [56, 56],
          maxZoom: zCap,
          duration: 0.55
        });
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
    if (window.MapCore && typeof window.MapCore.clearCityPlaces === 'function') {
      window.MapCore.clearCityPlaces();
    }
    showApiMsg('', false);
    syncMarkerCtaReveal();
  }

  function prepareHierarchyChange(level) {
    if (readOnly) {
      return;
    }
    var lv = String(level || '').trim();
    try {
      window.dispatchEvent(new Event('addr-map-clear-annotations'));
    } catch (eHc) {}
    if (window.MapCore && typeof window.MapCore.resetMapLayersForHierarchyChange === 'function') {
      if (lv === 'city') {
        window.MapCore.resetMapLayersForHierarchyChange({
          clearPlaces: false,
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
    if (window.MapCore && typeof window.MapCore.resetDraw === 'function') {
      window.MapCore.resetDraw();
    }
    showApiMsg('', false);
    syncMarkerCtaReveal();
  }

  function flyToWilayahKey(wk) {
    if (readOnly || !map) {
      return;
    }
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
  }

  var MARKER_CTA_MIN_ZOOM = 13;

  function hasMarkerCtaShabiyaContext() {
    return !!(state.lastShabiyaDetail && String(state.lastShabiyaDetail.province || '').length);
  }
  function hasMarkerCtaCityAreaContext() {
    if (state.selectedPlace && String(state.selectedPlace.name || '').trim()) {
      return true;
    }
    var elI = document.getElementById('addr-city-area');
    return !!(elI && String(elI.value || '').trim());
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
    wrap.hidden = !eligible;
    wrap.setAttribute('aria-hidden', eligible ? 'false' : 'true');
    if (!eligible && state.markerModePending) {
      state.markerModePending = false;
      syncMarkerModeButton();
    }
  }

  map.on('zoomend', syncMarkerCtaReveal);

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
      };
      m.on('dragend', m._libyaAddrPinDragEnd);
    }
  }

  function makeAddressMarker(ll) {
    var m = L.marker(ll, {
      keyboard: false,
      draggable: !readOnly,
      zIndexOffset: 1400
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
      window.dispatchEvent(
        new CustomEvent('addr-map-fill', { detail: { level: 'city', place: state.selectedPlace.name } })
      );
    }
    reverseGeocodeNeighborhood(ll.lat, ll.lng);
    syncMarkerCtaReveal();
  }

  /* Top-level click dispatcher: delegates to parcel draw or address marker placement. */
  map.on('click', function (e) {
    var ll = e.latlng;
    if (!bounds.contains(ll)) {
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
      syncMarkerCtaReveal();
    }
  });

  if (!isNaN(ilat) && !isNaN(ilng) && bounds.contains(L.latLng(ilat, ilng))) {
    marker = makeAddressMarker([ilat, ilng]);
    setFields(ilat, ilng);
    map.setView([ilat, ilng], Math.max(minZ, Math.min(maxZ, 12)), { animate: false });
  }

  var btnMk = document.getElementById('btn-place-marker-toggle');
  if (btnMk && !readOnly) {
    btnMk.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      state.markerModePending = !state.markerModePending;
      syncMarkerModeButton();
    });
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
  if (wrapEl && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () {
      if (skipAutoOverviewFit || hasUserAnchoredMapCoords()) {
        map.invalidateSize(false);
        return;
      }
      clearTimeout(roFitTimer);
      roFitTimer = setTimeout(function () {
        fitFullLibyaInView({ animate: false });
      }, 120);
    }).observe(wrapEl);
  }
  window.addEventListener(
    'resize',
    function () {
      if (skipAutoOverviewFit || hasUserAnchoredMapCoords()) {
        clearTimeout(winFitTimer);
        winFitTimer = setTimeout(function () { map.invalidateSize(false); }, 220);
        return;
      }
      clearTimeout(winFitTimer);
      winFitTimer = setTimeout(function () { fitFullLibyaInView({ animate: false }); }, 220);
    },
    false
  );

  fitFullLibyaInView({ animate: false });
  syncBaseLayerUi();
  syncMarkerCtaReveal();

  /* Reset / new-scene events */
  window.addEventListener('addr-map-reset', function () {
    if (readOnly) {
      return;
    }
    clearMapSelection();
    state.markerModePending = false;
    syncMarkerModeButton();
    if (marker) {
      map.removeLayer(marker);
      marker = null;
    }
    if (latIn) { latIn.value = ''; }
    if (lngIn) { lngIn.value = ''; }
    if (readoutVals) {
      readoutVals.textContent = '— ، —';
    } else if (readout) {
      readout.textContent = '— ، —';
    }
    if (window.MapCore && typeof window.MapCore.resetDraw === 'function') {
      window.MapCore.resetDraw();
    }
    fitFullLibyaInView({ animate: false });
  });

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
    placeAddressMarker: placeAddressMarker,
    setFields: setFields,
    syncMarkerModeButton: syncMarkerModeButton,
    syncMarkerCtaReveal: syncMarkerCtaReveal,
    syncDashboardHud: syncDashboardHud,
    showApiMsg: showApiMsg,
    scheduleApiMsgAutoHide: scheduleAutoHide,
    clearAddrApiMsgHideTimer: clearAddrApiMsgHideTimer,
    flyToPlace: flyToPlace,
    flyToEntityLocation: flyToEntityLocation,
    flyToWilayahKey: flyToWilayahKey,
    clearMapSelection: clearMapSelection,
    fitLibya: fitLibya,
    setBaseLayer: setBaseLayer,
    toggleLabelsOverlay: toggleLabelsOverlay,
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
    showCityBoundaryOnly: function (cityId, regionId) {
      if (window.MapCore && typeof window.MapCore.showCityBoundaryOnly === 'function') {
        window.MapCore.showCityBoundaryOnly(cityId, regionId);
      }
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
    flyToLoadedCityPlace: function (name) {
      if (readOnly || !name) {
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
      syncMarkerCtaReveal();
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
    fitLibya: fitLibya,
    toggleLabelsOverlay: toggleLabelsOverlay,
    exportPng: function () {
      var wrap = document.querySelector('.map-canvas-wrap--mgr');
      if (!wrap || typeof html2canvas === 'undefined') {
        return Promise.reject(new Error('html2canvas'));
      }
      return html2canvas(wrap, {
        useCORS: true,
        allowTaint: true,
        scale: 1,
        logging: false
      }).then(function (canvas) {
        var a = document.createElement('a');
        a.download = 'libya-map-export.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
      });
    }
  };
})();
