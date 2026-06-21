/**
 * Map labels: postal region tags (B1–F22) overlay + visibility toggle.
 * Positions each code at the geometric center of its shabiya polygon.
 */
(function bootLabelsModule(retry) {
  'use strict';

  if (!window.MapCore || !window.MapCore.map) {
    if ((retry || 0) < 80) {
      setTimeout(function () {
        bootLabelsModule((retry || 0) + 1);
      }, 40);
    }
    return;
  }
  var MC = window.MapCore;
  var map = MC.map;
  var regions = MC.regions || [];

  var labelLayer = L.layerGroup().addTo(map);
  var labelMarkers = [];
  /** @type {Record<string, {lat:number,lng:number}>} */
  var regionCentroids = {};

  function pointInRingLatLng(lat, lng, ring) {
    if (!ring || ring.length < 3) {
      return false;
    }
    var inside = false;
    for (var i = 0; i < ring.length; i++) {
      var j = i === 0 ? ring.length - 1 : i - 1;
      var xi = ring[i][0];
      var yi = ring[i][1];
      var xj = ring[j][0];
      var yj = ring[j][1];
      var intersect =
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
      if (intersect) {
        inside = !inside;
      }
    }
    return inside;
  }

  function pointInGeoJSONFeature(lat, lng, feature) {
    var geom = feature && feature.geometry;
    if (!geom || !geom.coordinates) {
      return false;
    }
    if (geom.type === 'Polygon') {
      var rings = geom.coordinates;
      if (!pointInRingLatLng(lat, lng, rings[0])) {
        return false;
      }
      for (var hi = 1; hi < rings.length; hi++) {
        if (pointInRingLatLng(lat, lng, rings[hi])) {
          return false;
        }
      }
      return true;
    }
    if (geom.type === 'MultiPolygon') {
      for (var mp = 0; mp < geom.coordinates.length; mp++) {
        var poly = geom.coordinates[mp];
        if (!poly || !poly.length) {
          continue;
        }
        if (!pointInRingLatLng(lat, lng, poly[0])) {
          continue;
        }
        var inHole = false;
        for (var hj = 1; hj < poly.length; hj++) {
          if (pointInRingLatLng(lat, lng, poly[hj])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) {
          return true;
        }
      }
    }
    return false;
  }

  function ringSignedArea(ring) {
    var area = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return area * 0.5;
  }

  function ringAreaCentroid(ring) {
    if (!ring || ring.length < 3) {
      return null;
    }
    var area = 0;
    var cx = 0;
    var cy = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      var x0 = ring[i][0];
      var y0 = ring[i][1];
      var x1 = ring[i + 1][0];
      var y1 = ring[i + 1][1];
      var f = x0 * y1 - x1 * y0;
      area += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    if (Math.abs(area) < 1e-14) {
      return null;
    }
    return { lat: cy / (3 * area), lng: cx / (3 * area) };
  }

  function largestOuterRing(feature) {
    var geom = feature && feature.geometry;
    if (!geom || !geom.coordinates) {
      return null;
    }
    if (geom.type === 'Polygon') {
      return geom.coordinates[0] || null;
    }
    if (geom.type === 'MultiPolygon') {
      var best = null;
      var bestArea = -1;
      for (var m = 0; m < geom.coordinates.length; m++) {
        var ring = geom.coordinates[m] && geom.coordinates[m][0];
        if (!ring) {
          continue;
        }
        var a = Math.abs(ringSignedArea(ring));
        if (a > bestArea) {
          bestArea = a;
          best = ring;
        }
      }
      return best;
    }
    return null;
  }

  function featureLabelCenter(feature) {
    if (!feature) {
      return null;
    }
    var ring = largestOuterRing(feature);
    var centroid = ring ? ringAreaCentroid(ring) : null;
    if (centroid && pointInGeoJSONFeature(centroid.lat, centroid.lng, feature)) {
      return centroid;
    }
    var tmp = L.geoJSON(feature);
    try {
      var boundsCenter = tmp.getBounds().getCenter();
      if (pointInGeoJSONFeature(boundsCenter.lat, boundsCenter.lng, feature)) {
        return { lat: boundsCenter.lat, lng: boundsCenter.lng };
      }
    } catch (eBounds) {}
    finally {
      if (tmp.remove) {
        tmp.remove();
      } else if (map && map.removeLayer) {
        map.removeLayer(tmp);
      }
    }
    return centroid;
  }

  function ingestShabiyatFeatures(features) {
    if (!Array.isArray(features)) {
      return;
    }
    for (var i = 0; i < features.length; i++) {
      var feature = features[i];
      var props = (feature && feature.properties) || {};
      var code = String(props.code || '').trim();
      if (!code) {
        continue;
      }
      var center = featureLabelCenter(feature);
      if (center && isFinite(center.lat) && isFinite(center.lng)) {
        regionCentroids[code] = center;
      }
    }
  }

  function loadShabiyatFeaturesFromDom() {
    var el = document.getElementById('libya-shabiyat-data');
    if (!el) {
      return null;
    }
    try {
      var geo = JSON.parse(el.textContent || '{}');
      if (geo && Array.isArray(geo.features)) {
        return geo.features;
      }
    } catch (eParse) {}
    return null;
  }

  function resolveShabiyatUrl() {
    var root = document.getElementById('map-root');
    return root ? String(root.dataset.shabiyatUrl || '').trim() : '';
  }

  function loadShabiyatCentroids(done) {
    var embedded = loadShabiyatFeaturesFromDom();
    if (embedded && embedded.length) {
      ingestShabiyatFeatures(embedded);
      if (typeof done === 'function') {
        done();
      }
      return;
    }
    var url = resolveShabiyatUrl();
    if (!url) {
      if (typeof done === 'function') {
        done();
      }
      return;
    }
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) {
          throw new Error('shabiyat http ' + r.status);
        }
        return r.json();
      })
      .then(function (geo) {
        if (geo && Array.isArray(geo.features)) {
          ingestShabiyatFeatures(geo.features);
        }
      })
      .catch(function () {})
      .then(function () {
        if (typeof done === 'function') {
          done();
        }
      });
  }

  function regionLabelPosition(lb) {
    var code = lb.code || (lb.province && lb.n ? lb.province + lb.n : '');
    if (!code) {
      return null;
    }
    var hit = regionCentroids[code];
    if (hit && isFinite(hit.lat) && isFinite(hit.lng)) {
      return hit;
    }
    if (typeof lb.lat === 'number' && typeof lb.lng === 'number') {
      return { lat: lb.lat, lng: lb.lng };
    }
    return null;
  }

  function addLabels() {
    labelLayer.clearLayers();
    labelMarkers = [];
    for (var j = 0; j < regions.length; j++) {
      var lb = regions[j];
      var code = lb.code || (lb.province && lb.n ? lb.province + lb.n : '');
      var pos = regionLabelPosition(lb);
      if (!code || !pos) {
        continue;
      }
      var m = L.marker([pos.lat, pos.lng], {
        pane: 'postalLabels',
        interactive: false,
        icon: L.divIcon({
          className: 'postal-map-label',
          html: '<span>' + String(code).replace(/</g, '') + '</span>',
          iconSize: [44, 24],
          iconAnchor: [22, 12]
        })
      });
      m.addTo(labelLayer);
      labelMarkers.push(m);
    }
  }

  function setCentroidsFromLayers(shabiyatLayer) {
    if (!shabiyatLayer || typeof shabiyatLayer.eachLayer !== 'function') {
      return;
    }
    shabiyatLayer.eachLayer(function (layer) {
      var props = (layer.feature && layer.feature.properties) || {};
      var code = String(props.code || '').trim();
      if (!code) {
        return;
      }
      var center = featureLabelCenter(layer.feature);
      if (!center) {
        try {
          var bc = layer.getBounds().getCenter();
          center = { lat: bc.lat, lng: bc.lng };
        } catch (eCenter) {
          center = null;
        }
      }
      if (center && isFinite(center.lat) && isFinite(center.lng)) {
        regionCentroids[code] = center;
      }
    });
    addLabels();
  }

  loadShabiyatCentroids(addLabels);

  function shouldHidePostalLabels() {
    var layerLabelsCb = document.getElementById('layer-labels');
    if (layerLabelsCb) {
      return !layerLabelsCb.checked;
    }
    var st = MC.state || {};
    if (st.shabiyatDrilldownWanted || st.userOverviewLocked) {
      return true;
    }
    if (st.lastShabiyaDetail) {
      var key = String(st.lastShabiyaDetail.code || st.lastShabiyaDetail.name || '').trim();
      if (key) {
        return true;
      }
    }
    if (typeof MC.isMapDrilldownView === 'function' && MC.isMapDrilldownView()) {
      return true;
    }
    return false;
  }

  function syncPostalLabelsVisibility() {
    var layerLabelsCb = document.getElementById('layer-labels');
    var wantOn = layerLabelsCb ? !!layerLabelsCb.checked : true;
    if (shouldHidePostalLabels()) {
      if (map.hasLayer(labelLayer)) {
        map.removeLayer(labelLayer);
      }
      return;
    }
    if (wantOn && !map.hasLayer(labelLayer)) {
      labelLayer.addTo(map);
    }
  }

  map.on('zoomend moveend', syncPostalLabelsVisibility);
  window.addEventListener('addr-shabiya-select', syncPostalLabelsVisibility);

  var layerLabelsCb = document.getElementById('layer-labels');
  if (layerLabelsCb) {
    layerLabelsCb.addEventListener('change', syncPostalLabelsVisibility);
    syncPostalLabelsVisibility();
  }

  MC.getRegionLabelPosition = regionLabelPosition;
  MC.labels = {
    layer: labelLayer,
    markers: labelMarkers,
    centroids: regionCentroids,
    refresh: addLabels,
    setCentroidsFromLayers: setCentroidsFromLayers,
    syncVisibility: syncPostalLabelsVisibility
  };
  syncPostalLabelsVisibility();
})(0);
