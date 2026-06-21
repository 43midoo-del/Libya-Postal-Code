/**
 * Saved-address overlay for the add-address map: when a hood/locality is selected,
 * fetch addresses already stored in that hood (same shabiya + locality) and draw
 * their location markers + parcel boundaries in a dedicated, read-only layer.
 *
 * Also keeps the loaded geometry in memory so the form can warn (non-blocking) when
 * a freshly placed marker or drawn parcel overlaps an existing one in the same hood.
 *
 * Exposes window.AddrSaved.
 */
(function () {
  'use strict';

  if (!window.MapCore || !window.MapCore.map || typeof L === 'undefined') {
    return;
  }
  var map = window.MapCore.map;

  var cfg = {};
  try {
    var cfgEl = document.getElementById('addr-page-config');
    if (cfgEl) {
      cfg = JSON.parse(cfgEl.textContent || '{}') || {};
    }
  } catch (eCfg) {
    cfg = {};
  }
  var currentEditId = parseInt(cfg.editId, 10) || 0;

  var pointLayer = L.layerGroup().addTo(map);
  var parcelLayer = L.layerGroup().addTo(map);
  var pointsVisible = true;
  var parcelsVisible = true;
  var loaded = [];
  var loadGen = 0;
  var lastKey = '';

  var togglesEl = document.getElementById('saved-addr-toggles');
  var pointsToggle = document.getElementById('layer-saved-points');
  var parcelsToggle = document.getElementById('layer-saved-parcels');

  var MARKER_STYLE = {
    radius: 6,
    color: '#f97316',
    weight: 2,
    fillColor: '#fb923c',
    fillOpacity: 0.85
  };
  var PARCEL_STYLE = {
    color: '#f97316',
    weight: 2,
    dashArray: '4 4',
    fillColor: '#f97316',
    fillOpacity: 0.1
  };

  function parseGeoJson(raw) {
    if (!raw) { return null; }
    if (typeof raw === 'object') { return raw; }
    try { return JSON.parse(String(raw)); } catch (e0) { return null; }
  }

  /* Returns a flat list of polygons; each polygon = array of rings; ring = [[lng,lat], …]. */
  function geojsonToPolygons(gj) {
    if (!gj || typeof gj !== 'object') { return []; }
    var type = String(gj.type || '');
    if (type === 'FeatureCollection') {
      var out = [];
      var feats = Array.isArray(gj.features) ? gj.features : [];
      for (var i = 0; i < feats.length; i++) {
        var g = feats[i] && feats[i].geometry ? feats[i].geometry : feats[i];
        var inner = geojsonToPolygons(g);
        for (var k = 0; k < inner.length; k++) { out.push(inner[k]); }
      }
      return out;
    }
    if (type === 'Feature') {
      return geojsonToPolygons(gj.geometry);
    }
    if (type === 'Polygon') {
      return Array.isArray(gj.coordinates) ? [gj.coordinates] : [];
    }
    if (type === 'MultiPolygon') {
      var polys = [];
      var coords = Array.isArray(gj.coordinates) ? gj.coordinates : [];
      for (var p = 0; p < coords.length; p++) {
        if (Array.isArray(coords[p])) { polys.push(coords[p]); }
      }
      return polys;
    }
    return [];
  }

  function showToggles() {
    if (togglesEl) { togglesEl.hidden = false; }
  }
  function hideToggles() {
    if (togglesEl) { togglesEl.hidden = true; }
  }

  function setPointsVisible(on) {
    pointsVisible = !!on;
    if (pointsVisible) {
      if (!map.hasLayer(pointLayer)) { map.addLayer(pointLayer); }
    } else if (map.hasLayer(pointLayer)) {
      map.removeLayer(pointLayer);
    }
  }
  function setParcelsVisible(on) {
    parcelsVisible = !!on;
    if (parcelsVisible) {
      if (!map.hasLayer(parcelLayer)) { map.addLayer(parcelLayer); }
    } else if (map.hasLayer(parcelLayer)) {
      map.removeLayer(parcelLayer);
    }
  }

  function clear() {
    loadGen += 1;
    lastKey = '';
    loaded = [];
    try { pointLayer.clearLayers(); } catch (eClrP) {}
    try { parcelLayer.clearLayers(); } catch (eClrB) {}
    hideToggles();
  }

  function renderRow(row) {
    var la = parseFloat(row.latitude);
    var ln = parseFloat(row.longitude);
    var entry = { id: parseInt(row.id, 10) || 0, lat: null, lng: null, polygons: [], row: row };

    var tip = '';
    if (row.postal_code) { tip = String(row.postal_code); }
    if (row.owner_name) { tip += (tip ? ' — ' : '') + String(row.owner_name); }

    if (isFinite(la) && isFinite(ln)) {
      entry.lat = la;
      entry.lng = ln;
      var mk = L.circleMarker([la, ln], MARKER_STYLE);
      if (tip) { mk.bindTooltip(tip, { sticky: true }); }
      mk.addTo(pointLayer);
    }

    var gj = parseGeoJson(row.parcel_geojson);
    if (gj) {
      entry.polygons = geojsonToPolygons(gj);
      if (window.ParcelDisplay && typeof window.ParcelDisplay.render === 'function') {
        var layer = window.ParcelDisplay.render(parcelLayer, gj, {
          style: PARCEL_STYLE,
          desc: row.parcel_desc || tip || ''
        });
        if (!layer) {
          drawPolygonsFallback(entry.polygons, tip);
        }
      } else {
        drawPolygonsFallback(entry.polygons, tip);
      }
    }

    if (entry.lat !== null || entry.polygons.length) {
      loaded.push(entry);
    }
  }

  function drawPolygonsFallback(polygons, tip) {
    for (var i = 0; i < polygons.length; i++) {
      var rings = polygons[i];
      if (!Array.isArray(rings) || !rings.length) { continue; }
      var latlngs = [];
      for (var r = 0; r < rings.length; r++) {
        var ring = rings[r];
        var pts = [];
        for (var j = 0; j < ring.length; j++) {
          pts.push([ring[j][1], ring[j][0]]);
        }
        latlngs.push(pts);
      }
      var poly = L.polygon(latlngs, PARCEL_STYLE);
      if (tip) { poly.bindTooltip(tip, { sticky: true }); }
      poly.addTo(parcelLayer);
    }
  }

  function loadForHood(shabiyaName, locality) {
    var sh = String(shabiyaName || '').trim();
    var loc = String(locality || '').trim();
    if (!sh || !loc) {
      clear();
      return Promise.resolve([]);
    }
    showToggles();
    var key = sh + '||' + loc;
    if (key === lastKey && loaded.length) {
      return Promise.resolve(loaded);
    }
    var gen = ++loadGen;
    lastKey = key;
    try { pointLayer.clearLayers(); } catch (eC2) {}
    try { parcelLayer.clearLayers(); } catch (eC3) {}
    loaded = [];
    var url =
      'index.php?r=addresses_json&shabiya=' +
      encodeURIComponent(sh) +
      '&locality=' +
      encodeURIComponent(loc) +
      '&limit=500';
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) { throw new Error('saved http ' + r.status); }
        return r.json();
      })
      .then(function (data) {
        if (gen !== loadGen) { return loaded; }
        var rows = data && data.ok && Array.isArray(data.results) ? data.results : [];
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (!row) { continue; }
          if (currentEditId && (parseInt(row.id, 10) || 0) === currentEditId) { continue; }
          renderRow(row);
        }
        return loaded;
      })
      .catch(function () {
        if (gen === loadGen) { lastKey = ''; }
        return loaded;
      });
  }

  /* ----------------------------- geometry checks ----------------------------- */

  function ringContains(ring, lat, lng) {
    var n = ring.length;
    if (n < 3) { return false; }
    var inside = false;
    var x = lng;
    var y = lat;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = ring[i][0];
      var yi = ring[i][1];
      var xj = ring[j][0];
      var yj = ring[j][1];
      var denom = (yj - yi) || 1e-12;
      var intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi) / denom) + xi);
      if (intersect) { inside = !inside; }
    }
    return inside;
  }

  function polygonContains(polygon, lat, lng) {
    if (!polygon || !polygon.length) { return false; }
    if (!ringContains(polygon[0], lat, lng)) { return false; }
    for (var h = 1; h < polygon.length; h++) {
      if (ringContains(polygon[h], lat, lng)) { return false; }
    }
    return true;
  }

  function pointInLoadedParcel(lat, lng) {
    return findContainingAddress(lat, lng) !== null;
  }

  /* Returns the saved-address row whose parcel contains the point, or null. */
  function findContainingAddress(lat, lng) {
    for (var i = 0; i < loaded.length; i++) {
      var polys = loaded[i].polygons;
      for (var p = 0; p < polys.length; p++) {
        if (polygonContains(polys[p], lat, lng)) { return loaded[i].row || null; }
      }
    }
    return null;
  }

  function ringBbox(ring) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < ring.length; i++) {
      var x = ring[i][0], y = ring[i][1];
      if (x < minX) { minX = x; }
      if (x > maxX) { maxX = x; }
      if (y < minY) { minY = y; }
      if (y > maxY) { maxY = y; }
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function bboxOverlap(a, b) {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
  }

  function segmentsIntersect(p1, p2, p3, p4) {
    function ccw(a, b, c) {
      return (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
    }
    var d1 = ccw(p3, p4, p1);
    var d2 = ccw(p3, p4, p2);
    var d3 = ccw(p1, p2, p3);
    var d4 = ccw(p1, p2, p4);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }

  /* polyA / polyB are single polygons (array of rings, ring = [[lng,lat], …]). */
  function polygonsOverlap(polyA, polyB) {
    if (!polyA || !polyA.length || !polyB || !polyB.length) { return false; }
    var ringA = polyA[0];
    var ringB = polyB[0];
    if (!bboxOverlap(ringBbox(ringA), ringBbox(ringB))) { return false; }
    for (var i = 0; i < ringA.length; i++) {
      if (polygonContains(polyB, ringA[i][1], ringA[i][0])) { return true; }
    }
    for (var j = 0; j < ringB.length; j++) {
      if (polygonContains(polyA, ringB[j][1], ringB[j][0])) { return true; }
    }
    for (var a = 0; a < ringA.length - 1; a++) {
      for (var b = 0; b < ringB.length - 1; b++) {
        if (segmentsIntersect(ringA[a], ringA[a + 1], ringB[b], ringB[b + 1])) { return true; }
      }
    }
    return false;
  }

  /* candidatePolygon = single polygon (array of rings). Checks against all loaded. */
  function parcelOverlapsLoaded(candidatePolygon) {
    for (var i = 0; i < loaded.length; i++) {
      var polys = loaded[i].polygons;
      for (var p = 0; p < polys.length; p++) {
        if (polygonsOverlap(candidatePolygon, polys[p])) { return true; }
      }
    }
    return false;
  }

  /* Converts a Leaflet polygon's first ring (array of L.LatLng) to [[lng,lat], …]. */
  function latlngsToRing(latlngs) {
    var ring = [];
    for (var i = 0; i < latlngs.length; i++) {
      ring.push([latlngs[i].lng, latlngs[i].lat]);
    }
    if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
      ring.push([ring[0][0], ring[0][1]]);
    }
    return ring;
  }

  window.addEventListener('addr-map-clear-annotations', function () {
    clear();
  });

  if (pointsToggle) {
    pointsToggle.addEventListener('change', function () {
      setPointsVisible(pointsToggle.checked);
    });
  }
  if (parcelsToggle) {
    parcelsToggle.addEventListener('change', function () {
      setParcelsVisible(parcelsToggle.checked);
    });
  }

  window.AddrSaved = {
    loadForHood: loadForHood,
    clear: clear,
    getLoaded: function () { return loaded; },
    pointInLoadedParcel: pointInLoadedParcel,
    findContainingAddress: findContainingAddress,
    parcelOverlapsLoaded: parcelOverlapsLoaded,
    polygonContains: polygonContains,
    latlngsToRing: latlngsToRing,
    setPointsVisible: setPointsVisible,
    setParcelsVisible: setParcelsVisible
  };
})();
