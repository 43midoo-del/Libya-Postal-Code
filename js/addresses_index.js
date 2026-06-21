/**
 * Addresses list page: wilayah→shabiya filter linkage, results map, delete confirm.
 */
(function () {
  'use strict';

  function syncShabiyaOptions() {
    var w = document.getElementById('addr-wilayah');
    var s = document.getElementById('addr-shabiya');
    if (!w || !s) {
      return;
    }
    var apply = function () {
      var key = w.value;
      var current = s.value;
      var stillVisible = false;
      for (var i = 0; i < s.options.length; i++) {
        var opt = s.options[i];
        if (!opt.value) {
          opt.hidden = false;
          continue;
        }
        var owner = opt.getAttribute('data-wilayah') || '';
        var show = key === '' || owner === key;
        opt.hidden = !show;
        if (show && opt.value === current) {
          stillVisible = true;
        }
      }
      if (!stillVisible) {
        s.value = '';
      }
    };
    w.addEventListener('change', apply);
  }

  function bindDeleteConfirm() {
    /* Handled by js/addresses/delete_confirm.js when loaded. */
  }

  var resultsMapState = {
    map: null,
    libyaBounds: null,
    markerBounds: null,
    markerLatLngs: null,
    parcelBounds: null,
    libyaRing: null,
    maskLayer: null,
    outlineLayer: null,
    baseLayers: null,
    currentBaseKind: 'offline'
  };

  var EXPORT_CANVAS_SCALE = 2;
  var EXPORT_TILE_WAIT_MS = 1000;
  var EXPORT_MAX_ZOOM = 5;
  var EXPORT_MAP_HEIGHT_PX = 520;
  var EXPORT_PIN_SCALE = 1.25;
  var ADDRESS_MARKER_FOCUS_ZOOM = 15;
  var ADDRESS_PIN_PATH = new Path2D(
    'M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z'
  );

  function ringLngLatToLatLng(ring) {
    var out = [];
    for (var i = 0; i < ring.length; i++) {
      out.push([ring[i][1], ring[i][0]]);
    }
    return out;
  }

  function addSkyVignette(wrap) {
    if (!wrap || wrap.querySelector('.libya-sky-vignette')) {
      return;
    }
    var vig = document.createElement('div');
    vig.className = 'libya-sky-vignette';
    vig.setAttribute('aria-hidden', 'true');
    wrap.appendChild(vig);
  }

  function setMaskVisible(visible) {
    var opacity = visible ? 0.9 : 0;
    if (resultsMapState.maskLayer && resultsMapState.maskLayer.setStyle) {
      resultsMapState.maskLayer.setStyle({ fillOpacity: opacity });
    }
    if (resultsMapState.outlineLayer && resultsMapState.outlineLayer.setStyle) {
      resultsMapState.outlineLayer.setStyle({ opacity: visible ? 0.85 : 0 });
    }
  }

  function applyLibyaMask(map, holeRing, outlineRing) {
    if (!map || !holeRing || holeRing.length < 4) {
      return;
    }
    outlineRing = outlineRing && outlineRing.length >= 4 ? outlineRing : holeRing;
    map.createPane('maskPane');
    map.getPane('maskPane').style.zIndex = 430;
    map.getPane('maskPane').style.pointerEvents = 'none';

    if (resultsMapState.maskLayer) {
      try { map.removeLayer(resultsMapState.maskLayer); } catch (eRm) {}
      resultsMapState.maskLayer = null;
    }
    if (resultsMapState.outlineLayer) {
      try { map.removeLayer(resultsMapState.outlineLayer); } catch (eRo) {}
      resultsMapState.outlineLayer = null;
    }

    var outer = [[85, -180], [85, 180], [-85, 180], [-85, -180]];
    resultsMapState.maskLayer = L.polygon([outer, holeRing], {
      stroke: false,
      fillColor: '#02060f',
      fillOpacity: 0.9,
      fillRule: 'evenodd',
      interactive: false,
      pane: 'maskPane'
    }).addTo(map);

    resultsMapState.outlineLayer = L.polyline(outlineRing, {
      color: '#fbbf24',
      weight: 1.6,
      opacity: 0.85,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
      pane: 'maskPane'
    }).addTo(map);
  }

  function fetchMaskRing(url) {
    var resolved = url;
    try {
      resolved = new URL(url, window.location.href).toString();
    } catch (eUrl) {}
    return fetch(resolved, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) {
          return null;
        }
        return r.json();
      })
      .then(function (geo) {
        var coords = geo && geo.geometry && geo.geometry.coordinates;
        if (!coords || !coords[0]) {
          return null;
        }
        return ringLngLatToLatLng(coords[0]);
      })
      .catch(function () {
        return null;
      });
  }

  function loadLibyaMask(map, root) {
    var landUrl = root.dataset.maskUrl || 'data/libya-mask-inner-ring.geojson';
    var visibleUrl = root.dataset.visibleMaskUrl || 'data/libya-visible-mask-ring.geojson';

    return Promise.all([
      fetchMaskRing(landUrl),
      fetchMaskRing(visibleUrl)
    ]).then(function (rings) {
      var landRing = rings[0];
      var visibleRing = rings[1];
      var holeRing = visibleRing || landRing;
      if (!holeRing) {
        return;
      }
      resultsMapState.libyaRing = holeRing;
      resultsMapState.landRing = landRing;
      applyLibyaMask(map, holeRing, landRing || holeRing);
    });
  }

  function enhanceExportCanvas(canvas, map, innerRing, scale) {
    if (!innerRing || innerRing.length < 4) {
      return canvas;
    }
    scale = scale || EXPORT_CANVAS_SCALE;
    var w = canvas.width;
    var h = canvas.height;

    var blurCanvas = document.createElement('canvas');
    blurCanvas.width = w;
    blurCanvas.height = h;
    var bctx = blurCanvas.getContext('2d');
    bctx.filter = 'blur(10px) brightness(0.32) saturate(0.55)';
    bctx.drawImage(canvas, 0, 0);

    var outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    var octx = outCanvas.getContext('2d');
    octx.drawImage(blurCanvas, 0, 0);

    octx.save();
    octx.beginPath();
    for (var i = 0; i < innerRing.length; i++) {
      var pt = map.latLngToContainerPoint(L.latLng(innerRing[i][0], innerRing[i][1]));
      var x = pt.x * scale;
      var y = pt.y * scale;
      if (i === 0) {
        octx.moveTo(x, y);
      } else {
        octx.lineTo(x, y);
      }
    }
    octx.closePath();
    octx.clip();
    octx.drawImage(canvas, 0, 0);
    octx.restore();

    octx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
    octx.lineWidth = 2.5 * scale;
    octx.beginPath();
    for (var j = 0; j < innerRing.length; j++) {
      var pt2 = map.latLngToContainerPoint(L.latLng(innerRing[j][0], innerRing[j][1]));
      var x2 = pt2.x * scale;
      var y2 = pt2.y * scale;
      if (j === 0) {
        octx.moveTo(x2, y2);
      } else {
        octx.lineTo(x2, y2);
      }
    }
    octx.closePath();
    octx.stroke();

    return outCanvas;
  }

  function libyaExportFitBounds(bounds) {
    if (!bounds || typeof bounds.getSouthWest !== 'function') {
      return bounds;
    }
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    var latSpan = Math.max(0.8, ne.lat - sw.lat);
    var lngSpan = Math.max(0.8, ne.lng - sw.lng);
    return L.latLngBounds(
      L.latLng(sw.lat - latSpan * 0.12, sw.lng - lngSpan * 0.10),
      L.latLng(ne.lat + latSpan * 0.36, ne.lng + lngSpan * 0.10)
    );
  }

  function resolveExportFitBounds() {
    var fit = resultsMapState.libyaBounds
      ? libyaExportFitBounds(resultsMapState.libyaBounds)
      : null;
    if (!fit && resultsMapState.markerBounds && resultsMapState.markerBounds.isValid()) {
      fit = resultsMapState.markerBounds;
    }
    if (!fit) {
      return null;
    }
    if (resultsMapState.markerBounds && resultsMapState.markerBounds.isValid()) {
      fit = fit.extend(resultsMapState.markerBounds);
    }
    if (resultsMapState.parcelBounds && resultsMapState.parcelBounds.isValid()) {
      fit = fit.extend(resultsMapState.parcelBounds);
    }
    if (resultsMapState.libyaRing && resultsMapState.libyaRing.length >= 4) {
      try {
        fit = fit.extend(L.latLngBounds(resultsMapState.libyaRing));
      } catch (eRing) {}
    }
    var sw = fit.getSouthWest();
    var ne = fit.getNorthEast();
    var latSpan = Math.max(1.0, ne.lat - sw.lat);
    var lngSpan = Math.max(1.0, ne.lng - sw.lng);
    return L.latLngBounds(
      L.latLng(sw.lat - latSpan * 0.08, sw.lng - lngSpan * 0.06),
      L.latLng(ne.lat + latSpan * 0.10, ne.lng + lngSpan * 0.06)
    );
  }

  function libyaExportFitOptions(mapEl) {
    var w = mapEl && mapEl.clientWidth ? mapEl.clientWidth : 800;
    var h = mapEl && mapEl.clientHeight ? mapEl.clientHeight : EXPORT_MAP_HEIGHT_PX;
    var padX = Math.round(w * 0.12);
    var padY = Math.round(h * 0.16);
    return {
      paddingTopLeft: L.point(padX, padY),
      paddingBottomRight: L.point(padX, padY),
      animate: false,
      maxZoom: EXPORT_MAX_ZOOM
    };
  }

  function prepareExportViewport(mapEl, map) {
    return {
      height: mapEl.style.height || '',
      minHeight: mapEl.style.minHeight || '',
      maxHeight: mapEl.style.maxHeight || '',
      apply: function () {
        mapEl.style.height = EXPORT_MAP_HEIGHT_PX + 'px';
        mapEl.style.minHeight = EXPORT_MAP_HEIGHT_PX + 'px';
        mapEl.style.maxHeight = 'none';
        map.invalidateSize({ animate: false });
      },
      restore: function () {
        mapEl.style.height = this.height;
        mapEl.style.minHeight = this.minHeight;
        mapEl.style.maxHeight = this.maxHeight;
        map.invalidateSize({ animate: false });
      }
    };
  }

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

  function paintAddressMarkersOnCanvas(ctx, mapRef, latlngs, scale, pinScale) {
    if (!ctx || !mapRef || !latlngs || latlngs.length < 1) {
      return;
    }
    scale = scale || 1;
    pinScale = pinScale || 1;
    for (var i = 0; i < latlngs.length; i++) {
      var ll = latlngs[i];
      var pt = mapRef.latLngToContainerPoint(ll);
      var x = pt.x * scale;
      var y = pt.y * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale * pinScale, scale * pinScale);
      ctx.translate(-12, -41);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#7c3aed';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.25;
      ctx.fill(ADDRESS_PIN_PATH);
      ctx.stroke(ADDRESS_PIN_PATH);
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.arc(12.5, 12.5, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
      ctx.restore();
    }
  }

  function buildAddressesExportCanvas(mapRef, latlngs, innerRing, scale) {
    scale = scale || EXPORT_CANVAS_SCALE;
    var size = mapRef.getSize();
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(size.x * scale));
    canvas.height = Math.max(1, Math.round(size.y * scale));
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('canvas');
    }
    ctx.fillStyle = '#0a0e12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paintLeafletTilesOnCanvas(ctx, mapRef, scale);
    var finalCanvas = enhanceExportCanvas(canvas, mapRef, innerRing, scale);
    var fctx = finalCanvas.getContext('2d');
    if (fctx) {
      paintAddressMarkersOnCanvas(fctx, mapRef, latlngs, scale, EXPORT_PIN_SCALE);
    }
    return finalCanvas;
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

  function effectiveMaxZoomForBase(kind, cfg) {
    if (kind === 'sat') {
      return cfg.allowRemoteTiles ? cfg.maxZSat : Math.min(cfg.maxZSat, cfg.offlineSatMaxZ);
    }
    return Math.min(cfg.maxZ, cfg.offlineMaxZ);
  }

  function syncBaseLayerButtons() {
    var schematic = document.getElementById('addresses-map-btn-schematic');
    var satellite = document.getElementById('addresses-map-btn-satellite');
    if (!schematic || !satellite) {
      return;
    }
    var isSat = resultsMapState.currentBaseKind === 'sat';
    schematic.classList.toggle('is-active', !isSat);
    schematic.setAttribute('aria-pressed', !isSat ? 'true' : 'false');
    satellite.classList.toggle('is-active', isSat);
    satellite.setAttribute('aria-pressed', isSat ? 'true' : 'false');
  }

  function setResultsMapBaseLayer(kind) {
    var map = resultsMapState.map;
    var layers = resultsMapState.baseLayers;
    var cfg = resultsMapState.mapLayerCfg;
    if (!map || !layers || !cfg) {
      return;
    }
    if (kind === 'sat' && !cfg.hasOfflineSat && !cfg.allowRemoteTiles) {
      return;
    }
    if (kind !== 'sat' && kind !== 'offline') {
      kind = 'offline';
    }
    if (kind === resultsMapState.currentBaseKind) {
      return;
    }
    var nextLayer = layers[kind];
    var prevLayer = layers[resultsMapState.currentBaseKind];
    if (prevLayer && map.hasLayer(prevLayer)) {
      map.removeLayer(prevLayer);
    }
    nextLayer.addTo(map);
    resultsMapState.currentBaseKind = kind;
    map.setMaxZoom(effectiveMaxZoomForBase(kind, cfg));
    if (map.getZoom() > map.getMaxZoom()) {
      map.setZoom(map.getMaxZoom());
    }
    if (typeof nextLayer.redraw === 'function') {
      nextLayer.redraw();
    }
    syncBaseLayerButtons();
  }

  function bindBaseLayerToggle() {
    var schematic = document.getElementById('addresses-map-btn-schematic');
    var satellite = document.getElementById('addresses-map-btn-satellite');
    if (schematic) {
      schematic.addEventListener('click', function () {
        setResultsMapBaseLayer('offline');
      });
    }
    if (satellite && !satellite.disabled) {
      satellite.addEventListener('click', function () {
        setResultsMapBaseLayer('sat');
      });
    }
  }

  function focusViewOnAddressMarker(mapRef, ll, parcelGeojson) {
    if (!mapRef || !ll) {
      return;
    }
    if (typeof mapRef.stop === 'function') {
      mapRef.stop();
    }
    var cfg = resultsMapState.mapLayerCfg;
    var kind = resultsMapState.currentBaseKind || 'offline';
    var maxFocus = cfg ? effectiveMaxZoomForBase(kind, cfg) : mapRef.getMaxZoom();
    var curZ = typeof mapRef.getZoom === 'function' ? mapRef.getZoom() : ADDRESS_MARKER_FOCUS_ZOOM;
    var floorZ = Math.max((typeof mapRef.getMinZoom === 'function' ? mapRef.getMinZoom() : 5) + 1, ADDRESS_MARKER_FOCUS_ZOOM);
    var targetZ = Math.min(maxFocus, Math.max(curZ, floorZ));
    if (parcelGeojson && window.ParcelDisplay && typeof window.ParcelDisplay.bounds === 'function') {
      var pb = window.ParcelDisplay.bounds(parcelGeojson);
      if (pb && pb.isValid()) {
        pb = pb.extend(ll);
        mapRef.flyToBounds(pb, { duration: 0.45, maxZoom: targetZ, padding: [36, 36] });
        return;
      }
    }
    mapRef.flyTo(ll, targetZ, { duration: 0.45, easeLinearity: 0.25 });
  }

  function bindAddressMarkerZoom(marker, mapRef, parcelGeojson) {
    if (!marker || typeof marker.on !== 'function') {
      return;
    }
    marker.on('click', function (e) {
      if (L.DomEvent) {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent) {
          L.DomEvent.stop(e.originalEvent);
        }
      }
      focusViewOnAddressMarker(mapRef, marker.getLatLng(), parcelGeojson);
    });
    marker.on('dblclick', function (e) {
      if (L.DomEvent) {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent) {
          L.DomEvent.stop(e.originalEvent);
        }
      }
    });
  }

  function initResultsMap() {
    if (typeof L === 'undefined') {
      return null;
    }
    var root = document.getElementById('addresses-map-root');
    var el = document.getElementById('addresses-map');
    var dataEl = document.getElementById('addresses-map-data');
    if (!root || !el || !dataEl) {
      return null;
    }
    var points;
    try {
      points = JSON.parse(dataEl.textContent || '[]');
    } catch (e) {
      return null;
    }
    if (!Array.isArray(points) || points.length < 1) {
      return null;
    }
    var sw = L.latLng(parseFloat(root.dataset.swLat), parseFloat(root.dataset.swLng));
    var ne = L.latLng(parseFloat(root.dataset.neLat), parseFloat(root.dataset.neLng));
    var bounds = L.latLngBounds(sw, ne);
    var minZ = parseInt(root.dataset.minZoom, 10) || 5;
    var maxZ = parseInt(root.dataset.maxZoom, 10) || 14;
    var maxZSat = parseInt(root.dataset.maxZoomSat, 10) || 17;
    var offlineMaxZ = parseInt(root.dataset.offlineMaxZoom, 10) || 17;
    var offlineSatMaxZ = parseInt(root.dataset.offlineSatMaxZoom, 10) || 16;
    var hasOfflineSat = root.dataset.offlineSat === '1';
    var allowRemoteTiles = root.dataset.allowRemoteTiles === '1';
    var layerCfg = {
      maxZ: maxZ,
      maxZSat: maxZSat,
      offlineMaxZ: offlineMaxZ,
      offlineSatMaxZ: offlineSatMaxZ,
      hasOfflineSat: hasOfflineSat,
      allowRemoteTiles: allowRemoteTiles
    };
    var tileBaseOpts = {
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
      crossOrigin: 'anonymous'
    };

    var map = L.map('addresses-map', {
      maxBounds: bounds,
      maxBoundsViscosity: 1.0,
      minZoom: minZ,
      maxZoom: effectiveMaxZoomForBase('offline', layerCfg)
    });

    var offlineLayer = L.tileLayer(
      'index.php?r=tile&z={z}&x={x}&y={y}',
      Object.assign({
        maxZoom: effectiveMaxZoomForBase('offline', layerCfg),
        maxNativeZoom: offlineMaxZ,
        attribution: 'Libya Postal (offline) / OSM'
      }, tileBaseOpts)
    );
    var offlineSatLayer = L.tileLayer(
      'index.php?r=tile&layer=sat&z={z}&x={x}&y={y}',
      Object.assign({
        maxZoom: effectiveMaxZoomForBase('sat', layerCfg),
        maxNativeZoom: offlineSatMaxZ,
        attribution: 'Libya Postal (offline) / Esri'
      }, tileBaseOpts)
    );
    var remoteSatLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      Object.assign({
        maxZoom: maxZSat,
        maxNativeZoom: maxZSat,
        attribution: '&copy; Esri, Maxar, Earthstar Geographics'
      }, tileBaseOpts)
    );

    resultsMapState.baseLayers = {
      offline: offlineLayer,
      sat: allowRemoteTiles ? remoteSatLayer : offlineSatLayer
    };
    resultsMapState.currentBaseKind = 'offline';
    resultsMapState.mapLayerCfg = layerCfg;
    offlineLayer.addTo(map);

    var g = L.layerGroup().addTo(map);
    var latlngs = [];
    var parcelBounds = null;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var ll = L.latLng(p.lat, p.lng);
      if (!bounds.contains(ll)) {
        continue;
      }
      latlngs.push(ll);
      var marker = L.marker(ll, { icon: createAddressPinIcon() })
        .bindPopup(String(p.label || ''))
        .addTo(g);
      bindAddressMarkerZoom(marker, map, p.parcel_geojson || null);
      if (p.parcel_geojson && window.ParcelDisplay && typeof window.ParcelDisplay.render === 'function') {
        window.ParcelDisplay.render(map, p.parcel_geojson, {
          desc: p.parcel_desc || '',
          style: { color: '#22c55e', fillColor: '#22c55e' }
        });
        var pb = window.ParcelDisplay.bounds(p.parcel_geojson);
        if (pb) {
          parcelBounds = parcelBounds ? parcelBounds.extend(pb) : pb;
        }
      }
    }
    if (latlngs.length < 1) {
      return null;
    }
    var markerBounds = L.latLngBounds(latlngs);
    if (latlngs.length === 1 && (parcelBounds || markerBounds.isValid())) {
      var detailFit = markerBounds;
      if (parcelBounds && parcelBounds.isValid()) {
        detailFit = detailFit.extend(parcelBounds);
      }
      map.fitBounds(detailFit, { padding: [48, 48], maxZoom: 16, animate: false });
    } else {
      map.fitBounds(bounds, { padding: [18, 18], animate: false });
    }

    resultsMapState.map = map;
    resultsMapState.libyaBounds = bounds;
    resultsMapState.markerBounds = markerBounds;
    resultsMapState.markerLatLngs = latlngs;
    resultsMapState.parcelBounds = parcelBounds;

    loadLibyaMask(map, root);

    return map;
  }

  function bindMapExport() {
    var btn = document.getElementById('addr-map-export');
    var mapEl = document.getElementById('addresses-map');
    if (!btn || !mapEl) {
      return;
    }

    var defaultLabel = btn.textContent;

    btn.addEventListener('click', function () {
      var map = resultsMapState.map;
      if (!map || typeof map.getSize !== 'function') {
        window.alert('تعذّر تصدير الخريطة — تأكد من تحميل الصفحة بالكامل.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'جاري التصدير...';

      var savedCenter = map.getCenter();
      var savedZoom = map.getZoom();
      var exportViewport = prepareExportViewport(mapEl, map);

      function restoreView() {
        setMaskVisible(true);
        exportViewport.restore();
        map.setView(savedCenter, savedZoom, { animate: false });
        btn.disabled = false;
        btn.textContent = defaultLabel;
      }

      setMaskVisible(false);
      exportViewport.apply();

      var exportBounds = resolveExportFitBounds();
      if (exportBounds) {
        map.fitBounds(exportBounds, libyaExportFitOptions(mapEl));
      } else if (resultsMapState.markerBounds) {
        map.fitBounds(resultsMapState.markerBounds, {
          padding: [56, 56],
          maxZoom: EXPORT_MAX_ZOOM,
          animate: false
        });
      }

      if (map.getZoom() > EXPORT_MAX_ZOOM) {
        map.setZoom(EXPORT_MAX_ZOOM, { animate: false });
      }

      map.invalidateSize();

      waitForExportReady(map, EXPORT_TILE_WAIT_MS)
        .then(function () {
          var finalCanvas = buildAddressesExportCanvas(
            map,
            resultsMapState.markerLatLngs,
            resultsMapState.libyaRing,
            EXPORT_CANVAS_SCALE
          );
          var dataUrl = finalCanvas.toDataURL('image/png');
          var stamp = new Date().toISOString().slice(0, 10);
          var fileName = 'libya-addresses-map-' + stamp + '.png';

          var link = document.createElement('a');
          link.download = fileName;
          link.href = dataUrl;
          link.click();

          var printWin = window.open('', '_blank', 'noopener,noreferrer');
          if (printWin) {
            printWin.document.write(
              '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
                '<title>خريطة العناوين — ليبيا</title>' +
                '<style>body{margin:0;padding:12px;text-align:center;background:#fff;font-family:Tahoma,sans-serif}' +
                'h1{font-size:1rem;margin:0 0 8px;color:#1e3a8a}img{max-width:100%;height:auto;border:1px solid #cbd5e1}</style></head><body>' +
                '<h1>خريطة العناوين البريدية — ليبيا</h1>' +
                '<img src="' + dataUrl + '" alt="خريطة ليبيا مع علامات العناوين"></body></html>'
            );
            printWin.document.close();
            printWin.onload = function () {
              try {
                printWin.focus();
                printWin.print();
              } catch (ePrint) {}
            };
          }

          restoreView();
        })
        .catch(function () {
          restoreView();
          window.alert('تعذّر تصدير صورة الخريطة. أعد المحاولة بعد اكتمال تحميل البلاطات.');
        });
    });
  }

  function buildReportParams(form, output) {
    var params = new URLSearchParams();
    params.set('r', 'addresses_report');
    params.set('output', output || 'pdf');
    var q = form.querySelector('[name="q"]');
    var w = form.querySelector('[name="wilayah"]');
    var s = form.querySelector('[name="shabiya"]');
    var t = form.querySelector('[name="type"]');
    if (q && q.value.trim() !== '') {
      params.set('q', q.value.trim());
    }
    if (w && w.value !== '') {
      params.set('wilayah', w.value);
    }
    if (s && s.value !== '') {
      params.set('shabiya', s.value);
    }
    if (t && t.value !== '') {
      params.set('type', t.value);
    }
    return params;
  }

  function bindPrintReport() {
    var btn = document.getElementById('addr-print-btn');
    var form = document.querySelector('form.addresses-filters');
    if (!btn || !form) {
      return;
    }

    var defaultLabel = btn.textContent;
    var busy = false;
    var resetTimer = null;

    function setBusy(on) {
      busy = on;
      btn.disabled = on;
      btn.textContent = on ? 'جاري التحضير...' : defaultLabel;
    }

    function resetBusy() {
      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
      setBusy(false);
    }

    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.type !== 'addresses-report-done') {
        return;
      }
      resetBusy();
    });

    btn.addEventListener('click', function () {
      if (busy) {
        return;
      }
      setBusy(true);
      resetTimer = setTimeout(resetBusy, 20000);

      var params = buildReportParams(form, 'print');
      var url = 'index.php?' + params.toString();
      var win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        resetBusy();
        window.alert('يُرجى السماح بالنوافذ المنبثقة لطباعة كشف العناوين.');
        return;
      }
      win.focus();
    });
  }

  function init() {
    syncShabiyaOptions();
    bindDeleteConfirm();
    bindPrintReport();
    initResultsMap();
    bindBaseLayerToggle();
    bindMapExport();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
