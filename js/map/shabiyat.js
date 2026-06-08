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
  state.cityBoundariesLayer = L.layerGroup().addTo(map);

  var placesFetchAbort = null;
  var placesLoadGeneration = 0;
  var cityBoundariesFetchAbort = null;
  var cityBoundariesGeneration = 0;
  var regions = MC.regions || [];
  var borderPulseTimers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var borderPulseTick = {};

  function provincePalette(prov) {
    var p = String(prov || '').toUpperCase();
    if (p === 'B') {
      return { stroke: '#fcd34d', fill: '#ca8a04', strokeHover: '#f59e0b', fillHover: '#92400e' };
    }
    if (p === 'T') {
      return { stroke: '#86efac', fill: '#22c55e', strokeHover: '#4ade80', fillHover: '#166534' };
    }
    if (p === 'F') {
      return { stroke: '#fda4af', fill: '#f43f5e', strokeHover: '#fb7185', fillHover: '#9f1239' };
    }
    return { stroke: '#e2e8f0', fill: '#94a3b8', strokeHover: '#cbd5e1', fillHover: '#475569' };
  }

  function stopBorderPulse(layer) {
    if (!layer) { return; }
    if (borderPulseTimers) {
      var t = borderPulseTimers.get(layer);
      if (t) {
        clearInterval(t);
        borderPulseTimers.delete(layer);
      }
      return;
    }
    if (layer._leaflet_id && borderPulseTick[layer._leaflet_id]) {
      clearInterval(borderPulseTick[layer._leaflet_id]);
      delete borderPulseTick[layer._leaflet_id];
    }
  }

  function startBorderPulse(layer, hoverStyle) {
    stopBorderPulse(layer);
    var pulseOn = true;
    var heavy = Object.assign({}, hoverStyle, {
      weight: (hoverStyle.weight || 2.5) + 1.3,
      opacity: 1
    });
    var light = Object.assign({}, hoverStyle, {
      weight: hoverStyle.weight || 2.5,
      opacity: 0.68
    });
    var tick = function () {
      if (!layer._map) {
        stopBorderPulse(layer);
        return;
      }
      pulseOn = !pulseOn;
      layer.setStyle(pulseOn ? heavy : light);
    };
    tick();
    var id = setInterval(tick, 400);
    if (borderPulseTimers) {
      borderPulseTimers.set(layer, id);
    } else {
      borderPulseTick[layer._leaflet_id] = id;
    }
  }

  function shabiyaDimStyle(prov) {
    var pal = provincePalette(prov);
    return {
      pane: 'shabiyatPane',
      color: pal.stroke,
      weight: 0.9,
      opacity: 0.28,
      fillColor: pal.stroke,
      fillOpacity: 0.02,
      dashArray: '4 6',
      lineJoin: 'round',
      lineCap: 'round'
    };
  }

  function shabiyaHoverStyle(prov) {
    var pal = provincePalette(prov);
    return {
      pane: 'shabiyatPane',
      color: pal.strokeHover,
      weight: 3,
      opacity: 1,
      fillColor: pal.fillHover,
      fillOpacity: 0.44,
      dashArray: null,
      lineJoin: 'round',
      lineCap: 'round'
    };
  }

  var WILKEY_TO_STATE_ID = { barqa: 2, tripolitania: 1, fezzan: 3 };

  /** Match boundary editor palette: use saved `properties.color` when set. */
  function boundaryFeatureStyle(p, emphasis) {
    var props = p || {};
    var isGrid = !!props.is_grid;
    var custom = props.color ? String(props.color).trim() : '';
    var style;
    if (custom) {
      style = {
        pane: 'cityBoundPane',
        color: custom,
        weight: isGrid ? 1.8 : 1.6,
        opacity: 0.92,
        fillColor: custom,
        fillOpacity: isGrid ? 0.2 : 0.15,
        dashArray: isGrid ? '5,4' : null,
        lineJoin: 'round',
        lineCap: 'round'
      };
    } else if (isGrid) {
      style = {
        pane: 'cityBoundPane',
        color: '#b45309',
        weight: 1.6,
        opacity: 0.85,
        fillColor: '#fbbf24',
        fillOpacity: 0.14,
        dashArray: '5,4',
        lineJoin: 'round',
        lineCap: 'round'
      };
    } else {
      style = {
        pane: 'cityBoundPane',
        color: '#94a3b8',
        weight: 1.2,
        opacity: 0.85,
        fillColor: '#94a3b8',
        fillOpacity: 0.06,
        dashArray: '4,4',
        lineJoin: 'round',
        lineCap: 'round'
      };
    }
    if (emphasis) {
      style.weight = (style.weight || 1.2) + 0.8;
      style.opacity = Math.min(1, (style.opacity || 0.85) + 0.08);
      style.fillOpacity = Math.min(0.42, (style.fillOpacity || 0.1) + 0.14);
      if (!style.dashArray && !custom) {
        style.dashArray = '5,4';
      }
    }
    return style;
  }

  function boundaryFeatureHoverStyle(base) {
    var color = (base && (base.fillColor || base.color)) || '#38bdf8';
    return {
      pane: 'cityBoundPane',
      color: color,
      weight: (base && base.weight ? base.weight : 1.2) + 1.6,
      opacity: 1,
      fillColor: color,
      fillOpacity: Math.min(0.52, ((base && base.fillOpacity) || 0.06) + 0.34),
      dashArray: null,
      lineJoin: 'round',
      lineCap: 'round'
    };
  }

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

  function abortCityBoundariesFetch() {
    if (cityBoundariesFetchAbort) {
      try { cityBoundariesFetchAbort.abort(); } catch (eCab) {}
      cityBoundariesFetchAbort = null;
    }
  }

  function clearCityBoundaries() {
    cityBoundariesGeneration += 1;
    abortCityBoundariesFetch();
    if (state.cityBoundariesLayer) {
      state.cityBoundariesLayer.clearLayers();
    }
  }

  function boundaryFeatureEntityId(feature) {
    var p = feature && feature.properties ? feature.properties : {};
    return parseInt(p.entity_id, 10) || 0;
  }

  function filterBoundaryFeatures(features, entityId) {
    var list = Array.isArray(features) ? features : [];
    if (!entityId || entityId < 1) {
      return list;
    }
    var want = Number(entityId);
    var out = [];
    for (var fi = 0; fi < list.length; fi++) {
      if (boundaryFeatureEntityId(list[fi]) === want) {
        out.push(list[fi]);
      }
    }
    return out;
  }

  function flyToBoundaryFeatureBounds(features) {
    if (!map || !features || !features.length) {
      return;
    }
    var tmp = L.geoJSON({ type: 'FeatureCollection', features: features });
    var bb = null;
    try {
      bb = tmp.getBounds();
    } catch (eBb) {
      bb = null;
    }
    if (tmp.remove) {
      tmp.remove();
    } else if (map && map.removeLayer) {
      map.removeLayer(tmp);
    }
    if (!bb || !bb.isValid()) {
      return;
    }
    if (typeof map.stop === 'function') {
      map.stop();
    }
    map.flyToBounds(bb, {
      paddingTopLeft: [56, 92],
      paddingBottomRight: [56, 56],
      maxZoom: Math.min(maxZ, 9),
      duration: 0.6
    });
  }

  function dimShabiyatOutsideProvince(provLetter) {
    if (!state.shabiyatLayer) {
      return;
    }
    var want = String(provLetter || '').trim();
    state.shabiyatLayer.eachLayer(function (layer) {
      var p = (layer.feature && layer.feature.properties) || {};
      if (!want || String(p.province || '').trim() === want) {
        layer.setStyle(shabiyaDimStyle(p.province));
        if (layer.bringToFront) {
          layer.bringToFront();
        }
        return;
      }
      layer.setStyle({
        pane: 'shabiyatPane',
        color: '#64748b',
        weight: 0.6,
        opacity: 0.12,
        fillColor: '#334155',
        fillOpacity: 0.01,
        dashArray: '4 8',
        lineJoin: 'round',
        lineCap: 'round'
      });
    });
    state.selectedShabiyaLayer = null;
  }

  function renderBoundaryFeatures(features, onCityClick, renderOpts) {
    renderOpts = renderOpts || {};
    if (!state.cityBoundariesLayer || !features || !features.length) {
      return;
    }
    var emphasis = !!renderOpts.emphasis;
    L.geoJSON(
      { type: 'FeatureCollection', features: features },
      {
        style: function (feature) {
          return boundaryFeatureStyle(feature && feature.properties, emphasis);
        },
        onEachFeature: function (feature, layer) {
          var p = (feature && feature.properties) || {};
          var baseStyle = boundaryFeatureStyle(p, emphasis);
          layer._addrBoundaryBaseStyle = baseStyle;
          var nm = String(p.name || '').trim();
          if (!nm) { return; }
          layer.bindTooltip(nm, { sticky: true, direction: 'center', className: 'shabiya-tooltip' });
          layer.on('mouseover', function () {
            startBorderPulse(layer, boundaryFeatureHoverStyle(baseStyle));
            if (layer.bringToFront) { layer.bringToFront(); }
          });
          layer.on('mouseout', function () {
            stopBorderPulse(layer);
            layer.setStyle(Object.assign({}, layer._addrBoundaryBaseStyle || baseStyle));
          });
          if (typeof onCityClick === 'function') {
            layer.on('click', function (ev) {
              var c = null;
              try {
                c = layer.getBounds().getCenter();
              } catch (eC) { c = null; }
              onCityClick(nm, c ? c.lat : NaN, c ? c.lng : NaN, ev, boundaryFeatureEntityId(feature));
            });
          }
        }
      }
    ).addTo(state.cityBoundariesLayer);
  }

  function fetchBoundaryList(level, parentId, gen, entityId, onCityClick, fetchOpts) {
    fetchOpts = fetchOpts || {};
    if (!parentId || !state.cityBoundariesLayer) {
      return;
    }
    var seq = ++cityBoundariesGeneration;
    var ctrl = null;
    if (typeof AbortController !== 'undefined') {
      ctrl = new AbortController();
      cityBoundariesFetchAbort = ctrl;
    }
    var url =
      'index.php?r=boundary_list&level=' +
      encodeURIComponent(String(level)) +
      '&parent_id=' +
      encodeURIComponent(String(parentId));
    fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) {
        if (!r.ok) { throw new Error('boundary_list http ' + r.status); }
        return r.json();
      })
      .then(function (fc) {
        if (seq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
          return;
        }
        if (!fc || !Array.isArray(fc.features) || !fc.features.length) {
          return;
        }
        var feats = filterBoundaryFeatures(fc.features, entityId);
        if (!feats.length) {
          return;
        }
        renderBoundaryFeatures(feats, onCityClick || null, {
          emphasis: !!fetchOpts.emphasis
        });
        if (fetchOpts.flyTo) {
          flyToBoundaryFeatureBounds(feats);
        }
      })
      .catch(function () {});
  }

  function showWilayahRegionGrids(wilayahKey) {
    clearCityBoundaries();
    if (state.cityPlacesLayer) {
      state.cityPlacesLayer.clearLayers();
    }
    state.cityPlaceByName = {};
    dispatchCityPlacesUpdated([]);
    var wk = String(wilayahKey || '').trim();
    var stateId = WILKEY_TO_STATE_ID[wk];
    var prov = MC.WILKEY_TO_PROV_FORM && MC.WILKEY_TO_PROV_FORM[wk] ? MC.WILKEY_TO_PROV_FORM[wk] : '';
    if (!stateId) {
      resetShabiyatLayerStyles();
      return;
    }
    dimShabiyatOutsideProvince(prov);
    fetchBoundaryList('region', stateId, placesLoadGeneration, 0, null, {
      emphasis: true,
      flyTo: true
    });
    if (MC.flyToWilayahKey) {
      MC.flyToWilayahKey(wk);
    }
  }

  function showCityBoundaryOnly(cityId, regionId) {
    clearCityBoundaries();
    if (!cityId || !regionId) {
      return;
    }
    fetchBoundaryList('city', regionId, placesLoadGeneration, cityId, function (nm, lat0, lng0, ev, entityId) {
      if (entityId > 0) {
        showCityBoundaryOnly(entityId, regionId);
      }
      handleCityBoundaryClick(nm, lat0, lng0, ev);
    });
  }

  function showBlockBoundaryOnly(level, entityId, parentId) {
    clearCityBoundaries();
    if (!level || !entityId || !parentId) {
      return;
    }
    fetchBoundaryList(level, parentId, placesLoadGeneration, entityId, null);
  }

  MC.showCityBoundaryOnly = showCityBoundaryOnly;
  MC.showBlockBoundaryOnly = showBlockBoundaryOnly;
  MC.showWilayahRegionGrids = showWilayahRegionGrids;

  function clearCityPlaces() {
    state.cityPlaceByName = {};
    if (state.cityPlacesLayer) {
      state.cityPlacesLayer.clearLayers();
    }
    clearCityBoundaries();
    dispatchCityPlacesUpdated([]);
    abortPlacesFetch();
  }
  MC.clearCityPlaces = clearCityPlaces;
  MC.cancelPlacesLoadMessage = cancelPlacesLoadMessage;

  /**
   * Clear city grids/places when wilayah / shabiya / city selection changes.
   * @param {{clearPlaces?: boolean, resetShabiya?: boolean, keepShabiyaDetail?: boolean, clearSelectedPlace?: boolean}} opts
   */
  function resetMapLayersForHierarchyChange(opts) {
    opts = opts || {};
    cancelPlacesLoadMessage();
    clearCityBoundaries();
    if (opts.clearPlaces !== false) {
      state.cityPlaceByName = {};
      if (state.cityPlacesLayer) {
        state.cityPlacesLayer.clearLayers();
      }
      dispatchCityPlacesUpdated([]);
      abortPlacesFetch();
      placesLoadGeneration += 1;
    }
    if (opts.resetShabiya !== false) {
      state.selectedShabiyaLayer = null;
      if (!opts.keepShabiyaDetail) {
        state.lastShabiyaDetail = null;
      }
      resetShabiyatLayerStyles();
    }
    if (opts.clearSelectedPlace !== false) {
      state.selectedPlace = null;
    }
    MC.syncMarkerCtaReveal();
  }
  MC.resetMapLayersForHierarchyChange = resetMapLayersForHierarchyChange;

  function lookupRegionMeta(code, areaN) {
    var c = code ? String(code).trim().toUpperCase() : '';
    var n = areaN != null && areaN !== '' ? Number(areaN) : NaN;
    for (var ri = 0; ri < regions.length; ri++) {
      var row = regions[ri];
      if (!row) { continue; }
      if (c && String(row.code || '').trim().toUpperCase() === c) {
        return row;
      }
      if (n === n && Number(row.n) === n) {
        return row;
      }
    }
    return null;
  }

  function collectLocalPlaceRows(shName, shCode) {
    var localRows = lookupLocalPlaces(shName, shCode);
    var out = [];
    for (var li = 0; li < localRows.length; li++) {
      var pw = localRows[li];
      out.push({
        name: pw.name ? String(pw.name).trim() : '',
        lat: pw.lat,
        lng: pw.lng,
        type: pw.type || 'town'
      });
    }
    return out;
  }

  function computeShabiyaFocusBounds(layer, placeRows, regionMeta) {
    var pts = [];
    var i;
    for (i = 0; i < placeRows.length; i++) {
      var row = placeRows[i];
      var plat = Number(row && row.lat);
      var plng = Number(row && row.lng);
      if (!row || !row.name || plat !== plat || plng !== plng) {
        continue;
      }
      var ll = L.latLng(plat, plng);
      if (!bounds.contains(ll)) {
        continue;
      }
      pts.push(ll);
    }
    if (pts.length > 1) {
      var cluster = L.latLngBounds(pts);
      return cluster.pad(0.14);
    }
    if (pts.length === 1) {
      var p0 = pts[0];
      return L.latLngBounds(
        [p0.lat - 0.055, p0.lng - 0.055],
        [p0.lat + 0.055, p0.lng + 0.055]
      );
    }
    if (regionMeta && typeof regionMeta.lat === 'number' && typeof regionMeta.lng === 'number') {
      var pad = 0.16;
      return L.latLngBounds(
        [regionMeta.lat - pad, regionMeta.lng - pad],
        [regionMeta.lat + pad, regionMeta.lng + pad]
      );
    }
    if (layer) {
      try {
        var lb = layer.getBounds();
        if (lb && lb.isValid()) {
          return lb;
        }
      } catch (eLb) {}
    }
    return null;
  }

  function maxZoomForFocusBounds(bb) {
    if (!bb || !bb.isValid()) {
      return Math.min(maxZ, 11);
    }
    var span = Math.max(bb.getNorth() - bb.getSouth(), bb.getEast() - bb.getWest());
    if (span < 0.07) { return Math.min(maxZ, 14); }
    if (span < 0.16) { return Math.min(maxZ, 13); }
    if (span < 0.35) { return Math.min(maxZ, 12); }
    if (span < 0.7) { return Math.min(maxZ, 11); }
    if (span < 1.4) { return Math.min(maxZ, 10); }
    if (span < 2.8) { return Math.min(maxZ, 9); }
    return Math.min(maxZ, 8);
  }

  function flyToShabiyaFocus(focusBounds, polygonBounds) {
    if (!map || !focusBounds || !focusBounds.isValid()) {
      return;
    }
    if (typeof map.stop === 'function') {
      map.stop();
    }
    var zCap = maxZoomForFocusBounds(focusBounds);
    map.flyToBounds(focusBounds, {
      paddingTopLeft: [56, 92],
      paddingBottomRight: [56, 56],
      maxZoom: zCap,
      duration: 0.6
    });
  }

  function dimUnselectedShabiyat(selectedLayer) {
    if (!state.shabiyatLayer) {
      return;
    }
    state.shabiyatLayer.eachLayer(function (layer) {
      if (layer === selectedLayer) {
        applyShabiyaSelectedStyle(layer);
        if (layer.bringToFront) {
          layer.bringToFront();
        }
        return;
      }
      var p = (layer.feature && layer.feature.properties) || {};
      layer.setStyle(shabiyaDimStyle(p.province));
    });
  }

  function resetShabiyatLayerStyles() {
    if (state.shabiyatLayer && typeof state.shabiyatLayer.resetStyle === 'function') {
      state.shabiyatLayer.resetStyle();
    }
  }

  function handleCityBoundaryClick(name, lat0, lng0, ev) {
    if (L && L.DomEvent && ev) { L.DomEvent.stopPropagation(ev); }
    var nameStr = String(name || '').trim();
    if (!nameStr) { return; }
    var rec = state.cityPlaceByName[nameStr];
    var lat = rec && isFinite(rec.lat) ? rec.lat : lat0;
    var lng = rec && isFinite(rec.lng) ? rec.lng : lng0;
    var type0 = rec && rec.type ? rec.type : 'city';
    var ll = L.latLng(lat, lng);
    if (!readOnly && state.drawMode === 'parcel') {
      if (bounds.contains(ll) && typeof state.drawClickHandler === 'function') {
        state.drawClickHandler(ll);
      }
      return;
    }
    if (!readOnly && state.markerModePending) {
      if (bounds.contains(ll)) {
        if (map && typeof map.stop === 'function') {
          map.stop();
        }
        state.selectedPlace = { name: nameStr, lat: lat, lng: lng, type: type0 };
        MC.placeAddressMarker(ll);
        state.markerModePending = false;
        MC.syncMarkerModeButton();
        MC.syncMarkerCtaReveal();
      }
      return;
    }
    state.selectedPlace = { name: nameStr, lat: lat, lng: lng, type: type0 };
    MC.flyToPlace(lat, lng, type0);
    window.dispatchEvent(
      new CustomEvent('addr-place-select', { detail: { name: nameStr, lat: lat, lng: lng, type: type0 } })
    );
    MC.syncMarkerCtaReveal();
  }

  function loadCityBoundariesForRegion(regionId, gen) {
    clearCityBoundaries();
    if (!regionId || !state.cityBoundariesLayer) {
      return;
    }
    fetchBoundaryList('city', regionId, gen, 0, function (nm, lat0, lng0, ev, entityId) {
      var shN = state.lastShabiyaDetail && state.lastShabiyaDetail.n != null ? state.lastShabiyaDetail.n : '';
      if (entityId > 0 && shN !== '' && shN != null) {
        showCityBoundaryOnly(entityId, shN);
      }
      handleCityBoundaryClick(nm, lat0, lng0, ev);
    });
  }

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
    cm.on('mouseover', function () {
      cm.setStyle({
        radius: 8,
        weight: 2.5,
        color: '#082f49',
        fillColor: '#d97706',
        fillOpacity: 1
      });
      if (cm.bringToFront) { cm.bringToFront(); }
    });
    cm.on('mouseout', function () {
      cm.setStyle({
        radius: 5,
        weight: 1.5,
        color: '#0c4a6e',
        fillColor: '#fcd34d',
        fillOpacity: 0.92
      });
    });
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
        : 'لا توجد أماكن مسجّلة لهذه الشعبية في قاعدة البيانات. نفّذ database/seeds/03_shabiya_cities.sql.',
      added === 0
    );
    if (added > 0) {
      MC.scheduleApiMsgAutoHide(5000);
    }
  }

  function loadPlacesForShabiyaBounds(b, polygonBounds) {
    state.cityPlaceByName = {};
    if (state.cityPlacesLayer) {
      state.cityPlacesLayer.clearLayers();
    }
    clearCityBoundaries();
    dispatchCityPlacesUpdated([]);
    if (!state.cityPlacesLayer) {
      return;
    }
    abortPlacesFetch();
    placesLoadGeneration += 1;
    var gen = placesLoadGeneration;

    var shName = state.lastShabiyaDetail && state.lastShabiyaDetail.name ? String(state.lastShabiyaDetail.name).trim() : '';
    var shCode = state.lastShabiyaDetail && state.lastShabiyaDetail.code ? String(state.lastShabiyaDetail.code).trim() : '';
    var shN = state.lastShabiyaDetail && state.lastShabiyaDetail.n != null ? state.lastShabiyaDetail.n : '';

    MC.showApiMsg('جارٍ تحميل الأماكن…', false);

    var ingestL = collectLocalPlaceRows(shName, shCode);
    var filterB = polygonBounds && polygonBounds.isValid() ? polygonBounds : (b && b.isValid() ? b : null);
    var resL = ingestPlaceRows(ingestL, gen, filterB, true);
    showPlacesOutcomeMessage(gen, resL.added, true);
    dispatchCityPlacesUpdated(resL.names);
    if (shN !== '' && shN != null) {
      loadCityBoundariesForRegion(shN, gen);
    }
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
    state.selectedShabiyaLayer = layer;
    if (layer) {
      dimUnselectedShabiyat(layer);
    } else {
      resetShabiyatLayerStyles();
    }
  }

  function findShabiyaLayer(name, provinceLetter, code) {
    if (!state.shabiyatLayer) {
      return null;
    }
    var nm = name ? String(name).trim() : '';
    var pr = String(provinceLetter || '').trim();
    var cd = code ? String(code).trim().toUpperCase() : '';
    var found = null;
    state.shabiyatLayer.eachLayer(function (layer) {
      var p = (layer.feature && layer.feature.properties) || {};
      if (cd && String(p.code || '').trim().toUpperCase() === cd) {
        found = layer;
        return;
      }
      if (nm && String(p.name || '').trim() === nm && String(p.province || '').trim() === pr) {
        found = layer;
      }
    });
    return found;
  }

  function focusShabiyaLayer(layer, nameHint, provinceLetter, codeHint) {
    if (!layer) {
      return false;
    }
    try {
      window.dispatchEvent(new Event('addr-map-clear-annotations'));
    } catch (eAnn) {}
    resetMapLayersForHierarchyChange({
      clearPlaces: true,
      resetShabiya: false,
      keepShabiyaDetail: true,
      clearSelectedPlace: true
    });
    var polygonBounds = null;
    try {
      polygonBounds = layer.getBounds();
    } catch (eGb) {
      polygonBounds = null;
    }
    var p = (layer.feature && layer.feature.properties) || {};
    var detail = {
      province: p.province || provinceLetter || '',
      n: p.n,
      name: String(nameHint || '').trim() || String(p.name || '').trim() || '',
      code: String(codeHint || '').trim() || String(p.code || '').trim()
    };
    state.lastShabiyaDetail = detail;
    state.selectedPlace = null;

    var placeRows = collectLocalPlaceRows(detail.name, detail.code);
    var regionMeta = lookupRegionMeta(detail.code, detail.n);
    var focusBounds = computeShabiyaFocusBounds(layer, placeRows, regionMeta);
    if (focusBounds && focusBounds.isValid()) {
      flyToShabiyaFocus(focusBounds, polygonBounds);
    }

    setShabiyaLayerSelected(layer);
    loadPlacesForShabiyaBounds(focusBounds || polygonBounds, polygonBounds);
    MC.syncMarkerCtaReveal();
    return true;
  }

  function focusShabiyaFromFormImpl(name, provinceLetter, codeHint) {
    if (readOnly) { return true; }
    var layer = findShabiyaLayer(name, provinceLetter, codeHint);
    if (!layer) { return false; }
    return focusShabiyaLayer(layer, name, provinceLetter, codeHint);
  }

  window.addEventListener('addr-shabiya-from-form', function (ev) {
    if (readOnly || !ev || !ev.detail) { return; }
    var name0 = String(ev.detail.name || '').trim();
    var prov0 = String(ev.detail.province || '').trim();
    var code0 = String(ev.detail.code || '').trim();
    if ((!name0 && !code0) || !prov0) { return; }
    if (focusShabiyaFromFormImpl(name0, prov0, code0)) { return; }
    var tries0 = 0;
    var t0 = setInterval(function () {
      tries0++;
      if (focusShabiyaFromFormImpl(name0, prov0, code0) || tries0 > 34) {
        clearInterval(t0);
      }
    }, 120);
  });

  function shabiyaStyle(feature) {
    var p = (feature && feature.properties) || {};
    var pal = provincePalette(p.province);
    return {
      pane: 'shabiyatPane',
      color: pal.stroke,
      weight: 1.1,
      opacity: 0.85,
      fillColor: pal.fill,
      fillOpacity: 0.1,
      dashArray: null,
      lineJoin: 'round',
      lineCap: 'round'
    };
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
                startBorderPulse(layer, {
                  pane: 'shabiyatPane',
                  color: '#a5f3fc',
                  weight: 3.4,
                  opacity: 1,
                  fillColor: '#0e7490',
                  fillOpacity: 0.54,
                  dashArray: null,
                  lineJoin: 'round',
                  lineCap: 'round'
                });
              } else {
                startBorderPulse(layer, shabiyaHoverStyle(p.province));
              }
              if (layer.bringToFront) {
                layer.bringToFront();
              }
            });
            layer.on('mouseout', function () {
              stopBorderPulse(layer);
              if (layer === state.selectedShabiyaLayer) {
                applyShabiyaSelectedStyle(layer);
              } else if (state.selectedShabiyaLayer) {
                layer.setStyle(shabiyaDimStyle(p.province));
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

              focusShabiyaLayer(layer, p.name || '', p.province || '', p.code || '');

              if (readOnly) {
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
    resetShabiyatLayerStyles();
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
