/**
 * Shabiyat layer: GeoJSON polygons, hover/click, city places loading (local DB only),
 * focus-from-form handler, new-scene reset handler.
 */
(function () {
  'use strict';

  if (!window.MapCore || !window.MapCore.map) {
    return;
  }
  var MC = window.MapCore;
  var map = MC.map;
  var bounds = MC.bounds;
  var maxZ = MC.maxZ;
  var readOnly = MC.readOnly;
  var state = MC.state;
  var root = document.getElementById('map-root');
  var shabiyatUrl = root ? (root.dataset.shabiyatUrl || '') : '';
  var skipNeighborBoundaryTiles = root ? (root.dataset.skipNeighborBoundaries === '1') : false;

  state.cityPlacesLayer = L.layerGroup().addTo(map);

  var placesFetchAbort = null;
  var placesLoadGeneration = 0;

  var localPlacesByCode = {};
  var localPlacesByName = {};
  (function loadEmbeddedCityPlaces() {
    var el = document.getElementById('shabiya-city-places-data');
    if (!el) { return; }
    try {
      var parsed = JSON.parse(el.textContent || '{}');
      if (parsed && parsed.byCode && typeof parsed.byCode === 'object') {
        localPlacesByCode = parsed.byCode;
      }
      if (parsed && parsed.byName && typeof parsed.byName === 'object') {
        localPlacesByName = parsed.byName;
      }
    } catch (eParse) {}
  })();

  function lookupLocalPlaces(shName, shCode) {
    var code = shCode ? String(shCode).trim().toUpperCase() : '';
    var name = shName ? String(shName).trim() : '';
    if (code && localPlacesByCode[code] && localPlacesByCode[code].length) {
      return localPlacesByCode[code];
    }
    if (name && localPlacesByName[name] && localPlacesByName[name].length) {
      return localPlacesByName[name];
    }
    return [];
  }

  function dispatchCityPlacesUpdated(names) {
    try {
      window.dispatchEvent(
        new CustomEvent('addr-city-places-updated', { detail: { names: names && names.length ? names : [] } })
      );
    } catch (eDisp) {}
  }

  function abortPlacesFetch() {
    if (placesFetchAbort) {
      try { placesFetchAbort.abort(); } catch (eab) {}
      placesFetchAbort = null;
    }
  }

  /** Invalidate in-flight loads and hide any places-loading toast. */
  function cancelPlacesLoadMessage() {
    placesLoadGeneration += 1;
    abortPlacesFetch();
    MC.clearAddrApiMsgHideTimer();
    MC.showApiMsg('', false);
  }

  function placeGenerationAlive(gen) {
    return gen === placesLoadGeneration;
  }

  function clearCityPlaces() {
    state.cityPlaceByName = {};
    if (state.cityPlacesLayer) {
      state.cityPlacesLayer.clearLayers();
    }
    dispatchCityPlacesUpdated([]);
    abortPlacesFetch();
  }
  MC.clearCityPlaces = clearCityPlaces;
  MC.cancelPlacesLoadMessage = cancelPlacesLoadMessage;

  function resolveMaskUrl(u) {
    if (!u) { return ''; }
    if (/^https?:\/\//i.test(u)) { return u; }
    try { return new URL(u, window.location.href).toString(); } catch (eU) { return u; }
  }

  function installYellowPlaceCircle(name, lat0, lng0, type0) {
    var cm = L.circleMarker([lat0, lng0], {
      pane: 'cityPane',
      radius: 5,
      color: '#0c4a6e',
      weight: 1.5,
      fillColor: '#fcd34d',
      fillOpacity: 0.92
    });
    cm.bindTooltip(name, { sticky: true, direction: 'top', className: 'shabiya-tooltip' });
    cm.on('click', function (ev) {
      if (L && L.DomEvent) { L.DomEvent.stopPropagation(ev); }
      var ll = ev.latlng || L.latLng(lat0, lng0);
      if (!readOnly && state.drawMode === 'parcel') {
        if (ll && bounds.contains(ll) && typeof state.drawClickHandler === 'function') {
          state.drawClickHandler(ll);
        }
        return;
      }
      if (!readOnly && state.markerModePending) {
        if (ll && bounds.contains(ll)) {
          if (map && typeof map.stop === 'function') {
            map.stop();
          }
          state.selectedPlace = { name: name, lat: lat0, lng: lng0, type: type0 };
          MC.placeAddressMarker(ll);
          state.markerModePending = false;
          MC.syncMarkerModeButton();
          MC.syncMarkerCtaReveal();
        }
        return;
      }
      state.selectedPlace = { name: name, lat: lat0, lng: lng0, type: type0 };
      MC.flyToPlace(lat0, lng0, type0);
      window.dispatchEvent(
        new CustomEvent('addr-place-select', { detail: { name: name, lat: lat0, lng: lng0, type: type0 } })
      );
      MC.syncMarkerCtaReveal();
    });
    cm.addTo(state.cityPlacesLayer);
  }

  function ingestPlaceRows(placeRows, gen, bbox, relaxBOnlyLibyaOuterBounds) {
    var nameSeen = {};
    var added = 0;
    for (var ri = 0; ri < placeRows.length; ri++) {
      if (!placeGenerationAlive(gen)) {
        break;
      }
      var row = placeRows[ri];
      var nm = row && row.name ? String(row.name).trim() : '';
      var plat = Number(row && row.lat);
      var plng = Number(row && row.lng);
      if (!nm || plat !== plat || plng !== plng) {
        continue;
      }
      var pt = row.type ? String(row.type) : 'town';
      var ll = L.latLng(plat, plng);
      if (!bounds.contains(ll)) {
        continue;
      }
      if (!relaxBOnlyLibyaOuterBounds && bbox && typeof bbox.isValid === 'function' && bbox.isValid() && !bbox.contains(ll)) {
        continue;
      }
      nameSeen[nm] = 1;
      state.cityPlaceByName[nm] = { lat: plat, lng: plng, type: pt };
      installYellowPlaceCircle(nm, plat, plng, pt);
      added++;
    }
    var keys = Object.keys(nameSeen).sort(function (a, bb) {
      return a.localeCompare(bb, 'ar');
    });
    return { added: added, names: keys };
  }

  function showPlacesOutcomeMessage(gen, added, fromLocalFast) {
    if (!placeGenerationAlive(gen)) {
      return;
    }
    MC.clearAddrApiMsgHideTimer();
    MC.showApiMsg(
      added > 0
        ? fromLocalFast
          ? 'تم تحميل ' + added + ' مكاناً من قاعدة البيانات المحلية.'
          : 'تم تحميل ' + added + ' مكاناً ضمن الشعبية.'
        : 'لا توجد أماكن مسجّلة لهذه الشعبية في قاعدة البيانات. نفّذ database_seed_shabiya_cities.sql.',
      added === 0
    );
    if (added > 0) {
      MC.scheduleApiMsgAutoHide(5000);
    }
  }

  function loadPlacesForShabiyaBounds(b) {
    state.cityPlaceByName = {};
    if (state.cityPlacesLayer) {
      state.cityPlacesLayer.clearLayers();
    }
    dispatchCityPlacesUpdated([]);
    if (!b || !b.isValid() || !state.cityPlacesLayer) {
      return;
    }
    abortPlacesFetch();
    placesLoadGeneration += 1;
    var gen = placesLoadGeneration;

    var shName = state.lastShabiyaDetail && state.lastShabiyaDetail.name ? String(state.lastShabiyaDetail.name).trim() : '';
    var shCode = state.lastShabiyaDetail && state.lastShabiyaDetail.code ? String(state.lastShabiyaDetail.code).trim() : '';

    MC.showApiMsg('جارٍ تحميل الأماكن…', false);

    var localRows = lookupLocalPlaces(shName, shCode);
    var ingestL = [];
    for (var li = 0; li < localRows.length; li++) {
      var pw = localRows[li];
      ingestL.push({
        name: pw.name ? String(pw.name).trim() : '',
        lat: pw.lat,
        lng: pw.lng,
        type: pw.type || 'town'
      });
    }
    var resL = ingestPlaceRows(ingestL, gen, b, true);
    showPlacesOutcomeMessage(gen, resL.added, true);
    dispatchCityPlacesUpdated(resL.names);
  }

  function applyShabiyaSelectedStyle(layer) {
    if (!layer) { return; }
    layer.setStyle({
      pane: 'shabiyatPane',
      color: '#cffafe',
      weight: 2.5,
      opacity: 1,
      fillColor: '#0891b2',
      fillOpacity: 0.32,
      dashArray: null,
      lineJoin: 'round',
      lineCap: 'round'
    });
  }

  function setShabiyaLayerSelected(layer) {
    if (state.selectedShabiyaLayer && state.selectedShabiyaLayer !== layer && state.shabiyatLayer && typeof state.shabiyatLayer.resetStyle === 'function') {
      state.shabiyatLayer.resetStyle(state.selectedShabiyaLayer);
    }
    state.selectedShabiyaLayer = layer;
    if (layer) {
      applyShabiyaSelectedStyle(layer);
    }
  }

  function findShabiyaLayerByNameProv(name, provinceLetter) {
    if (!state.shabiyatLayer || !name) {
      return null;
    }
    var nm = String(name).trim();
    var pr = String(provinceLetter || '').trim();
    var found = null;
    state.shabiyatLayer.eachLayer(function (layer) {
      var p = (layer.feature && layer.feature.properties) || {};
      if (String(p.name || '').trim() === nm && String(p.province || '').trim() === pr) {
        found = layer;
      }
    });
    return found;
  }

  function focusShabiyaFromFormImpl(name, provinceLetter) {
    if (readOnly) { return true; }
    var layer = findShabiyaLayerByNameProv(name, provinceLetter);
    if (!layer) { return false; }
    var b = null;
    try { b = layer.getBounds(); } catch (eGb) { b = null; }
    if (map && b && b.isValid()) {
      if (typeof map.stop === 'function') {
        map.stop();
      }
      map.flyToBounds(b, {
        paddingTopLeft: [44, 72],
        paddingBottomRight: [44, 44],
        maxZoom: Math.min(maxZ, 11),
        duration: 0.55
      });
    }
    setShabiyaLayerSelected(layer);
    var p = (layer.feature && layer.feature.properties) || {};
    state.lastShabiyaDetail = {
      province: p.province || provinceLetter || '',
      n: p.n,
      name: String(name || '').trim() || String(p.name || '').trim() || '',
      code: String(p.code || '').trim()
    };
    state.selectedPlace = null;
    if (b && b.isValid()) {
      loadPlacesForShabiyaBounds(b);
    }
    MC.syncMarkerCtaReveal();
    return true;
  }

  window.addEventListener('addr-shabiya-from-form', function (ev) {
    if (readOnly || !ev || !ev.detail) { return; }
    var name0 = String(ev.detail.name || '').trim();
    var prov0 = String(ev.detail.province || '').trim();
    if (!name0 || !prov0) { return; }
    if (focusShabiyaFromFormImpl(name0, prov0)) { return; }
    var tries0 = 0;
    var t0 = setInterval(function () {
      tries0++;
      if (focusShabiyaFromFormImpl(name0, prov0) || tries0 > 34) {
        clearInterval(t0);
      }
    }, 120);
  });

  function shabiyaStyle(feature) {
    var p = (feature && feature.properties) || {};
    var prov = String(p.province || '');
    var stroke = '#e2e8f0';
    if (prov === 'B') { stroke = '#fcd34d'; }
    else if (prov === 'T') { stroke = '#86efac'; }
    else if (prov === 'F') { stroke = '#fda4af'; }
    return {
      pane: 'shabiyatPane',
      color: stroke,
      weight: 1.1,
      opacity: 0.85,
      fillColor: stroke,
      fillOpacity: 0.08,
      dashArray: null,
      lineJoin: 'round',
      lineCap: 'round'
    };
  }

  function shabiyaHoverStyle() {
    return { weight: 2.2, opacity: 1, fillOpacity: 0.22 };
  }

  if (shabiyatUrl) {
    fetch(resolveMaskUrl(shabiyatUrl), { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) { throw new Error('shabiyat http ' + r.status); }
        return r.json();
      })
      .then(function (geo) {
        if (!geo || !Array.isArray(geo.features)) { return; }
        state.shabiyatLayer = L.geoJSON(geo, {
          pane: 'shabiyatPane',
          style: shabiyaStyle,
          onEachFeature: function (feature, layer) {
            var p = (feature && feature.properties) || {};
            var code = p.code || '';
            var name = p.name || '';
            if (code || name) {
              layer.bindTooltip(code + (name ? ' — ' + name : ''), {
                sticky: true,
                direction: 'top',
                className: 'shabiya-tooltip'
              });
            }
            layer.on('mouseover', function () {
              if (layer === state.selectedShabiyaLayer) {
                layer.setStyle({
                  weight: 3,
                  fillOpacity: 0.4,
                  color: '#ecfeff',
                  fillColor: '#0e7490'
                });
              } else {
                layer.setStyle(shabiyaHoverStyle(p.province));
              }
              if (layer.bringToFront) {
                layer.bringToFront();
              }
            });
            layer.on('mouseout', function () {
              if (layer === state.selectedShabiyaLayer) {
                applyShabiyaSelectedStyle(layer);
              } else if (state.shabiyatLayer && typeof state.shabiyatLayer.resetStyle === 'function') {
                state.shabiyatLayer.resetStyle(layer);
              }
            });
            layer.on('click', function (e) {
              var ll = e.latlng || null;
              var b = null;
              try { b = layer.getBounds(); } catch (eGB) { b = null; }

              if (!readOnly && state.drawMode === 'parcel') {
                if (L && L.DomEvent) { L.DomEvent.stopPropagation(e); }
                if (ll && bounds.contains(ll) && typeof state.drawClickHandler === 'function') {
                  state.drawClickHandler(ll);
                }
                return;
              }

              if (!readOnly && state.markerModePending && ll && bounds.contains(ll)) {
                if (L && L.DomEvent) { L.DomEvent.stopPropagation(e); }
                if (map && typeof map.stop === 'function') {
                  map.stop();
                }
                MC.placeAddressMarker(ll);
                state.markerModePending = false;
                MC.syncMarkerModeButton();
                MC.syncMarkerCtaReveal();
                return;
              }

              if (L && L.DomEvent) { L.DomEvent.stopPropagation(e); }

              if (b && b.isValid()) {
                map.flyToBounds(b, {
                  paddingTopLeft: [44, 72],
                  paddingBottomRight: [44, 44],
                  maxZoom: Math.min(maxZ, 11),
                  duration: 0.55
                });
              }

              setShabiyaLayerSelected(layer);
              state.lastShabiyaDetail = {
                province: p.province || '',
                n: p.n,
                name: p.name || '',
                code: p.code || ''
              };
              state.selectedPlace = null;

              if (readOnly) {
                if (b && b.isValid()) {
                  loadPlacesForShabiyaBounds(b);
                }
                return;
              }

              window.dispatchEvent(
                new CustomEvent('addr-map-fill', {
                  detail: {
                    level: 'shabiya',
                    province: p.province || '',
                    area: p.n,
                    place: p.name || '',
                    code: p.code || ''
                  }
                })
              );
              window.dispatchEvent(
                new CustomEvent('addr-shabiya-select', {
                  detail: {
                    province: p.province || '',
                    n: p.n,
                    code: p.code || '',
                    name: p.name || '',
                    bounds: b ? {
                      south: b.getSouth(),
                      west: b.getWest(),
                      north: b.getNorth(),
                      east: b.getEast()
                    } : null
                  }
                })
              );
              if (b && b.isValid()) {
                loadPlacesForShabiyaBounds(b);
              }
              MC.syncMarkerCtaReveal();
            });
          }
        }).addTo(map);
      })
      .catch(function () {});
  }

  /* Clear-from-core hook: when clearMapSelection runs, also drop our places. */
  var origClearMapSelection = MC.clearMapSelection;
  MC.clearMapSelection = function () {
    clearCityPlaces();
    origClearMapSelection();
  };

  window.addEventListener('addr-map-new-scene', function (ev) {
    var detail = ev && ev.detail ? ev.detail : {};
    var keep = !!detail.keepShubiyaContext && !readOnly && String(detail.shabiyaName || '').trim() !== '';

    /* annotations are managed by parcel module; we only handle shabiya/scene. */
    window.dispatchEvent(new Event('addr-map-clear-annotations'));

    if (readOnly) {
      state.markerModePending = false;
      MC.syncMarkerModeButton();
      return;
    }

    if (keep) {
      state.markerModePending = false;
      MC.syncMarkerModeButton();
      var nm = String(detail.shabiyaName || '').trim();
      var pl = String(detail.provinceLetter || '').trim();
      var okFocus = !!(nm && pl && focusShabiyaFromFormImpl(nm, pl));
      if (!okFocus && detail.wilayahKey) {
        MC.flyToWilayahKey(detail.wilayahKey);
      }
      return;
    }

    window.dispatchEvent(new Event('addr-map-reset'));
  });
})();
