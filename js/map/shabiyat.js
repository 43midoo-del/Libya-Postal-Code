/**
 * Shabiyat layer: GeoJSON polygons, hover/click, city places loading (local DB only),
 * focus-from-form handler, new-scene reset handler.
 */
(function bootShabiyatModule(retry) {
  'use strict';

  if (!window.MapCore || !window.MapCore.map) {
    if ((retry || 0) < 80) {
      setTimeout(function () {
        bootShabiyatModule((retry || 0) + 1);
      }, 40);
    }
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
  state.boundaryLabelLayer = L.layerGroup().addTo(map);

  var placesFetchAbort = null;
  var placesLoadGeneration = 0;
  var cityBoundariesFetchAbort = null;
  var cityBoundariesGeneration = 0;
  var regions = MC.regions || [];
  var borderPulseTimers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var borderPulseTick = {};
  var NEIGHBORHOOD_VIEW_EXTRA_ZOOM = 3;
  var PILOT_SHABIYA_CODE = 'B2';
  var PILOT_AREA_EXIT_MIN_ZOOM = 14;

  function isPilotShabiya(name, code) {
    var c = String(code || '').trim().toUpperCase();
    if (c === PILOT_SHABIYA_CODE) {
      return true;
    }
    var nm = String(name || '').trim();
    if (!nm) {
      return false;
    }
    return nm === 'درنة' || nm.indexOf('درنة') === 0;
  }

  function blockNonPilotShabiya(name, code) {
    if (isPilotShabiya(name, code)) {
      return false;
    }
    if (MC.showPilotTrialNotice) {
      MC.showPilotTrialNotice();
    } else if (MC.showApiMsg) {
      MC.showApiMsg('قريباً — فترة تجريبية في شعبية درنة فقط.', false);
      if (MC.scheduleApiMsgAutoHide) {
        MC.scheduleApiMsgAutoHide(4200);
      }
    }
    return true;
  }
  MC.isPilotShabiya = isPilotShabiya;
  MC.blockNonPilotShabiya = blockNonPilotShabiya;

  function matchesPilotPrimaryCityName(name) {
    return normalizeCityLabel(name) === 'درنة';
  }

  function setPilotDernaGridMapClass(active) {
    var wrap = document.querySelector('.map-canvas-wrap--mgr');
    if (wrap) {
      wrap.classList.toggle('map-canvas-wrap--pilot-derna-grid', !!active);
    }
  }

  function pilotDernaDocumentationStyle(props, part) {
    var lvl = String(part || (props && props.level) || '');
    if (lvl === 'city' || part === 'shell') {
      var savedStroke = props && props.color ? String(props.color).trim() : '';
      return {
        pane: 'cityBoundPane',
        color: savedStroke || '#06b6d4',
        weight: part === 'shell' ? 5 : 4,
        opacity: 1,
        fillColor: savedStroke || '#0891b2',
        fillOpacity: part === 'shell' ? 0.14 : 0.1,
        dashArray: null,
        lineJoin: 'round',
        lineCap: 'round'
      };
    }
    return {
      pane: 'cityBoundPane',
      color: '#c2410c',
      weight: 2,
      opacity: 0.98,
      fillColor: '#fbbf24',
      fillOpacity: 0.24,
      dashArray: '6 4',
      lineJoin: 'round',
      lineCap: 'round'
    };
  }

  function pilotDernaDocumentationHoverStyle(base, props, part) {
    var pal = pilotDernaDocumentationStyle(props || {}, part);
    var color = (base && (base.fillColor || base.color)) || pal.fillColor || pal.color;
    return {
      pane: 'cityBoundPane',
      color: color,
      weight: (base && base.weight ? base.weight : 1.5) + 1.4,
      opacity: 1,
      fillColor: color,
      fillOpacity: Math.min(0.45, ((base && base.fillOpacity) || 0.12) + 0.22),
      dashArray: null,
      lineJoin: 'round',
      lineCap: 'round'
    };
  }

  function boundaryFeatureName(feature) {
    var props = (feature && feature.properties) || {};
    return normalizeCityLabel(props.name || '');
  }

  function sortedCityPlaceNames() {
    return Object.keys(state.cityPlaceByName || {}).sort(function (a, b) {
      return a.localeCompare(b, 'ar');
    });
  }

  function finishShabiyaPlacesLoad(gen, addedCount) {
    if (!placeGenerationAlive(gen)) {
      return;
    }
    var names = sortedCityPlaceNames();
    showPlacesOutcomeMessage(gen, addedCount != null ? addedCount : names.length, true);
    dispatchCityPlacesUpdated(names);
    schedulePlaceLabelLayout();
  }
  function shouldFlyMapForBoundary(opts) {
    if (opts && opts.flyTo === false) {
      return false;
    }
    if (typeof MC.hasPlacedAddressMarker === 'function' && MC.hasPlacedAddressMarker()) {
      return false;
    }
    return true;
  }
  state.shabiyatLayerHiddenForCity = false;
  state.shabiyatDrilldownWanted = false;
  /** عند اختيار المدينة: مركز العرض على حي محدد (مثلاً درنة → الجبيلة). */
  var CITY_VIEW_FOCUS = {
    'درنة': {
      areaName: 'الجبيلة',
      lat: 32.7668,
      lng: 22.6342,
      pad: 0.02,
      northScale: 0.78,
      southScale: 0.92,
      padRatio: 0.08,
      panUpSteps: 6,
      paddingBottom: 96
    }
  };
  var MAP_PAN_STEP_PX = 80;
  var placeLabelLayoutTimer = null;
  var PLACE_LABEL_DIRS = ['top', 'bottom', 'right', 'left'];
  var LABEL_COLLISION_PAD = 6;

  function buildPinLabelSlots() {
    var slots = [];
    var di;
    for (di = 0; di < PLACE_LABEL_DIRS.length; di++) {
      slots.push({ dir: PLACE_LABEL_DIRS[di], offset: [0, 0] });
    }
    var dists = [18, 36, 54, 72, 90];
    var ri;
    for (ri = 0; ri < dists.length; ri++) {
      var d = dists[ri];
      for (di = 0; di < PLACE_LABEL_DIRS.length; di++) {
        var dir = PLACE_LABEL_DIRS[di];
        if (dir === 'top') {
          slots.push({ dir: dir, offset: [0, -d] });
          slots.push({ dir: dir, offset: [d, -d] });
          slots.push({ dir: dir, offset: [-d, -d] });
        } else if (dir === 'bottom') {
          slots.push({ dir: dir, offset: [0, d] });
          slots.push({ dir: dir, offset: [d, d] });
          slots.push({ dir: dir, offset: [-d, d] });
        } else if (dir === 'right') {
          slots.push({ dir: dir, offset: [d, 0] });
          slots.push({ dir: dir, offset: [d, -d] });
          slots.push({ dir: dir, offset: [d, d] });
        } else if (dir === 'left') {
          slots.push({ dir: dir, offset: [-d, 0] });
          slots.push({ dir: dir, offset: [-d, -d] });
          slots.push({ dir: dir, offset: [-d, d] });
        }
      }
    }
    return slots;
  }

  function buildBoundaryLabelSlots() {
    var slots = [];
    var dirs = PLACE_LABEL_DIRS;
    var di;
    for (di = 0; di < dirs.length; di++) {
      slots.push({ dir: dirs[di], offset: [0, 0] });
    }
    var rings = [16, 32, 48, 64, 80, 96, 112];
    var ri;
    for (ri = 0; ri < rings.length; ri++) {
      var r = rings[ri];
      var d75 = Math.round(r * 0.75);
      slots.push({ dir: 'center', offset: [0, -r] });
      slots.push({ dir: 'center', offset: [0, r] });
      slots.push({ dir: 'center', offset: [r, 0] });
      slots.push({ dir: 'center', offset: [-r, 0] });
      slots.push({ dir: 'center', offset: [d75, -d75] });
      slots.push({ dir: 'center', offset: [-d75, -d75] });
      slots.push({ dir: 'center', offset: [d75, d75] });
      slots.push({ dir: 'center', offset: [-d75, d75] });
    }
    return slots;
  }

  var PIN_LABEL_SLOTS = buildPinLabelSlots();
  var BOUNDARY_LABEL_SLOTS = buildBoundaryLabelSlots();

  function provincePalette(prov) {
    if (window.ProvinceColors && typeof window.ProvinceColors.palette === 'function') {
      return window.ProvinceColors.palette(prov);
    }
    var p = String(prov || '').toUpperCase();
    if (p === 'B') {
      return { stroke: '#ef4444', fill: '#ef4444', strokeHover: '#ef4444', fillHover: '#ef4444' };
    }
    if (p === 'T') {
      return { stroke: '#22c55e', fill: '#22c55e', strokeHover: '#22c55e', fillHover: '#22c55e' };
    }
    if (p === 'F') {
      return { stroke: '#cbd5e1', fill: '#cbd5e1', strokeHover: '#cbd5e1', fillHover: '#cbd5e1' };
    }
    return { stroke: '#e2e8f0', fill: '#94a3b8', strokeHover: '#cbd5e1', fillHover: '#475569' };
  }

  function refreshMapProvinceColors() {
    if (!state.shabiyatLayer) { return; }
    if (state.focusedCityId > 0) {
      hideShabiyatLayerForCityView();
      return;
    }
    state.shabiyatLayer.eachLayer(function (layer) {
      var feat = layer.feature;
      var p = feat && feat.properties ? feat.properties : {};
      if (layer === state.selectedShabiyaLayer) {
        applyShabiyaSelectedStyle(layer);
        return;
      }
      layer.setStyle(shabiyaStyle(feat));
    });
    if (state.cityBoundariesLayer) {
      state.cityBoundariesLayer.eachLayer(function (layer) {
        var feat = layer.feature;
        var p = feat && feat.properties ? feat.properties : {};
        var base = boundaryFeatureStyle(p, true);
        layer._addrBoundaryBaseStyle = base;
        layer.setStyle(base);
      });
    }
  }

  window.addEventListener('province-colors-changed', refreshMapProvinceColors);

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

  /** Province stroke/fill when boundary row has no saved `color`. */
  function resolveBoundaryPalette(props) {
    var p = props || {};
    var custom = p.color ? String(p.color).trim() : '';
    if (custom) {
      return { stroke: custom, fill: custom, custom: true };
    }
    var prov = String(p.province || '').trim().toUpperCase();
    if (!prov && p.code) {
      prov = String(p.code).charAt(0).toUpperCase();
    }
    if (prov) {
      var pal = provincePalette(prov);
      return { stroke: pal.stroke, fill: pal.fill, custom: false };
    }
    return { stroke: '#94a3b8', fill: '#94a3b8', custom: false };
  }

  /** Match boundary editor palette: use saved `properties.color` when set. */
  function boundaryFeatureStyle(p, emphasis) {
    var props = p || {};
    var isGrid = !!props.is_grid;
    var pal = resolveBoundaryPalette(props);
    var style;
    if (pal.custom) {
      style = {
        pane: 'cityBoundPane',
        color: pal.stroke,
        weight: isGrid ? 1.8 : 1.6,
        opacity: 0.92,
        fillColor: pal.fill,
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
        color: pal.stroke,
        weight: 1.4,
        opacity: 0.9,
        fillColor: pal.fill,
        fillOpacity: emphasis ? 0.22 : 0.12,
        dashArray: null,
        lineJoin: 'round',
        lineCap: 'round'
      };
    }
    if (emphasis) {
      style.weight = (style.weight || 1.2) + 0.8;
      style.opacity = Math.min(1, (style.opacity || 0.85) + 0.08);
      style.fillOpacity = Math.min(0.42, (style.fillOpacity || 0.1) + 0.14);
      if (!style.dashArray && !pal.custom && !isGrid) {
        style.dashArray = null;
      }
    }
    return style;
  }

  function boundaryHiddenStyle() {
    return {
      pane: 'cityBoundPane',
      color: '#000000',
      weight: 0,
      opacity: 0,
      fillColor: '#000000',
      fillOpacity: 0
    };
  }

  function boundaryMapClearOutlineStyle() {
    return {
      pane: 'cityBoundPane',
      color: 'rgba(255,255,255,0.78)',
      weight: 1.6,
      opacity: 0.82,
      fillOpacity: 0,
      fillColor: '#ffffff',
      dashArray: '7 5',
      lineJoin: 'round',
      lineCap: 'round'
    };
  }

  function boundaryFeatureStyleForRender(p, ctx) {
    var props = p || {};
    var ctx0 = ctx || {};
    var eid = ctx0.entityId != null ? Number(ctx0.entityId) : 0;
    var layerLevel = String(ctx0.layerLevel || '');
    var emphasizeArea = ctx0.emphasizeEntityId != null ? Number(ctx0.emphasizeEntityId) : 0;
    var highlightStreet = ctx0.highlightStreetId != null ? Number(ctx0.highlightStreetId) : 0;

    if (ctx0.pilotDocumentationGrid) {
      return pilotDernaDocumentationStyle(props, ctx0.pilotGridPart);
    }

    if (ctx0.clearMapView && props.is_grid) {
      return boundaryHiddenStyle();
    }

    if (ctx0.clearMapView) {
      if (layerLevel === 'street') {
        if (highlightStreet > 0 && eid === highlightStreet) {
          return boundaryMapClearOutlineStyle();
        }
        return boundaryHiddenStyle();
      }
      if (layerLevel === 'area' && emphasizeArea > 0) {
        if (eid === emphasizeArea) {
          return boundaryMapClearOutlineStyle();
        }
        return boundaryHiddenStyle();
      }
    }

    if (layerLevel === 'area' && emphasizeArea > 0) {
      if (eid === emphasizeArea) {
        return boundaryFeatureStyle(props, true);
      }
      return {
        pane: 'cityBoundPane',
        color: '#64748b',
        weight: 1,
        opacity: 0.42,
        fillColor: '#334155',
        fillOpacity: 0.05,
        dashArray: '4 6',
        lineJoin: 'round',
        lineCap: 'round'
      };
    }
    if (layerLevel === 'street') {
      var streetEmphasis = highlightStreet > 0 && eid === highlightStreet;
      var streetStyle = boundaryFeatureStyle(props, streetEmphasis);
      if (highlightStreet > 0 && eid !== highlightStreet) {
        streetStyle = Object.assign({}, streetStyle, {
          opacity: Math.min(streetStyle.opacity || 0.9, 0.58),
          fillOpacity: Math.min(streetStyle.fillOpacity || 0.12, 0.07),
          weight: Math.max(1, (streetStyle.weight || 1.4) - 0.35)
        });
      }
      return streetStyle;
    }
    return boundaryFeatureStyle(props, !!ctx0.emphasis);
  }

  function boundaryLabelClass(renderOpts) {
    var cls = 'shabiya-tooltip shabiya-boundary-label';
    if (renderOpts && renderOpts.layerLevel === 'city') {
      cls += ' shabiya-boundary-label--city';
    } else if (renderOpts && renderOpts.layerLevel === 'area') {
      cls += ' shabiya-boundary-label--area';
    } else if (renderOpts && renderOpts.layerLevel === 'street') {
      cls += ' shabiya-boundary-label--street';
    }
    return cls;
  }

  function boundaryFeatureHoverStyle(base, props) {
    var pal = resolveBoundaryPalette(props || {});
    var color = (base && (base.fillColor || base.color)) || pal.fill || pal.stroke;
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
    if (state.boundaryLabelLayer) {
      state.boundaryLabelLayer.clearLayers();
    }
    setPilotDernaGridMapClass(false);
    state.focusedAreaId = null;
  }

  function boundaryFeatureEntityId(feature) {
    var p = feature && feature.properties ? feature.properties : {};
    return parseInt(p.entity_id, 10) || 0;
  }

  function stripGridBoundaryFeaturesForLevels(features, levels) {
    var list = Array.isArray(features) ? features : [];
    if (!levels || !levels.length) {
      return list.slice();
    }
    var want = {};
    for (var li = 0; li < levels.length; li++) {
      want[String(levels[li])] = true;
    }
    var out = [];
    for (var gi = 0; gi < list.length; gi++) {
      var props = list[gi] && list[gi].properties ? list[gi].properties : {};
      if (props.is_grid && want[String(props.level || '')]) {
        continue;
      }
      out.push(list[gi]);
    }
    return out;
  }

  function filterBoundaryFeaturesByLevel(features, allowedLevels) {
    if (!allowedLevels || !allowedLevels.length) {
      return Array.isArray(features) ? features.slice() : [];
    }
    var want = {};
    for (var ai = 0; ai < allowedLevels.length; ai++) {
      want[String(allowedLevels[ai])] = true;
    }
    var list = Array.isArray(features) ? features : [];
    var out = [];
    for (var fi = 0; fi < list.length; fi++) {
      var props = list[fi] && list[fi].properties ? list[fi].properties : {};
      if (want[String(props.level || '')]) {
        out.push(list[fi]);
      }
    }
    return out;
  }

  function filterBoundaryFeatures(features, entityId, opts) {
    opts = opts || {};
    var list = Array.isArray(features) ? features : [];
    if (opts.stripAllGrids) {
      list = stripGridBoundaryFeaturesForLevels(list, ['city', 'area', 'street', 'region', 'state']);
    } else if (opts.stripGridLevels && opts.stripGridLevels.length) {
      list = stripGridBoundaryFeaturesForLevels(list, opts.stripGridLevels);
    }
    if (opts.levelsOnly && opts.levelsOnly.length) {
      list = filterBoundaryFeaturesByLevel(list, opts.levelsOnly);
    }
    if (!entityId || entityId < 1) {
      return list;
    }
    var want = Number(entityId);
    var out = [];
    for (var fj = 0; fj < list.length; fj++) {
      if (boundaryFeatureEntityId(list[fj]) === want) {
        out.push(list[fj]);
      }
    }
    return out;
  }

  function boundaryListUrl(level, parentId, queryOpts) {
    queryOpts = queryOpts || {};
    var url =
      'index.php?r=boundary_list&level=' +
      encodeURIComponent(String(level)) +
      '&parent_id=' +
      encodeURIComponent(String(parentId));
    if (queryOpts.savedOnly) {
      url += '&saved_only=1';
    }
    return url;
  }

  function fetchSavedBoundaryFeature(level, entityId, gen, opSeq) {
    var eid = parseInt(entityId, 10) || 0;
    if (eid < 1) {
      return Promise.resolve(null);
    }
    return fetch(
      'index.php?r=boundary_get&level=' +
        encodeURIComponent(String(level || '')) +
        '&entity_id=' +
        encodeURIComponent(String(eid)),
      {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      }
    )
      .then(function (r) {
        if (!r.ok) {
          throw new Error('boundary_get http ' + r.status);
        }
        return r.json();
      })
      .then(function (data) {
        if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
          return null;
        }
        if (!data || data.ok === false || !data.feature || !data.feature.geometry) {
          return null;
        }
        return data.feature;
      })
      .catch(function () {
        return null;
      });
  }

  function hideShabiyatLayerForDrilldown() {
    state.shabiyatDrilldownWanted = true;
    if (state.shabiyatLayer && map.hasLayer(state.shabiyatLayer)) {
      map.removeLayer(state.shabiyatLayer);
      state.shabiyatLayerHiddenForCity = true;
    }
  }

  function clearShabiyatDrilldownState() {
    state.shabiyatDrilldownWanted = false;
    state.shabiyatLayerHiddenForCity = false;
  }

  function hideShabiyatLayerForCityView() {
    state.selectedShabiyaLayer = null;
    hideShabiyatLayerForDrilldown();
  }

  function restoreShabiyatLayerIfHidden() {
    clearShabiyatDrilldownState();
    if (state.shabiyatLayer && state.boundariesLayerWanted !== false && !state.boundariesTemporarilyHidden) {
      if (!map.hasLayer(state.shabiyatLayer)) {
        state.shabiyatLayer.addTo(map);
      }
    }
    resetShabiyatLayerStyles();
    applyBoundariesLayerVisibility();
    if (MC.labels && typeof MC.labels.syncVisibility === 'function') {
      MC.labels.syncVisibility();
    }
  }

  function normalizeCityLabel(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
  }

  function resolveCityLabel(opts) {
    if (opts && opts.cityName) {
      return normalizeCityLabel(opts.cityName);
    }
    if (state.selectedPlace && state.selectedPlace.name) {
      return normalizeCityLabel(state.selectedPlace.name);
    }
    return '';
  }

  function resolveCityViewFocusConfig(cityLabel) {
    var nm = normalizeCityLabel(cityLabel);
    if (!nm) {
      return null;
    }
    if (CITY_VIEW_FOCUS[nm]) {
      return CITY_VIEW_FOCUS[nm];
    }
    if (nm.indexOf('درنة') >= 0) {
      return CITY_VIEW_FOCUS['درنة'];
    }
    return null;
  }

  function findAreaFeaturesByName(features, areaName) {
    var want = String(areaName || '').trim();
    if (!want) {
      return [];
    }
    var list = Array.isArray(features) ? features : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i] && list[i].properties ? list[i].properties : {};
      if (String(p.name || '').trim() === want) {
        out.push(list[i]);
      }
    }
    return out;
  }

  function filterStreetFeaturesForAreaId(streetFeats, areaId) {
    var want = Number(areaId);
    if (!want) {
      return [];
    }
    var list = Array.isArray(streetFeats) ? streetFeats : [];
    var out = [];
    for (var si = 0; si < list.length; si++) {
      var p = list[si] && list[si].properties ? list[si].properties : {};
      if (Number(p.parent_id) === want) {
        out.push(list[si]);
      }
    }
    return out;
  }

  function flyToCityAnchor(lat, lng, pad, flyOpts) {
    if (!map || !isFinite(lat) || !isFinite(lng)) {
      return;
    }
    var p = pad != null && isFinite(pad) ? pad : 0.02;
    var ring = [
      [lng - p, lat - p],
      [lng + p, lat - p],
      [lng + p, lat + p],
      [lng - p, lat + p],
      [lng - p, lat - p]
    ];
    flyToNeighborhoodViewport(
      [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] }
      }],
      flyOpts
    );
  }

  function resolveFocusCenterLatLng(areaFeats, focusCfg) {
    if (!focusCfg) {
      return null;
    }
    if (focusCfg.areaName) {
      var focusAreas = findAreaFeaturesByName(areaFeats, focusCfg.areaName);
      if (focusAreas.length) {
        var tmp = L.geoJSON(focusAreas[0]);
        try {
          var c = tmp.getBounds().getCenter();
          if (tmp.remove) {
            tmp.remove();
          } else if (map && map.removeLayer) {
            map.removeLayer(tmp);
          }
          return c;
        } catch (eC) {
          if (tmp.remove) {
            tmp.remove();
          }
        }
      }
    }
    if (isFinite(focusCfg.lat) && isFinite(focusCfg.lng)) {
      return L.latLng(focusCfg.lat, focusCfg.lng);
    }
    return null;
  }

  function boundsSymmetricAroundCenter(features, centerLl, focusCfg) {
    if (!map || !features || !features.length || !centerLl) {
      return null;
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
    } else if (map.removeLayer) {
      map.removeLayer(tmp);
    }
    if (!bb || !bb.isValid()) {
      return null;
    }
    var pad = focusCfg && focusCfg.padRatio != null ? focusCfg.padRatio : 0.1;
    var northScale = focusCfg && focusCfg.northScale != null ? focusCfg.northScale : 1;
    var southScale = focusCfg && focusCfg.southScale != null ? focusCfg.southScale : 1;
    var sw = bb.getSouthWest();
    var ne = bb.getNorthEast();
    var cLng = centerLl.lng;
    var dLatNorth = Math.max((ne.lat - centerLl.lat) * northScale, 0.006);
    var dLatSouth = Math.max((centerLl.lat - sw.lat) * southScale, 0.014);
    var dLng = Math.max(cLng - sw.lng, ne.lng - cLng);
    dLatNorth = Math.max(dLatNorth * (1 + pad), 0.006);
    dLatSouth = Math.max(dLatSouth * (1 + pad), 0.014);
    dLng = Math.max(dLng * (1 + pad), 0.014);
    return L.latLngBounds(
      [centerLl.lat - dLatSouth, cLng - dLng],
      [centerLl.lat + dLatNorth, cLng + dLng]
    );
  }

  function applyCityViewPanAdjust(focusCfg) {
    if (!map || !focusCfg) {
      return;
    }
    var dy = 0;
    if (focusCfg.panDownSteps) {
      dy += (parseInt(focusCfg.panDownSteps, 10) || 0) * MAP_PAN_STEP_PX;
    }
    if (focusCfg.panUpSteps) {
      dy -= (parseInt(focusCfg.panUpSteps, 10) || 0) * MAP_PAN_STEP_PX;
    }
    if (dy !== 0) {
      map.panBy([0, dy], { animate: true, duration: 0.42 });
    }
  }

  function flyToBoundsSymmetric(bb, flyOpts) {
    if (!bb || !bb.isValid()) {
      return;
    }
    var sw = bb.getSouthWest();
    var ne = bb.getNorthEast();
    var ring = [
      [sw.lng, sw.lat],
      [ne.lng, sw.lat],
      [ne.lng, ne.lat],
      [sw.lng, ne.lat],
      [sw.lng, sw.lat]
    ];
    flyToNeighborhoodViewport(
      [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] }
      }],
      flyOpts
    );
  }

  function flyToFeaturesAroundCenter(areaFeats, centerLl, flyOpts, focusCfg) {
    var bb = boundsSymmetricAroundCenter(areaFeats, centerLl, focusCfg);
    var mergedFlyOpts = Object.assign({}, flyOpts || {}, { cityViewFocus: focusCfg });
    if (focusCfg && focusCfg.paddingTop != null) {
      mergedFlyOpts.paddingTopLeft = [
        flyOpts && flyOpts.paddingTopLeft ? flyOpts.paddingTopLeft[0] : 48,
        focusCfg.paddingTop
      ];
    }
    if (focusCfg && focusCfg.paddingBottom != null) {
      mergedFlyOpts.paddingBottomRight = [
        flyOpts && flyOpts.paddingBottomRight ? flyOpts.paddingBottomRight[0] : 48,
        focusCfg.paddingBottom
      ];
    }
    if (!bb) {
      flyToNeighborhoodViewport(areaFeats, mergedFlyOpts);
      return;
    }
    flyToBoundsSymmetric(bb, mergedFlyOpts);
  }

  function flyToCityViewport(areaFeats, streetFeats, opts) {
    opts = opts || {};
    var cityLabel = resolveCityLabel(opts);
    var focusCfg = resolveCityViewFocusConfig(cityLabel);
    var allForFly =
      streetFeats && streetFeats.length ? areaFeats.concat(streetFeats) : areaFeats;
    if (!allForFly.length) {
      return;
    }
    var centerLl = resolveFocusCenterLatLng(areaFeats, focusCfg);
    if (centerLl && focusCfg) {
      flyToFeaturesAroundCenter(areaFeats, centerLl, opts.flyOpts, focusCfg);
      return;
    }
    flyToNeighborhoodViewport(allForFly, opts.flyOpts);
  }

  function collectAreaIdsFromFeatures(features) {
    var ids = [];
    var seen = {};
    var list = Array.isArray(features) ? features : [];
    for (var i = 0; i < list.length; i++) {
      var eid = boundaryFeatureEntityId(list[i]);
      if (eid > 0 && !seen[eid]) {
        seen[eid] = 1;
        ids.push(eid);
      }
    }
    return ids;
  }

  function fetchStreetFeaturesForAreas(areaIds, gen, opSeq) {
    var ids = Array.isArray(areaIds) ? areaIds : [];
    if (!ids.length) {
      return Promise.resolve([]);
    }
    return Promise.all(
      ids.map(function (aid) {
        return fetchBoundaryFeaturesRaw('street', aid, gen, opSeq, 0, { levelsOnly: ['street'] });
      })
    ).then(function (lists) {
      if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
        return [];
      }
      var merged = [];
      for (var li = 0; li < lists.length; li++) {
        var chunk = lists[li];
        if (chunk && chunk.length) {
          merged = merged.concat(chunk);
        }
      }
      return merged;
    });
  }

  function flyToBoundaryFeatureBounds(features, flyOpts) {
    flyOpts = flyOpts || {};
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
    var zCap = flyOpts.maxZoom != null ? flyOpts.maxZoom : Math.min(maxZ, 9);
    var fitOpts = {
      paddingTopLeft: flyOpts.paddingTopLeft || [56, 92],
      paddingBottomRight: flyOpts.paddingBottomRight || [56, 56],
      maxZoom: zCap,
      animate: flyOpts.animate !== false
    };
    if (flyOpts.animate === false) {
      map.fitBounds(bb, fitOpts);
      return;
    }
    map.flyToBounds(bb, Object.assign({}, fitOpts, {
      duration: flyOpts.duration != null ? flyOpts.duration : 0.6
    }));
  }

  function flyToNeighborhoodViewport(features, flyOpts) {
    flyOpts = flyOpts || {};
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
    var extra =
      flyOpts.extraZoomLevels != null
        ? flyOpts.extraZoomLevels
        : (MC.CITY_SELECT_EXTRA_ZOOM != null ? MC.CITY_SELECT_EXTRA_ZOOM : NEIGHBORHOOD_VIEW_EXTRA_ZOOM);
    var absoluteCap = flyOpts.maxZoom != null ? flyOpts.maxZoom : Math.min(maxZ, 17);
    var mapCap = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : maxZ;
    var mapFloor = typeof map.getMinZoom === 'function' ? map.getMinZoom() : (MC.minZ || 5);
    var zoomCeiling = Math.min(absoluteCap, mapCap);
    var fitCap = Math.max(mapFloor, zoomCeiling - extra);
    var duration = flyOpts.duration != null ? flyOpts.duration : 0.65;

    var padTop = flyOpts.paddingTopLeft ? flyOpts.paddingTopLeft[1] : 52;
    var padLeft = flyOpts.paddingTopLeft ? flyOpts.paddingTopLeft[0] : 40;
    var padBottom = flyOpts.paddingBottomRight ? flyOpts.paddingBottomRight[1] : 40;
    var padRight = flyOpts.paddingBottomRight ? flyOpts.paddingBottomRight[0] : 40;

    map.flyToBounds(bb, {
      paddingTopLeft: [padLeft, padTop],
      paddingBottomRight: [padRight, padBottom],
      maxZoom: fitCap,
      duration: duration
    });

    var bumpFn = MC.bumpMapZoomLevels;
    var scheduleFn = MC.scheduleAfterMapFly;
    if (typeof scheduleFn === 'function' && typeof bumpFn === 'function') {
      scheduleFn(function () {
        bumpFn(extra, { animate: true, duration: duration * 0.85 });
        if (flyOpts.cityViewFocus) {
          scheduleFn(function () {
            applyCityViewPanAdjust(flyOpts.cityViewFocus);
          }, 420);
        }
      }, Math.round(duration * 1000) + 120);
    }
  }

  function shabiyaWilayahFocusStyle(prov) {
    var pal = provincePalette(prov);
    return {
      pane: 'shabiyatPane',
      color: pal.stroke,
      weight: 1.4,
      opacity: 0.95,
      fillColor: pal.fill,
      fillOpacity: 0.2,
      dashArray: null,
      lineJoin: 'round',
      lineCap: 'round'
    };
  }

  function dimShabiyatOutsideProvince(provLetter) {
    if (!state.shabiyatLayer) {
      return;
    }
    var want = String(provLetter || '').trim();
    state.shabiyatLayer.eachLayer(function (layer) {
      var p = (layer.feature && layer.feature.properties) || {};
      if (!want || String(p.province || '').trim() === want) {
        layer.setStyle(shabiyaWilayahFocusStyle(p.province));
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

  function ensureCityBoundariesLayerOnMap() {
    if (!state.cityBoundariesLayer) {
      return;
    }
    if (state.boundariesLayerWanted === false) {
      return;
    }
    state.boundariesTemporarilyHidden = false;
    if (!map.hasLayer(state.cityBoundariesLayer)) {
      state.cityBoundariesLayer.addTo(map);
    }
  }
  MC.ensureCityBoundariesLayerOnMap = ensureCityBoundariesLayerOnMap;

  function resolveRegionDbId(regionIdHint, shCode) {
    var meta = lookupRegionMeta(shCode || '', regionIdHint);
    if (meta && meta.n != null) {
      return Number(meta.n);
    }
    var n = regionIdHint != null && regionIdHint !== '' ? parseInt(regionIdHint, 10) : 0;
    return n > 0 ? n : 0;
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
          var p = (feature && feature.properties) || {};
          return boundaryFeatureStyleForRender(p, {
            emphasis: emphasis,
            emphasizeEntityId: renderOpts.emphasizeEntityId,
            highlightStreetId: renderOpts.highlightStreetId,
            layerLevel: renderOpts.layerLevel,
            entityId: boundaryFeatureEntityId(feature),
            clearMapView: renderOpts.clearMapView,
            pilotDocumentationGrid: renderOpts.pilotDocumentationGrid,
            pilotGridPart: renderOpts.pilotGridPart
          });
        },
        onEachFeature: function (feature, layer) {
          var p = (feature && feature.properties) || {};
          var eid = boundaryFeatureEntityId(feature);
          var featureLevel = String(p.level || renderOpts.layerLevel || '');
          var baseStyle = boundaryFeatureStyleForRender(p, {
            emphasis: emphasis,
            emphasizeEntityId: renderOpts.emphasizeEntityId,
            highlightStreetId: renderOpts.highlightStreetId,
            layerLevel: renderOpts.layerLevel,
            entityId: eid,
            clearMapView: renderOpts.clearMapView,
            pilotDocumentationGrid: renderOpts.pilotDocumentationGrid,
            pilotGridPart: renderOpts.pilotGridPart
          });
          layer._addrBoundaryBaseStyle = baseStyle;
          layer._addrLayerLevel = String(renderOpts.layerLevel || p.level || '');
          layer._addrEntityId = eid;
          layer._addrParentId = parseInt(p.parent_id, 10) || 0;
          var nm = String(p.name || '').trim();
          if (!nm) { return; }
          var showLabel = false;
          if (renderOpts.permanentLabels) {
            if (renderOpts.clearMapView) {
              if (renderOpts.layerLevel === 'area' && renderOpts.emphasizeEntityId) {
                showLabel = eid === Number(renderOpts.emphasizeEntityId);
              } else if (renderOpts.layerLevel === 'street' && renderOpts.highlightStreetId) {
                showLabel = eid === Number(renderOpts.highlightStreetId);
              }
            } else if (renderOpts.pilotDocumentationGrid && renderOpts.pilotGridPart === 'shell') {
              showLabel = false;
            } else {
              showLabel = true;
            }
          }
          if (showLabel) {
            var labelCenter = null;
            var savedLat = Number(p.label_lat);
            var savedLng = Number(p.label_lng);
            if (savedLat === savedLat && savedLng === savedLng) {
              labelCenter = L.latLng(savedLat, savedLng);
            }
            if (!labelCenter) {
              labelCenter = boundaryFeatureLabelCenter(feature, layer);
            }
            if (labelCenter) {
              installBoundaryLabelPin(
                nm,
                labelCenter.lat,
                labelCenter.lng,
                featureLevel || 'area',
                eid
              );
              layer._addrHasLabelPin = true;
            }
          }
          if (layer.bindTooltip) {
            layer.bindTooltip(nm, {
              sticky: true,
              direction: 'top',
              className: 'shabiya-tooltip shabiya-hover-hint'
            });
          }
          layer.on('mouseover', function () {
            if (renderOpts.clearMapView && (!baseStyle.opacity || baseStyle.weight <= 0)) {
              return;
            }
            var hoverStyle = renderOpts.pilotDocumentationGrid
              ? pilotDernaDocumentationHoverStyle(baseStyle, p, renderOpts.pilotGridPart)
              : boundaryFeatureHoverStyle(baseStyle, p);
            startBorderPulse(layer, hoverStyle);
            if (layer.bringToFront) { layer.bringToFront(); }
            if (layer.openTooltip) { layer.openTooltip(); }
          });
          layer.on('mouseout', function () {
            if (layer.closeTooltip) { layer.closeTooltip(); }
            stopBorderPulse(layer);
            layer.setStyle(Object.assign({}, layer._addrBoundaryBaseStyle || baseStyle));
          });
          if (typeof onCityClick === 'function') {
            layer.on('click', function (ev) {
              var ll = ev.latlng || null;
              if (!readOnly && state.drawMode === 'parcel') {
                if (L && L.DomEvent) { L.DomEvent.stopPropagation(ev); }
                if (ll && bounds.contains(ll) && typeof state.drawClickHandler === 'function') {
                  state.drawClickHandler(ll);
                }
                return;
              }
              if (!readOnly && state.markerModePending) {
                if (ll && bounds.contains(ll)) {
                  if (L && L.DomEvent) { L.DomEvent.stopPropagation(ev); }
                  if (map && typeof map.stop === 'function') {
                    map.stop();
                  }
                  MC.placeAddressMarker(ll);
                  state.markerModePending = false;
                  MC.syncMarkerModeButton();
                  MC.syncMarkerCtaReveal();
                }
                return;
              }
              var c = null;
              try {
                c = layer.getBounds().getCenter();
              } catch (eC) { c = null; }
              onCityClick(
                nm,
                c ? c.lat : NaN,
                c ? c.lng : NaN,
                ev,
                boundaryFeatureEntityId(feature),
                parseInt(p.parent_id, 10) || 0
              );
            });
          }
        }
      }
    ).addTo(state.cityBoundariesLayer);
    ensureCityBoundariesLayerOnMap();
    schedulePlaceLabelLayout();
  }

  function fetchBoundaryFeaturesRaw(level, parentId, gen, opSeq, entityId, filterOpts) {
    if (!parentId) {
      return Promise.resolve([]);
    }
    filterOpts = filterOpts || {};
    return fetch(
      boundaryListUrl(level, parentId, { savedOnly: !!filterOpts.savedOnly }),
      {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      }
    )
      .then(function (r) {
        if (!r.ok) { throw new Error('boundary_list http ' + r.status); }
        return r.json();
      })
      .then(function (fc) {
        if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
          return [];
        }
        if (!fc || !Array.isArray(fc.features) || !fc.features.length) {
          return [];
        }
        return filterBoundaryFeatures(fc.features, entityId || 0, filterOpts || null);
      })
      .catch(function () {
        return [];
      });
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
    fetch(boundaryListUrl(level, parentId), {
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
        if (!fc || fc.ok === false || !Array.isArray(fc.features) || !fc.features.length) {
          return;
        }
        var feats = filterBoundaryFeatures(fc.features, entityId, fetchOpts.filter || null);
        if (!feats.length) {
          return;
        }
        renderBoundaryFeatures(feats, onCityClick || null, {
          emphasis: !!fetchOpts.emphasis,
          layerLevel: fetchOpts.layerLevel || ''
        });
        ensureCityBoundariesLayerOnMap();
        if (fetchOpts.flyTo) {
          flyToBoundaryFeatureBounds(feats, fetchOpts.flyOpts || null);
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
    restoreShabiyatLayerIfHidden();
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
    state.focusedCityId = 0;
    if (!cityId || !regionId) {
      return;
    }
    fetchBoundaryList('city', regionId, placesLoadGeneration, cityId, function (nm, lat0, lng0, ev, entityId) {
      handleCityBoundaryClick(nm, lat0, lng0, ev, entityId);
    }, {
      filter: { levelsOnly: ['city'] }
    });
  }

  function handleBlockBoundaryClick(level, name, entityId, parentId, lat0, lng0, ev) {
    if (L && L.DomEvent && ev) { L.DomEvent.stopPropagation(ev); }
    var nameStr = String(name || '').trim();
    var eid = parseInt(entityId, 10) || 0;
    var pid = parseInt(parentId, 10) || 0;
    if (!nameStr || eid < 1) { return; }
    var lvl = String(level || '');
    window.dispatchEvent(
      new CustomEvent('addr-block-select', {
        detail: {
          level: lvl,
          id: eid,
          name: nameStr,
          parentId: pid
        }
      })
    );
    if (lvl === 'street' && pid > 0 && state.focusedCityId > 0) {
      showAreaWithStreets(pid, state.focusedCityId, { flyTo: true, highlightStreetId: eid });
      return;
    }
    if (MC.flyToEntityLocation) {
      MC.flyToEntityLocation(lvl, eid);
    }
  }

  function isPilotDernaAreaContext(cityId) {
    var cid = parseInt(cityId, 10) || 0;
    if (!isPilotPrimaryCityId(cid)) {
      return false;
    }
    if (state.lastShabiyaDetail && isPilotShabiya(state.lastShabiyaDetail.name, state.lastShabiyaDetail.code)) {
      return true;
    }
    /* City grid already loaded (e.g. after map drill-down). */
    return (
      state.focusedCityId === cid &&
      state.cityBoundariesLayer &&
      state.cityBoundariesLayer.getLayers().length > 0
    );
  }

  function ensurePilotAreaFormSync(cityId, areaName) {
    var cid = parseInt(cityId, 10) || 0;
    if (!isPilotPrimaryCityId(cid)) {
      return;
    }
    var pa = document.getElementById('pc_area');
    if (pa && !String(pa.value || '').trim() && state.lastShabiyaDetail && state.lastShabiyaDetail.n != null && state.lastShabiyaDetail.n !== '') {
      pa.value = String(state.lastShabiyaDetail.n);
    }
    var cityAreaIn = document.getElementById('addr-city-area');
    if (cityAreaIn && !String(cityAreaIn.value || '').trim()) {
      window.dispatchEvent(
        new CustomEvent('addr-place-select', {
          detail: { name: 'درنة', lat: 0, lng: 0, type: 'city', cityId: cid }
        })
      );
    }
  }

  function collectPilotAreaFeaturesFromLayer(areaId) {
    var out = [];
    var aid = Number(areaId);
    if (!aid || !state.cityBoundariesLayer) {
      return out;
    }
    state.cityBoundariesLayer.eachLayer(function (layer) {
      if (layer._addrLayerLevel === 'area' && layer._addrEntityId === aid && layer.feature) {
        out.push(layer.feature);
      }
    });
    return out;
  }

  function syncPilotDernaAreaLabelFocus(areaId) {
    if (!state.boundaryLabelLayer) {
      return;
    }
    var aid = Number(areaId);
    state.boundaryLabelLayer.eachLayer(function (marker) {
      if (marker._addrLayerLevel !== 'area') {
        return;
      }
      var el = marker.getElement && marker.getElement();
      if (!el) {
        return;
      }
      var selected = aid > 0 && marker._addrLabelSeed === aid;
      el.style.opacity = selected || !aid ? '1' : '0.22';
      el.style.pointerEvents = selected || !aid ? '' : 'none';
    });
  }

  function applyPilotDernaAreaLayerFocus(areaId) {
    if (!state.cityBoundariesLayer) {
      return;
    }
    var aid = Number(areaId);
    state.cityBoundariesLayer.eachLayer(function (layer) {
      var lvl = layer._addrLayerLevel;
      var eid = layer._addrEntityId;
      var p = (layer.feature && layer.feature.properties) || {};
      if (lvl === 'area') {
        if (eid === aid) {
          var hi = pilotDernaDocumentationHoverStyle(
            layer._addrBoundaryBaseStyle || pilotDernaDocumentationStyle(p, 'cell'),
            p,
            'cell'
          );
          layer.setStyle(hi);
          if (layer.bringToFront) {
            layer.bringToFront();
          }
          return;
        }
        layer.setStyle({
          pane: 'cityBoundPane',
          color: '#64748b',
          weight: 1,
          opacity: 0.35,
          fillColor: '#334155',
          fillOpacity: 0.04,
          dashArray: '4 6',
          lineJoin: 'round',
          lineCap: 'round'
        });
      }
    });
    syncPilotDernaAreaLabelFocus(aid);
  }

  function restorePilotDernaAreaLayerStyles() {
    if (!state.cityBoundariesLayer) {
      return;
    }
    state.cityBoundariesLayer.eachLayer(function (layer) {
      if (layer._addrBoundaryBaseStyle) {
        layer.setStyle(Object.assign({}, layer._addrBoundaryBaseStyle));
      }
    });
    syncPilotDernaAreaLabelFocus(0);
  }

  function hidePilotDernaBoundariesForAreaPlacement() {
    state.pilotAreaBoundariesHidden = true;
    if (state.cityBoundariesLayer && map.hasLayer(state.cityBoundariesLayer)) {
      map.removeLayer(state.cityBoundariesLayer);
    }
    if (state.boundaryLabelLayer) {
      state.boundaryLabelLayer.eachLayer(function (marker) {
        if (marker._addrLayerLevel === 'area') {
          var el = marker.getElement && marker.getElement();
          if (el) {
            el.style.display = 'none';
          }
        }
      });
    }
    var wrap = document.querySelector('.map-canvas-wrap--mgr');
    if (wrap) {
      wrap.classList.add('map-canvas-wrap--pilot-area-placement');
    }
  }

  function resetPilotAreaPlacementChrome() {
    state.pilotAreaBoundariesHidden = false;
    var wrap = document.querySelector('.map-canvas-wrap--mgr');
    if (wrap) {
      wrap.classList.remove('map-canvas-wrap--pilot-area-placement');
    }
  }

  function restorePilotAreaLabelVisibility() {
    if (!state.boundaryLabelLayer) {
      return;
    }
    state.boundaryLabelLayer.eachLayer(function (marker) {
      if (marker._addrLayerLevel === 'area') {
        var el = marker.getElement && marker.getElement();
        if (el) {
          el.style.display = '';
        }
      }
    });
  }

  function collectAllPilotAreaFeaturesFromCityLayer() {
    var out = [];
    if (!state.cityBoundariesLayer) {
      return out;
    }
    state.cityBoundariesLayer.eachLayer(function (layer) {
      if (layer._addrLayerLevel === 'area' && layer.feature) {
        out.push(layer.feature);
      }
    });
    return out;
  }

  function storePilotAreaFocusContext(areaFeats) {
    var feats = Array.isArray(areaFeats) ? areaFeats : [];
    state.focusedAreaFeature = feats.length ? feats[0] : null;
    state.pilotAreaPlacementActive = !!state.focusedAreaFeature;
  }

  function applyPilotAreaPanLockFromFeatures(areaFeats) {
    if (!areaFeats || !areaFeats.length || !MC.applyAreaPanLock) {
      return null;
    }
    var tmp = L.geoJSON({ type: 'FeatureCollection', features: areaFeats });
    var bb = null;
    try {
      bb = tmp.getBounds();
    } catch (eBb) {
      bb = null;
    }
    if (tmp.remove) {
      tmp.remove();
    } else if (map.removeLayer) {
      map.removeLayer(tmp);
    }
    if (!bb || !bb.isValid()) {
      return null;
    }
    state.focusedAreaBounds = bb;
    MC.applyAreaPanLock(bb, { snap: true, animate: false, pad: 0.014 });
    return bb;
  }

  function refitPilotDernaCityGridView(opts) {
    opts = opts || {};
    var cid = parseInt(state.focusedCityId, 10) || 0;
    if (cid < 1 || !isPilotPrimaryCityId(cid)) {
      return;
    }
    var areaFeats = collectAllPilotAreaFeaturesFromCityLayer();
    ensureCityBoundariesLayerOnMap();
    if (areaFeats.length) {
      fitPilotDernaCityView(areaFeats, { cityName: opts.cityName || 'درنة' });
    }
  }

  function exitPilotAreaPlacementMode(opts) {
    opts = opts || {};
    if (!state.pilotAreaPlacementActive && !state.pilotAreaBoundariesHidden) {
      return Promise.resolve(false);
    }
    if (state.pilotAreaExitBusy) {
      return Promise.resolve(false);
    }
    state.pilotAreaExitBusy = true;
    var cid = parseInt(state.focusedCityId, 10) || 0;
    state.pilotAreaPlacementActive = false;
    state.focusedAreaFeature = null;
    state.focusedAreaBounds = null;
    state.focusedAreaId = null;
    state.markerModePending = false;
    if (MC.syncMarkerModeButton) {
      MC.syncMarkerModeButton();
    }
    if (MC.clearAreaPanLock) {
      MC.clearAreaPanLock({ snap: false, animate: false });
    }
    resetPilotAreaPlacementChrome();
    restorePilotAreaLabelVisibility();
    restorePilotDernaAreaLayerStyles();
    ensureCityBoundariesLayerOnMap();
    if (opts.refitCity !== false && cid > 0 && isPilotPrimaryCityId(cid)) {
      refitPilotDernaCityGridView({ cityName: opts.cityName || 'درنة' });
    }
    if (MC.syncMarkerCtaReveal) {
      MC.syncMarkerCtaReveal();
    }
    window.setTimeout(function () {
      state.pilotAreaExitBusy = false;
    }, 320);
    return Promise.resolve(true);
  }

  function watchPilotAreaViewportExit() {
    if (!state.pilotAreaPlacementActive || state.pilotAreaExitBusy) {
      return;
    }
    if (state.pilotAreaLockGraceUntil && Date.now() < state.pilotAreaLockGraceUntil) {
      return;
    }
    if (!map || typeof map.getZoom !== 'function') {
      return;
    }
    /* الخروج إلى شبكة الأحياء فقط عند التصغير — لا نفحص الزوايا لأن viewport أكبر من polygon */
    if (map.getZoom() < PILOT_AREA_EXIT_MIN_ZOOM) {
      exitPilotAreaPlacementMode({ refitCity: true });
    }
  }

  MC.exitPilotAreaPlacementMode = exitPilotAreaPlacementMode;
  MC.watchPilotAreaViewportExit = watchPilotAreaViewportExit;

  function fitPilotDernaAreaView(areaFeats) {
    if (!map || !areaFeats || !areaFeats.length) {
      return;
    }
    var tmp = L.geoJSON({ type: 'FeatureCollection', features: areaFeats });
    var bb = null;
    try {
      bb = tmp.getBounds();
    } catch (eBb) {
      bb = null;
    }
    if (tmp.remove) {
      tmp.remove();
    } else if (map.removeLayer) {
      map.removeLayer(tmp);
    }
    if (!bb || !bb.isValid()) {
      return;
    }
    if (typeof map.stop === 'function') {
      map.stop();
    }
    var areaZoomTarget = Math.min(maxZ, 17);
    map.fitBounds(bb, {
      padding: [28, 28],
      maxZoom: Math.max(14, areaZoomTarget - 1),
      animate: false
    });
    if (MC.bumpMapZoomLevels) {
      MC.bumpMapZoomLevels(2, { animate: false, duration: 0 });
    }
    if (map.getZoom() < areaZoomTarget) {
      map.setZoom(areaZoomTarget, { animate: false });
    }
    var feat0 = areaFeats[0];
    var props0 = (feat0 && feat0.properties) || {};
    var centerLat = Number(props0.label_lat != null ? props0.label_lat : props0.lat);
    var centerLng = Number(props0.label_lng != null ? props0.label_lng : props0.lng);
    if (isFinite(centerLat) && isFinite(centerLng)) {
      map.setView([centerLat, centerLng], map.getZoom(), { animate: false });
      map.panBy([0, -MAP_PAN_STEP_PX * 2], { animate: false });
    }
    storePilotAreaFocusContext(areaFeats);
    applyPilotAreaPanLockFromFeatures(areaFeats);
    state.pilotAreaLockGraceUntil = Date.now() + 700;
    if (MC.refreshMapMaskForView) {
      MC.refreshMapMaskForView();
    }
  }

  function focusPilotDernaAreaView(areaId, cityId, opts) {
    opts = opts || {};
    var aid = parseInt(areaId, 10) || 0;
    var cid = parseInt(cityId, 10) || 0;
    if (aid < 1 || cid < 1) {
      return Promise.resolve(false);
    }
    state.focusedCityId = cid;
    state.focusedAreaId = aid;
    state.userOverviewLocked = true;
    state.markerModePending = false;
    if (MC.syncMarkerModeButton) {
      MC.syncMarkerModeButton();
    }

    if (opts.areaName) {
      ensurePilotAreaFormSync(cid, opts.areaName);
      dispatchAreaBlockSelect(aid, String(opts.areaName).trim(), cid);
    }

    var areaFeats = collectPilotAreaFeaturesFromLayer(aid);
    if (areaFeats.length) {
      hidePilotDernaBoundariesForAreaPlacement();
      storePilotAreaFocusContext(areaFeats);
      if (opts.flyTo !== false) {
        fitPilotDernaAreaView(areaFeats);
      } else {
        applyPilotAreaPanLockFromFeatures(areaFeats);
        state.pilotAreaLockGraceUntil = Date.now() + 700;
      }
      revealPilotAreaMarkerCta();
      return Promise.resolve(true);
    }

    var gen = placesLoadGeneration;
    var opSeq = ++cityBoundariesGeneration;
    return fetchSavedBoundaryFeature('area', aid, gen, opSeq)
      .then(function (savedFeature) {
        if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
          return false;
        }
        if (!savedFeature) {
          return false;
        }
        hidePilotDernaBoundariesForAreaPlacement();
        storePilotAreaFocusContext([savedFeature]);
        if (opts.flyTo !== false) {
          fitPilotDernaAreaView([savedFeature]);
        } else {
          applyPilotAreaPanLockFromFeatures([savedFeature]);
          state.pilotAreaLockGraceUntil = Date.now() + 700;
        }
        revealPilotAreaMarkerCta();
        return true;
      });
  }
  MC.showPilotDernaAreaView = focusPilotDernaAreaView;
  MC.isPilotPrimaryCityId = isPilotPrimaryCityId;

  function revealPilotAreaMarkerCta() {
    function reveal() {
      if (readOnly) {
        return;
      }
      var wrap = document.getElementById('map-marker-cta-slot');
      var z = map && typeof map.getZoom === 'function' ? map.getZoom() : 0;
      MC.syncMarkerCtaReveal();
      if (wrap && state.focusedAreaId > 0 && z >= 13) {
        wrap.hidden = false;
        wrap.setAttribute('aria-hidden', 'false');
      }
    }
    window.setTimeout(reveal, 80);
    window.setTimeout(reveal, 420);
    try {
      window.addEventListener('addr-marker-cta-refresh', reveal, { once: true });
    } catch (eOnce) {
      window.addEventListener('addr-marker-cta-refresh', reveal);
    }
  }

  function dispatchAreaBlockSelect(eid, nameStr, cid) {
    window.dispatchEvent(
      new CustomEvent('addr-block-select', {
        detail: {
          level: 'area',
          id: eid,
          name: nameStr,
          parentId: cid
        }
      })
    );
  }

  function handleAreaBoundaryClick(name, entityId, cityId, lat0, lng0, ev) {
    if (L && L.DomEvent && ev) { L.DomEvent.stopPropagation(ev); }
    var nameStr = String(name || '').trim();
    var eid = parseInt(entityId, 10) || 0;
    var cid = parseInt(cityId, 10) || 0;
    if (!nameStr || eid < 1 || cid < 1) { return; }
    if (isPilotDernaAreaContext(cid)) {
      ensurePilotAreaFormSync(cid, nameStr);
      dispatchAreaBlockSelect(eid, nameStr, cid);
      focusPilotDernaAreaView(eid, cid, { flyTo: true, areaName: nameStr });
      return;
    }
    dispatchAreaBlockSelect(eid, nameStr, cid);
    showAreaWithStreets(eid, cid, { flyTo: true });
    MC.syncMarkerCtaReveal();
  }

  function collectFeaturesByEntityId(features, entityId) {
    var want = Number(entityId);
    var out = [];
    var list = Array.isArray(features) ? features : [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (boundaryFeatureEntityId(list[i]) === want) {
        out.push(list[i]);
      }
    }
    return out;
  }

  function showAreaWithStreets(areaId, cityId, opts) {
    opts = opts || {};
    var aid = parseInt(areaId, 10) || 0;
    var cid = parseInt(cityId, 10) || 0;
    if (isPilotDernaAreaContext(cid)) {
      return focusPilotDernaAreaView(aid, cid, opts);
    }
    if (aid < 1 || cid < 1 || !state.cityBoundariesLayer) {
      return Promise.resolve(false);
    }
    var gen = placesLoadGeneration;
    clearCityBoundaries();
    var opSeq = ++cityBoundariesGeneration;
    state.focusedCityId = cid;
    state.focusedAreaId = aid;
    if (opts.hidePlaceMarkers !== false && state.cityPlacesLayer) {
      state.cityPlacesLayer.clearLayers();
    }

    return fetchBoundaryFeaturesRaw('area', cid, gen, opSeq, 0, {
      levelsOnly: ['area']
    }).then(function (areaFeats) {
      if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
        return false;
      }
      return fetchBoundaryFeaturesRaw('street', aid, gen, opSeq, 0, {
        levelsOnly: ['street']
      }).then(function (streetFeats) {
        if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
          return false;
        }
        if (streetFeats.length) {
          renderBoundaryFeatures(
            streetFeats,
            function (nm, lat0, lng0, ev, entityId) {
              handleBlockBoundaryClick('street', nm, entityId, aid, lat0, lng0, ev);
            },
            {
              emphasis: false,
              permanentLabels: true,
              layerLevel: 'street',
              highlightStreetId: opts.highlightStreetId,
              clearMapView: false
            }
          );
        }
        renderBoundaryFeatures(
          areaFeats,
          function (nm, lat0, lng0, ev, entityId) {
            handleAreaBoundaryClick(nm, entityId, cid, lat0, lng0, ev);
          },
          {
            emphasis: false,
            permanentLabels: true,
            layerLevel: 'area',
            emphasizeEntityId: aid,
            clearMapView: false
          }
        );
        ensureCityBoundariesLayerOnMap();

        var flyFeats = collectFeaturesByEntityId(areaFeats, aid).concat(streetFeats || []);
        if (opts.highlightStreetId) {
          var hi = collectFeaturesByEntityId(streetFeats, opts.highlightStreetId);
          if (hi.length) {
            flyFeats = collectFeaturesByEntityId(areaFeats, aid).concat(hi);
          }
        }
        if (shouldFlyMapForBoundary(opts) && flyFeats.length) {
          state.userOverviewLocked = true;
          flyToNeighborhoodViewport(flyFeats, {
            maxZoom: Math.min(maxZ, opts.highlightStreetId ? 17 : 17),
            extraZoomLevels: MC.CITY_SELECT_EXTRA_ZOOM != null ? MC.CITY_SELECT_EXTRA_ZOOM : NEIGHBORHOOD_VIEW_EXTRA_ZOOM
          });
        }
        return true;
      });
    });
  }

  function showCityChildBoundaries(cityId, opts) {
    opts = opts || {};
    var cid = parseInt(cityId, 10) || 0;
    if (cid < 1 || !state.cityBoundariesLayer) {
      return Promise.resolve(false);
    }
    var gen = placesLoadGeneration;
    clearCityBoundaries();
    var opSeq = cityBoundariesGeneration;
    if (opts.hidePlaceMarkers !== false) {
      state.cityPlaceByName = {};
      if (state.cityPlacesLayer) {
        state.cityPlacesLayer.clearLayers();
      }
      dispatchCityPlacesUpdated([]);
    }
    hideShabiyatLayerForCityView();
    state.focusedCityId = cid;
    state.focusedAreaId = null;
    return fetchBoundaryFeaturesRaw('area', cid, gen, opSeq, 0, { levelsOnly: ['area'] }).then(function (areaFeats) {
      if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
        return false;
      }
      if (!areaFeats.length) {
        if (shouldFlyMapForBoundary(opts)) {
          state.userOverviewLocked = true;
          var emptyLabel = resolveCityLabel(opts);
          var emptyFocus = resolveCityViewFocusConfig(emptyLabel);
          if (emptyFocus && isFinite(emptyFocus.lat) && isFinite(emptyFocus.lng)) {
            flyToCityAnchor(emptyFocus.lat, emptyFocus.lng, emptyFocus.pad, opts.flyOpts);
          } else if (MC.flyToEntityLocation) {
            MC.flyToEntityLocation('city', cid);
          }
        }
        return false;
      }
      var cityLabel = resolveCityLabel(opts);
      return fetchStreetFeaturesForAreas(collectAreaIdsFromFeatures(areaFeats), gen, opSeq).then(function (streetFeats) {
        if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
          return false;
        }
        if (streetFeats.length) {
          renderBoundaryFeatures(
            streetFeats,
            function (nm, lat0, lng0, ev, entityId, parentId) {
              handleBlockBoundaryClick('street', nm, entityId, parentId, lat0, lng0, ev);
            },
            {
              emphasis: false,
              permanentLabels: shouldShowEntityLabels(),
              layerLevel: 'street'
            }
          );
        }
        renderBoundaryFeatures(areaFeats, function (nm, lat0, lng0, ev, entityId) {
          handleAreaBoundaryClick(nm, entityId, cid, lat0, lng0, ev);
        }, { emphasis: false, permanentLabels: shouldShowEntityLabels(), layerLevel: 'area' });
        ensureCityBoundariesLayerOnMap();
        if (shouldFlyMapForBoundary(opts)) {
          state.userOverviewLocked = true;
          flyToCityViewport(areaFeats, streetFeats, { cityName: cityLabel, flyOpts: opts.flyOpts });
        }
        if (MC.applyTileCoveragePanLock) {
          MC.applyTileCoveragePanLock({ snap: true, animate: true });
        }
        return true;
      });
    });
  }

  function showBlockBoundaryOnly(level, entityId, parentId) {
    clearCityBoundaries();
    if (!level || !entityId || !parentId) {
      return;
    }
    fetchBoundaryList(level, parentId, placesLoadGeneration, entityId, null);
  }

  function exportStyleForFeature(feature) {
    var props = (feature && feature.properties) || {};
    var eid = boundaryFeatureEntityId(feature);
    var level = String(props.level || '');

    if (props.is_grid) {
      return boundaryFeatureStyle(props, false);
    }
    if (level === 'street') {
      return boundaryFeatureStyleForRender(props, {
        emphasis: false,
        layerLevel: 'street',
        entityId: eid,
        highlightStreetId: 0,
        clearMapView: false
      });
    }
    if (level === 'area') {
      return boundaryFeatureStyleForRender(props, {
        emphasis: false,
        layerLevel: 'area',
        entityId: eid,
        emphasizeEntityId: 0,
        clearMapView: false
      });
    }
    return boundaryFeatureStyle(props, false);
  }

  function exportLabelClassForFeature(feature) {
    var level = String((feature && feature.properties && feature.properties.level) || '');
    return boundaryLabelClass({ layerLevel: level === 'street' ? 'street' : 'area' });
  }

  function snapshotLayerTooltip(layer) {
    if (!layer || typeof layer.getTooltip !== 'function') {
      return null;
    }
    var tip = layer.getTooltip();
    if (!tip) {
      return null;
    }
    return {
      content: tip.getContent ? tip.getContent() : '',
      options: Object.assign({}, tip.options || {})
    };
  }

  /** Show all loaded neighborhood/street boundaries + names for PNG export. */
  function prepareBoundaryLayersForExport() {
    var saved = [];
    if (!state.cityBoundariesLayer) {
      return { restore: function () {} };
    }
    eachNestedPolygonLayer(state.cityBoundariesLayer, function (layer) {
      var feature = layer.feature;
      var props = (feature && feature.properties) || {};
      var nm = String(props.name || '').trim();
      var entry = {
        layer: layer,
        style: layer._addrBoundaryBaseStyle ? Object.assign({}, layer._addrBoundaryBaseStyle) : null,
        addedTooltip: false,
        priorTooltip: snapshotLayerTooltip(layer)
      };

      var exportStyle = exportStyleForFeature(feature);
      layer.setStyle(exportStyle);
      layer._addrBoundaryBaseStyle = Object.assign({}, exportStyle);
      if (layer.bringToFront) {
        layer.bringToFront();
      }

      if (nm) {
        if (layer._addrHasLabelPin) {
          /* Permanent name is rendered on boundaryLabelLayer. */
        } else {
        var existing = layer.getTooltip && layer.getTooltip();
        if (existing && existing.options && existing.options.permanent) {
          if (layer.openTooltip) {
            layer.openTooltip();
          }
        } else {
          if (existing && layer.unbindTooltip) {
            layer.unbindTooltip();
          }
          layer.bindTooltip(nm, {
            permanent: true,
            direction: 'top',
            className: exportLabelClassForFeature(feature)
          });
          if (layer.openTooltip) {
            layer.openTooltip();
          }
          entry.addedTooltip = true;
        }
        }
      }

      saved.push(entry);
    });
    return {
      restore: function () {
        for (var i = 0; i < saved.length; i++) {
          var entry = saved[i];
          if (entry.style) {
            entry.layer.setStyle(Object.assign({}, entry.style));
            entry.layer._addrBoundaryBaseStyle = Object.assign({}, entry.style);
          }
          if (entry.addedTooltip && entry.layer.unbindTooltip) {
            entry.layer.unbindTooltip();
            if (entry.priorTooltip && entry.priorTooltip.content) {
              entry.layer.bindTooltip(entry.priorTooltip.content, entry.priorTooltip.options);
            }
          }
        }
      }
    };
  }

  function pointInRingLatLng(lat, lng, ring) {
    if (!ring || ring.length < 3) {
      return false;
    }
    var inside = false;
    var i;
    for (i = 0; i < ring.length; i++) {
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
      var hi;
      for (hi = 1; hi < rings.length; hi++) {
        if (pointInRingLatLng(lat, lng, rings[hi])) {
          return false;
        }
      }
      return true;
    }
    if (geom.type === 'MultiPolygon') {
      var mp;
      for (mp = 0; mp < geom.coordinates.length; mp++) {
        var poly = geom.coordinates[mp];
        if (!poly || !poly.length) {
          continue;
        }
        if (!pointInRingLatLng(lat, lng, poly[0])) {
          continue;
        }
        var hj;
        var inHole = false;
        for (hj = 1; hj < poly.length; hj++) {
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
    var i;
    for (i = 0; i < ring.length - 1; i++) {
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
    var i;
    for (i = 0; i < ring.length - 1; i++) {
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

  function largestOuterRingFromGeometry(geom) {
    if (!geom || !geom.coordinates) {
      return null;
    }
    if (geom.type === 'Polygon') {
      return geom.coordinates[0] || null;
    }
    if (geom.type === 'MultiPolygon') {
      var best = null;
      var bestArea = -1;
      var m;
      for (m = 0; m < geom.coordinates.length; m++) {
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

  function polygonCentroidFromFeature(feature) {
    if (!feature || !feature.geometry) {
      return null;
    }
    var ring = largestOuterRingFromGeometry(feature.geometry);
    return ring ? ringAreaCentroid(ring) : null;
  }

  function shouldShowEntityLabels() {
    return state.entityLabelsWanted !== false;
  }

  function isRegionLevelPlaceKind(kind) {
    var k = String(kind || 'town').toLowerCase();
    return k === 'city' || k === 'town';
  }

  function boundaryFeatureLabelCenter(feature, layer) {
    var props = (feature && feature.properties) || {};
    var savedLat = Number(props.label_lat);
    var savedLng = Number(props.label_lng);
    if (savedLat === savedLat && savedLng === savedLng) {
      return L.latLng(savedLat, savedLng);
    }
    var centroid = polygonCentroidFromFeature(feature);
    if (centroid && pointInGeoJSONFeature(centroid.lat, centroid.lng, feature)) {
      return L.latLng(centroid.lat, centroid.lng);
    }
    if (layer && typeof layer.getBounds === 'function') {
      try {
        var boundsCenter = layer.getBounds().getCenter();
        if (pointInGeoJSONFeature(boundsCenter.lat, boundsCenter.lng, feature)) {
          return boundsCenter;
        }
        return boundsCenter;
      } catch (eBounds) {}
    }
    return centerFromFeatureGeometry(feature);
  }

  function pointInBoundaryLayer(latlng, layer) {
    if (!layer || !latlng || !layer.feature) {
      return false;
    }
    try {
      var bb = layer.getBounds();
      if (bb && bb.isValid() && !bb.contains(latlng)) {
        return false;
      }
    } catch (eBb) {
      return false;
    }
    return pointInGeoJSONFeature(latlng.lat, latlng.lng, layer.feature);
  }

  function resolveShabiyaAtLatLng(latlng) {
    if (!state.shabiyatLayer || !latlng) {
      return null;
    }
    var found = null;
    state.shabiyatLayer.eachLayer(function (layer) {
      if (found) {
        return;
      }
      if (!pointInBoundaryLayer(latlng, layer)) {
        return;
      }
      found = {
        layer: layer,
        properties: (layer.feature && layer.feature.properties) || {}
      };
    });
    return found;
  }

  function resolveNearestCityPlace(latlng) {
    if (!latlng || !state.cityPlaceByName) {
      return null;
    }
    var best = null;
    var bestD = Infinity;
    var keys = Object.keys(state.cityPlaceByName);
    var ki;
    for (ki = 0; ki < keys.length; ki++) {
      var name = keys[ki];
      var rec = state.cityPlaceByName[name];
      if (!rec || !isFinite(rec.lat) || !isFinite(rec.lng)) {
        continue;
      }
      var ll = L.latLng(rec.lat, rec.lng);
      var d = map.distance(latlng, ll);
      if (d < bestD) {
        bestD = d;
        best = { name: name, lat: rec.lat, lng: rec.lng, type: rec.type || 'town', distance: d };
      }
    }
    return best;
  }

  function resolveAreaBoundaryAtLatLng(latlng) {
    if (!latlng || !state.cityBoundariesLayer) {
      return null;
    }
    var found = null;
    state.cityBoundariesLayer.eachLayer(function (layer) {
      if (found) {
        return;
      }
      if (String(layer._addrLayerLevel || '') !== 'area') {
        return;
      }
      if (!pointInBoundaryLayer(latlng, layer)) {
        return;
      }
      var p = (layer.feature && layer.feature.properties) || {};
      found = {
        entityId: layer._addrEntityId || boundaryFeatureEntityId(layer.feature),
        name: String(p.name || '').trim(),
        cityId: parseInt(state.focusedCityId, 10) || 0
      };
    });
    return found;
  }

  function resolveCityIdInRegion(regionN, placeName, latlng) {
    var parentId = parseInt(regionN, 10) || 0;
    if (parentId < 1) {
      return Promise.resolve(0);
    }
    return fetch(boundaryListUrl('city', parentId), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    })
      .then(function (r) {
        if (!r.ok) {
          throw new Error('city_list http ' + r.status);
        }
        return r.json();
      })
      .then(function (fc) {
        if (!fc || !Array.isArray(fc.features) || !fc.features.length) {
          return 0;
        }
        var feats = filterBoundaryFeatures(fc.features, 0, { levelsOnly: ['city'] });
        if (!feats.length) {
          return 0;
        }
        var wantName = String(placeName || '').trim();
        var fi;
        for (fi = 0; fi < feats.length; fi++) {
          var props = feats[fi].properties || {};
          if (wantName && String(props.name || '').trim() === wantName) {
            return boundaryFeatureEntityId(feats[fi]);
          }
        }
        if (!latlng) {
          return boundaryFeatureEntityId(feats[0]);
        }
        var bestId = 0;
        var bestD = Infinity;
        for (fi = 0; fi < feats.length; fi++) {
          var f = feats[fi];
          var geom = f.geometry;
          if (!geom || !geom.coordinates) {
            continue;
          }
          var cLat = latlng.lat;
          var cLng = latlng.lng;
          if (geom.type === 'Polygon' && geom.coordinates[0] && geom.coordinates[0][0]) {
            cLng = geom.coordinates[0][0][0];
            cLat = geom.coordinates[0][0][1];
          }
          var ll = L.latLng(cLat, cLng);
          var d = map.distance(latlng, ll);
          if (d < bestD) {
            bestD = d;
            bestId = boundaryFeatureEntityId(f);
          }
        }
        return bestId;
      })
      .catch(function () {
        return 0;
      });
  }

  MC.resolveShabiyaAtLatLng = resolveShabiyaAtLatLng;
  MC.resolveNearestCityPlace = resolveNearestCityPlace;
  MC.resolveAreaBoundaryAtLatLng = resolveAreaBoundaryAtLatLng;
  MC.resolveCityIdInRegion = resolveCityIdInRegion;

  MC.showCityBoundaryOnly = showCityBoundaryOnly;
  MC.showCityChildBoundaries = showCityChildBoundaries;
  MC.showAreaWithStreets = showAreaWithStreets;
  MC.showBlockBoundaryOnly = showBlockBoundaryOnly;
  MC.showWilayahRegionGrids = showWilayahRegionGrids;
  MC.setBoundariesLayerEnabled = setBoundariesLayerEnabled;
  MC.hideBoundariesForAddressPick = hideBoundariesForAddressPick;
  MC.restoreBoundariesLayerPreference = restoreBoundariesLayerPreference;
  MC.restoreDefaultBoundaryLayers = restoreDefaultBoundaryLayers;
  MC.restoreShabiyatLayerIfHidden = restoreShabiyatLayerIfHidden;
  MC.hideShabiyatLayerForCityView = hideShabiyatLayerForCityView;
  MC.prepareBoundaryLayersForExport = prepareBoundaryLayersForExport;

  function countCityBoundaryLayers() {
    var n = 0;
    if (!state.cityBoundariesLayer) {
      return n;
    }
    state.cityBoundariesLayer.eachLayer(function () {
      n += 1;
    });
    return n;
  }

  function ensureCityBoundariesForExport() {
    return resolveExportBoundarySnapshot().then(function (snap) {
      return !!(snap && snap.length);
    });
  }

  function centerFromFeatureGeometry(feature) {
    var centroid = polygonCentroidFromFeature(feature);
    if (centroid && isFinite(centroid.lat) && isFinite(centroid.lng)) {
      return L.latLng(centroid.lat, centroid.lng);
    }
    var geom = feature && feature.geometry;
    if (!geom || !geom.coordinates) {
      return null;
    }
    var minLat = Infinity;
    var maxLat = -Infinity;
    var minLng = Infinity;
    var maxLng = -Infinity;
    function walkCoords(coords) {
      if (!coords) {
        return;
      }
      if (typeof coords[0] === 'number') {
        var lng = coords[0];
        var lat = coords[1];
        if (lat < minLat) {
          minLat = lat;
        }
        if (lat > maxLat) {
          maxLat = lat;
        }
        if (lng < minLng) {
          minLng = lng;
        }
        if (lng > maxLng) {
          maxLng = lng;
        }
        return;
      }
      for (var i = 0; i < coords.length; i++) {
        walkCoords(coords[i]);
      }
    }
    walkCoords(geom.coordinates);
    if (!isFinite(minLat)) {
      return null;
    }
    return L.latLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
  }

  function featuresToExportSnapshotItems(features) {
    var items = [];
    var list = Array.isArray(features) ? features : [];
    var i;
    for (i = 0; i < list.length; i++) {
      var feature = list[i];
      if (!feature || !feature.geometry) {
        continue;
      }
      var props = feature.properties || {};
      var center = centerFromFeatureGeometry(feature);
      items.push({
        feature: JSON.parse(JSON.stringify(feature)),
        style: exportStyleForFeature(feature),
        name: String(props.name || '').trim(),
        level: String(props.level || ''),
        isGrid: !!props.is_grid,
        anchorLat: center ? center.lat : null,
        anchorLng: center ? center.lng : null
      });
    }
    items.sort(function (a, b) {
      return exportLayerSortKey(a.feature) - exportLayerSortKey(b.feature);
    });
    return items;
  }

  function eachNestedPolygonLayer(layerContainer, callback) {
    if (!layerContainer || typeof layerContainer.eachLayer !== 'function' || typeof callback !== 'function') {
      return;
    }
    layerContainer.eachLayer(function (layer) {
      if (layer && typeof layer.eachLayer === 'function') {
        layer.eachLayer(function (sub) {
          if (sub && sub.feature && typeof sub.getLatLngs === 'function') {
            callback(sub);
          }
        });
        return;
      }
      if (layer && layer.feature && typeof layer.getLatLngs === 'function') {
        callback(layer);
      }
    });
  }

  function captureCityBoundarySnapshotItems() {
    var items = [];
    if (!state.cityBoundariesLayer || state.boundariesLayerWanted === false) {
      return items;
    }
    if (!map.hasLayer(state.cityBoundariesLayer)) {
      return items;
    }
    eachNestedPolygonLayer(state.cityBoundariesLayer, function (layer) {
      var feature = layer.feature;
      if (!feature || !feature.geometry) {
        return;
      }
      var props = feature.properties || {};
      var anchor = exportLabelAnchorForLayer(layer);
      items.push({
        feature: JSON.parse(JSON.stringify(feature)),
        style: layer._addrBoundaryBaseStyle || exportStyleForFeature(feature),
        name: String(props.name || '').trim(),
        level: String(props.level || ''),
        isGrid: !!props.is_grid,
        anchorLat: anchor ? anchor.lat : null,
        anchorLng: anchor ? anchor.lng : null
      });
    });
    return items;
  }

  function exportStyleFromLayer(layer, fallback) {
    var o = (layer && layer.options) || {};
    var fb = fallback || {};
    return {
      pane: o.pane || fb.pane,
      color: o.color != null ? o.color : fb.color,
      weight: o.weight != null ? o.weight : fb.weight,
      opacity: o.opacity != null ? o.opacity : fb.opacity,
      fillColor: o.fillColor != null ? o.fillColor : fb.fillColor,
      fillOpacity: o.fillOpacity != null ? o.fillOpacity : fb.fillOpacity,
      dashArray: o.dashArray != null ? o.dashArray : fb.dashArray,
      lineJoin: o.lineJoin || fb.lineJoin || 'round',
      lineCap: o.lineCap || fb.lineCap || 'round'
    };
  }

  function captureShabiyaSnapshotItems() {
    var items = [];
    if (!state.shabiyatLayer || state.boundariesLayerWanted === false) {
      return items;
    }
    if (!map.hasLayer(state.shabiyatLayer)) {
      return items;
    }
    state.shabiyatLayer.eachLayer(function (layer) {
      var feature = layer.feature;
      if (!feature || !feature.geometry) {
        return;
      }
      var props = feature.properties || {};
      var center = centerFromFeatureGeometry(feature);
      items.push({
        feature: JSON.parse(JSON.stringify(feature)),
        style: exportStyleFromLayer(layer, shabiyaStyle(feature)),
        name: String(props.name || props.code || '').trim(),
        level: 'shabiya',
        isGrid: false,
        anchorLat: center ? center.lat : null,
        anchorLng: center ? center.lng : null
      });
    });
    return items;
  }

  function readLayerCheckbox(id, defaultOn) {
    var cb = document.getElementById(id);
    if (!cb) {
      return defaultOn !== false;
    }
    return !!cb.checked;
  }

  function captureFullExportSnapshot() {
    var includeBoundaries =
      state.boundariesLayerWanted !== false && readLayerCheckbox('layer-boundaries', true);
    var items = [];
    if (includeBoundaries) {
      items = items.concat(captureCityBoundarySnapshotItems(), captureShabiyaSnapshotItems());
    }
    items.sort(function (a, b) {
      return exportLayerSortKey(a.feature) - exportLayerSortKey(b.feature);
    });
    return {
      items: items,
      opts: {
        includeEntityLabels: state.entityLabelsWanted !== false && readLayerCheckbox('layer-entity-labels', true),
        includeBoundaries: state.boundariesLayerWanted !== false && readLayerCheckbox('layer-boundaries', true),
        includePostalLabels: readLayerCheckbox('layer-labels', true)
      }
    };
  }

  function captureBoundaryExportSnapshot() {
    return captureFullExportSnapshot().items;
  }

  function fetchBoundarySnapshotForCity(cityId) {
    var cid = parseInt(cityId, 10) || 0;
    if (cid < 1) {
      return Promise.resolve([]);
    }
    var gen = placesLoadGeneration;
    var opSeq = cityBoundariesGeneration;
    return fetchBoundaryFeaturesRaw('area', cid, gen, opSeq, 0, { levelsOnly: ['area'] }).then(function (areaFeats) {
      if (!areaFeats.length) {
        return [];
      }
      return fetchStreetFeaturesForAreas(collectAreaIdsFromFeatures(areaFeats), gen, opSeq).then(function (streetFeats) {
        return featuresToExportSnapshotItems((areaFeats || []).concat(streetFeats || []));
      });
    });
  }

  function resolveExportBoundarySnapshot() {
    return Promise.resolve(captureFullExportSnapshot());
  }

  MC.captureBoundaryExportSnapshot = captureBoundaryExportSnapshot;
  MC.captureFullExportSnapshot = captureFullExportSnapshot;
  MC.resolveExportBoundarySnapshot = resolveExportBoundarySnapshot;
  MC.ensureCityBoundariesForExport = ensureCityBoundariesForExport;
  MC.paintBoundaryLabelOnCanvas = paintBoundaryLabelOnCanvas;

  function setBoundariesLayerEnabled(enabled, syncCheckbox) {
    var want = enabled !== false;
    state.boundariesLayerWanted = want;
    if (want) {
      state.boundariesTemporarilyHidden = false;
    }
    if (syncCheckbox !== false) {
      var cbSync = document.getElementById('layer-boundaries');
      if (cbSync) {
        cbSync.checked = want;
      }
    }
    applyBoundariesLayerVisibility();
  }

  /** Hide boundary/grid overlays temporarily — keeps the layer checkbox state. */
  function hideBoundariesForAddressPick() {
    state.boundariesTemporarilyHidden = true;
    applyBoundariesLayerVisibility();
  }

  function restoreDefaultBoundaryLayers() {
    state.boundariesLayerWanted = true;
    state.boundariesTemporarilyHidden = false;
    state.focusedCityId = 0;
    state.focusedAreaId = null;
    clearCityBoundaries();
    clearShabiyatDrilldownState();
    var cb = document.getElementById('layer-boundaries');
    if (cb) {
      cb.checked = true;
    }
    applyBoundariesLayerVisibility();
  }

  function restoreBoundariesLayerPreference() {
    state.boundariesTemporarilyHidden = false;
    applyBoundariesLayerVisibility();
  }

  function applyBoundariesLayerVisibility() {
    var wantBoundaries = state.boundariesLayerWanted !== false;
    var wantOnMap = wantBoundaries && !state.boundariesTemporarilyHidden;
    if (state.cityBoundariesLayer) {
      if (wantBoundaries) {
        if (!map.hasLayer(state.cityBoundariesLayer)) {
          state.cityBoundariesLayer.addTo(map);
        }
      } else if (map.hasLayer(state.cityBoundariesLayer)) {
        map.removeLayer(state.cityBoundariesLayer);
      }
    }
    if (state.shabiyatLayer && !state.shabiyatLayerHiddenForCity) {
      if (wantOnMap) {
        if (!map.hasLayer(state.shabiyatLayer)) {
          state.shabiyatLayer.addTo(map);
        }
      } else if (map.hasLayer(state.shabiyatLayer)) {
        map.removeLayer(state.shabiyatLayer);
      }
    }
  }

  function applyEntityLabelsVisibility() {
    var want = state.entityLabelsWanted !== false;
    var mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.classList.toggle('map-entity-labels-hidden', !want);
    }
    if (state.boundaryLabelLayer) {
      if (want) {
        if (!map.hasLayer(state.boundaryLabelLayer)) {
          state.boundaryLabelLayer.addTo(map);
        }
      } else if (map.hasLayer(state.boundaryLabelLayer)) {
        map.removeLayer(state.boundaryLabelLayer);
      }
    }
  }

  function wireLayerToggleCheckboxes() {
    var cbBoundaries = document.getElementById('layer-boundaries');
    var cbEntityLabels = document.getElementById('layer-entity-labels');
    state.boundariesLayerWanted = cbBoundaries ? cbBoundaries.checked : true;
    state.boundariesTemporarilyHidden = false;
    state.entityLabelsWanted = cbEntityLabels ? cbEntityLabels.checked : true;

    if (cbBoundaries) {
      cbBoundaries.addEventListener('change', function () {
        state.boundariesLayerWanted = cbBoundaries.checked;
        if (cbBoundaries.checked) {
          state.boundariesTemporarilyHidden = false;
          var detail = state.lastShabiyaDetail;
          if (detail && state.focusedCityId < 1) {
            var regionId = resolveRegionDbId(detail.n, detail.code);
            if (regionId > 0 && (!state.cityBoundariesLayer || state.cityBoundariesLayer.getLayers().length < 1)) {
              loadCityBoundariesForRegion(regionId, placesLoadGeneration);
            }
          }
        }
        applyBoundariesLayerVisibility();
      });
    }
    if (cbEntityLabels) {
      cbEntityLabels.addEventListener('change', function () {
        state.entityLabelsWanted = cbEntityLabels.checked;
        applyEntityLabelsVisibility();
        if (cbEntityLabels.checked) {
          if (state.focusedCityId > 0) {
            showCityChildBoundaries(state.focusedCityId, { flyTo: false, hidePlaceMarkers: false });
          } else if (state.lastShabiyaDetail) {
            var regionId = resolveRegionDbId(state.lastShabiyaDetail.n, state.lastShabiyaDetail.code);
            if (regionId > 0) {
              loadCityBoundariesForRegion(regionId, placesLoadGeneration);
            }
          }
        }
      });
    }
    applyBoundariesLayerVisibility();
    applyEntityLabelsVisibility();
  }

  wireLayerToggleCheckboxes();
  restoreDefaultBoundaryLayers();

  window.addEventListener('addr-map-reset', function () {
    restoreDefaultBoundaryLayers();
  });

  window.addEventListener('load', function () {
    restoreDefaultBoundaryLayers();
  });

  function colorToRgba(color, alpha) {
    var c = String(color || '').trim();
    if (!c) {
      return 'rgba(148,163,184,' + alpha + ')';
    }
    if (/^rgba\(/i.test(c)) {
      return c;
    }
    if (/^rgb\(/i.test(c)) {
      var rgbMatch = c.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
      if (rgbMatch) {
        return 'rgba(' + rgbMatch[1] + ',' + rgbMatch[2] + ',' + rgbMatch[3] + ',' + alpha + ')';
      }
    }
    var h = c.replace('#', '');
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    if (h.length !== 6) {
      return 'rgba(148,163,184,' + alpha + ')';
    }
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function parseDashArray(dashArray, scale) {
    if (!dashArray) {
      return [];
    }
    var parts = String(dashArray).split(/[,\s]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var n = parseFloat(parts[i]);
      if (isFinite(n) && n > 0) {
        out.push(n * scale);
      }
    }
    return out;
  }

  function exportLayerSortKey(feature) {
    var props = (feature && feature.properties) || {};
    if (props.is_grid) {
      return 0;
    }
    if (String(props.level || '') === 'area') {
      return 1;
    }
    if (String(props.level || '') === 'street') {
      return 2;
    }
    return 3;
  }

  function forEachPolygonRing(layer, callback) {
    if (!layer || typeof layer.getLatLngs !== 'function') {
      return;
    }
    var latlngs = layer.getLatLngs();
    function walk(arr, isHole) {
      if (!arr || !arr.length) {
        return;
      }
      if (arr[0] && typeof arr[0].lat === 'number') {
        callback(arr, !!isHole);
        return;
      }
      for (var i = 0; i < arr.length; i++) {
        walk(arr[i], i > 0);
      }
    }
    walk(latlngs, false);
  }

  function ringToCanvasPath(ctx, map, scale, ring) {
    for (var i = 0; i < ring.length; i++) {
      var pt = map.latLngToContainerPoint(ring[i]);
      var x = pt.x * scale;
      var y = pt.y * scale;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }

  function drawExportRoundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function paintRingsOnCanvas(ctx, mapRef, scale, rings, style) {
    if (!rings || !rings.length || !style || style.opacity == null || style.opacity <= 0 || style.weight <= 0) {
      return;
    }
    var fillOpacity = style.fillOpacity != null ? style.fillOpacity : 0;
    var hasFill = fillOpacity > 0.01;
    var dash = parseDashArray(style.dashArray, scale);

    ctx.save();
    ctx.lineJoin = style.lineJoin || 'round';
    ctx.lineCap = style.lineCap || 'round';
    ctx.setLineDash(dash);

    if (hasFill) {
      ctx.beginPath();
      for (var fi = 0; fi < rings.length; fi++) {
        ringToCanvasPath(ctx, mapRef, scale, rings[fi]);
      }
      ctx.fillStyle = colorToRgba(style.fillColor || style.color || '#94a3b8', fillOpacity);
      ctx.fill('evenodd');
    }

    ctx.strokeStyle = colorToRgba(style.color || '#94a3b8', style.opacity != null ? style.opacity : 0.9);
    ctx.lineWidth = Math.max(1, (style.weight || 1.4) * scale);
    for (var si = 0; si < rings.length; si++) {
      ctx.beginPath();
      ringToCanvasPath(ctx, mapRef, scale, rings[si]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function ringsFromSnapshotItem(item) {
    var rings = [];
    var geom = item && item.feature && item.feature.geometry;
    if (!geom || !geom.coordinates) {
      return rings;
    }
    if (geom.type === 'Polygon') {
      for (var pi = 0; pi < geom.coordinates.length; pi++) {
        rings.push(
          geom.coordinates[pi].map(function (c) {
            return L.latLng(c[1], c[0]);
          })
        );
      }
    } else if (geom.type === 'MultiPolygon') {
      for (var mp = 0; mp < geom.coordinates.length; mp++) {
        var poly = geom.coordinates[mp];
        for (var ri = 0; ri < poly.length; ri++) {
          rings.push(
            poly[ri].map(function (c) {
              return L.latLng(c[1], c[0]);
            })
          );
        }
      }
    }
    return rings;
  }

  function paintSnapshotExportItems(ctx, mapRef, scale, payload) {
    var items = [];
    var opts = { includeEntityLabels: true };
    if (payload && payload.items) {
      items = payload.items;
      opts = payload.opts || opts;
    } else if (Array.isArray(payload)) {
      items = payload;
    }
    if (!ctx || !mapRef || !items.length) {
      return;
    }
    if (opts.includeBoundaries === false) {
      return;
    }
    var i;
    for (i = 0; i < items.length; i++) {
      paintRingsOnCanvas(ctx, mapRef, scale, ringsFromSnapshotItem(items[i]), items[i].style);
    }
  }

  function paintBoundaryLabelBoxOnCanvas(ctx, scale, text, centerX, centerY, isStreet) {
    if (!ctx || !text) {
      return;
    }
    var fontSize = Math.round((isStreet ? 10.5 : 12.5) * scale);
    ctx.save();
    ctx.font = (isStreet ? '600' : '800') + ' ' + fontSize + 'px Tahoma, "Segoe UI", Arial, sans-serif';
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var metrics = ctx.measureText(text);
    var padX = 8 * scale;
    var padY = 5 * scale;
    var boxW = metrics.width + padX * 2;
    var boxH = fontSize + padY * 2;
    var left = centerX - boxW / 2;
    var top = centerY - boxH / 2;
    drawExportRoundedRect(ctx, left, top, boxW, boxH, 6 * scale);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
    ctx.lineWidth = Math.max(1, scale);
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 3 * scale;
    ctx.fillText(text, centerX, centerY);
    ctx.restore();
  }

  function paintLayerGroupPinLabelsOnCanvas(ctx, mapRef, scale, layerGroup) {
    if (!ctx || !mapRef || !layerGroup) {
      return;
    }
    var container = mapRef.getContainer();
    if (!container) {
      return;
    }
    var mapRect = container.getBoundingClientRect();
    layerGroup.eachLayer(function (marker) {
      var el = marker.getElement && marker.getElement();
      if (!el) {
        return;
      }
      var labelEl = el.querySelector('.city-place-pin__label');
      if (!labelEl) {
        return;
      }
      var text = (labelEl.textContent || '').trim();
      if (!text) {
        return;
      }
      var r = labelEl.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        return;
      }
      var cx = (r.left + r.width / 2 - mapRect.left) * scale;
      var cy = (r.top + r.height / 2 - mapRect.top) * scale;
      paintBoundaryLabelBoxOnCanvas(
        ctx,
        scale,
        text,
        cx,
        cy,
        labelEl.classList.contains('city-place-pin__label--street')
      );
    });
  }

  function paintEntityLabelsForExport(ctx, mapRef, scale, opts) {
    if (!ctx || !mapRef || !opts || opts.includeEntityLabels === false) {
      return;
    }
    if (state.boundaryLabelLayer && map.hasLayer(state.boundaryLabelLayer)) {
      paintLayerGroupPinLabelsOnCanvas(ctx, mapRef, scale, state.boundaryLabelLayer);
    }
    if (state.cityPlacesLayer && map.hasLayer(state.cityPlacesLayer)) {
      paintLayerGroupPinLabelsOnCanvas(ctx, mapRef, scale, state.cityPlacesLayer);
    }
  }

  function paintBoundaryLayerOnCanvas(ctx, map, scale, layer, style) {
    if (!style || style.opacity == null || style.opacity <= 0 || style.weight <= 0) {
      return;
    }
    var rings = [];
    forEachPolygonRing(layer, function (ring) {
      rings.push(ring);
    });
    paintRingsOnCanvas(ctx, map, scale, rings, style);
  }

  function paintBoundaryLabelOnCanvas(ctx, map, scale, text, center, isStreet) {
    if (!text || !center) {
      return;
    }
    var pt = map.latLngToContainerPoint(center);
    var x = pt.x * scale;
    var y = pt.y * scale;
    var fontSize = Math.round((isStreet ? 10.5 : 12.5) * scale);
    var padY = 5 * scale;
    var boxH = fontSize + padY * 2;
    paintBoundaryLabelBoxOnCanvas(ctx, scale, text, x, y - boxH / 2 - 10 * scale, isStreet);
  }

  function collectExportBoundaryLayers() {
    var layers = [];
    if (!state.cityBoundariesLayer) {
      return layers;
    }
    eachNestedPolygonLayer(state.cityBoundariesLayer, function (layer) {
      layers.push(layer);
    });
    layers.sort(function (a, b) {
      return exportLayerSortKey(a.feature) - exportLayerSortKey(b.feature);
    });
    return layers;
  }

  function exportLabelAnchorForLayer(layer) {
    if (!layer) {
      return null;
    }
    var feature = layer.feature;
    var props = (feature && feature.properties) || {};
    var savedLat = Number(props.label_lat);
    var savedLng = Number(props.label_lng);
    if (savedLat === savedLat && savedLng === savedLng) {
      return L.latLng(savedLat, savedLng);
    }
    var centered = boundaryFeatureLabelCenter(feature, layer);
    if (centered) {
      return centered;
    }
    var tip = layer.getTooltip && layer.getTooltip();
    if (tip && tip._latlng) {
      return tip._latlng;
    }
    try {
      return layer.getBounds().getCenter();
    } catch (anchorErr) {
      return null;
    }
  }

  function paintExportBoundaryLabels(ctx, mapRef, scale, layers) {
    for (var j = 0; j < layers.length; j++) {
      var layer2 = layers[j];
      var props = (layer2.feature && layer2.feature.properties) || {};
      if (props.is_grid) {
        continue;
      }
      var nm = String(props.name || '').trim();
      if (!nm) {
        continue;
      }
      paintBoundaryLabelOnCanvas(
        ctx,
        mapRef,
        scale,
        nm,
        exportLabelAnchorForLayer(layer2),
        String(props.level || '') === 'street'
      );
    }
  }

  function paintExportBoundaryLayersManual(ctx, mapRef, scale, layers) {
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var style = layer._addrBoundaryBaseStyle || exportStyleForFeature(layer.feature);
      paintBoundaryLayerOnCanvas(ctx, mapRef, scale, layer, style);
    }
  }

  function drawPaneSvgOntoCanvas(ctx, mapRef, paneName, scale) {
    return new Promise(function (resolve) {
      if (!ctx || !mapRef || typeof mapRef.getPane !== 'function') {
        resolve(false);
        return;
      }
      var pane = mapRef.getPane(paneName);
      if (!pane) {
        resolve(false);
        return;
      }
      var svgEl = pane.querySelector('svg');
      if (!svgEl || !svgEl.childNodes.length) {
        resolve(false);
        return;
      }
      var size = mapRef.getSize();
      try {
        var clone = svgEl.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', String(size.x));
        clone.setAttribute('height', String(size.y));
        if (!clone.getAttribute('viewBox')) {
          clone.setAttribute('viewBox', '0 0 ' + size.x + ' ' + size.y);
        }
        var xml = new XMLSerializer().serializeToString(clone);
        var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        var img = new Image();
        img.onload = function () {
          ctx.drawImage(img, 0, 0, size.x * scale, size.y * scale);
          resolve(true);
        };
        img.onerror = function () {
          resolve(false);
        };
        img.src = url;
      } catch (svgErr) {
        resolve(false);
      }
    });
  }

  function compositeMapExportCanvasSync(baseCanvas, mapRef, scale, payload) {
    if (!baseCanvas || !mapRef) {
      return baseCanvas;
    }
    var ctx = baseCanvas.getContext('2d');
    if (!ctx) {
      return baseCanvas;
    }
    var opts = payload && payload.opts ? payload.opts : {};
    var items = payload && payload.items ? payload.items : Array.isArray(payload) ? payload : [];
    if (items.length && opts.includeBoundaries !== false) {
      paintSnapshotExportItems(ctx, mapRef, scale, payload);
    } else {
      var layers = collectExportBoundaryLayers();
      if (layers.length && opts.includeBoundaries !== false) {
        paintExportBoundaryLayersManual(ctx, mapRef, scale, layers);
        if (opts.includeEntityLabels !== false) {
          paintExportBoundaryLabels(ctx, mapRef, scale, layers);
        }
      }
    }
    paintEntityLabelsForExport(ctx, mapRef, scale, opts);
    return baseCanvas;
  }

  /** Async wrapper kept for compatibility. */
  function compositeMapExportCanvas(baseCanvas, mapRef, scale, snapshot) {
    if (!baseCanvas || !mapRef) {
      return Promise.resolve(baseCanvas);
    }
    scale = scale || 1;
    var out = document.createElement('canvas');
    out.width = baseCanvas.width;
    out.height = baseCanvas.height;
    var ctx = out.getContext('2d');
    if (!ctx) {
      return Promise.resolve(baseCanvas);
    }
    ctx.drawImage(baseCanvas, 0, 0);
    compositeMapExportCanvasSync(out, mapRef, scale, snapshot);
    return Promise.resolve(out);
  }

  MC.compositeMapExportCanvasSync = compositeMapExportCanvasSync;
  MC.compositeMapExportCanvas = compositeMapExportCanvas;
  MC.paintExportOverlaysOnCanvas = compositeMapExportCanvas;

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
      state.focusedCityId = 0;
    }
    if (opts.resetShabiya !== false) {
      state.selectedShabiyaLayer = null;
      clearShabiyatDrilldownState();
      restoreShabiyatLayerIfHidden();
      if (!opts.keepShabiyaDetail) {
        state.lastShabiyaDetail = null;
        state.userOverviewLocked = false;
        state.pilotPrimaryCityId = 0;
      }
      resetShabiyatLayerStyles();
    }
    if (opts.clearSelectedPlace !== false) {
      state.selectedPlace = null;
    }
    if (window.MapCore && typeof window.MapCore.refreshMapMaskForView === 'function') {
      window.MapCore.refreshMapMaskForView();
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

  function boundsSpanDeg(bb) {
    if (!bb || !bb.isValid()) {
      return Infinity;
    }
    return Math.max(bb.getNorth() - bb.getSouth(), bb.getEast() - bb.getWest());
  }

  function collectPlaceLatLngs(placeRows) {
    var out = [];
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
      out.push(ll);
    }
    return out;
  }

  function anchorLatLng(placeRows, regionMeta, polygonBounds) {
    if (regionMeta && typeof regionMeta.lat === 'number' && typeof regionMeta.lng === 'number') {
      return L.latLng(regionMeta.lat, regionMeta.lng);
    }
    var pts = collectPlaceLatLngs(placeRows);
    if (pts.length) {
      var la = 0;
      var ln = 0;
      var pi;
      for (pi = 0; pi < pts.length; pi++) {
        la += pts[pi].lat;
        ln += pts[pi].lng;
      }
      return L.latLng(la / pts.length, ln / pts.length);
    }
    if (polygonBounds && polygonBounds.isValid()) {
      return polygonBounds.getCenter();
    }
    return null;
  }

  function centroidPadBounds(lat, lng, pad) {
    return L.latLngBounds([lat - pad, lng - pad], [lat + pad, lng + pad]);
  }

  /** Keep places near the shabiya centre — ignores distant outliers in large polygons. */
  function computeTrimmedPlaceBounds(placeRows, anchor, maxRadiusDeg) {
    if (!anchor) {
      return null;
    }
    var pts = collectPlaceLatLngs(placeRows);
    if (!pts.length) {
      return null;
    }
    var kept = [];
    var i;
    for (i = 0; i < pts.length; i++) {
      var dLat = pts[i].lat - anchor.lat;
      var dLng = pts[i].lng - anchor.lng;
      if (Math.sqrt(dLat * dLat + dLng * dLng) <= maxRadiusDeg) {
        kept.push(pts[i]);
      }
    }
    if (kept.length >= 2) {
      return L.latLngBounds(kept).pad(0.12);
    }
    if (kept.length === 1) {
      var p0 = kept[0];
      return L.latLngBounds(
        [p0.lat - 0.06, p0.lng - 0.06],
        [p0.lat + 0.06, p0.lng + 0.06]
      );
    }
    return null;
  }

  function resolveShabiyaFocusBounds(layer, placeRows, regionMeta, polygonBounds) {
    var polySpan = boundsSpanDeg(polygonBounds);
    var placeBounds = computeShabiyaFocusBounds(layer, placeRows, regionMeta);
    var placeSpan = boundsSpanDeg(placeBounds);

    /* Tight urban cluster (Benghazi-style) when places sit inside the polygon. */
    if (placeBounds && placeBounds.isValid()) {
      if (!polygonBounds || !polygonBounds.isValid() || placeSpan <= polySpan * 0.95) {
        if (placeSpan <= 1.0) {
          return placeBounds;
        }
      }
    }

    var anchor = anchorLatLng(placeRows, regionMeta, polygonBounds);

    /* Large coastal shabiyat (e.g. Derna): zoom to centre + nearby towns, not the full polygon. */
    if (polySpan > 1.0 && anchor) {
      var trimmed = computeTrimmedPlaceBounds(placeRows, anchor, 0.42);
      if (trimmed && trimmed.isValid() && boundsSpanDeg(trimmed) <= 0.95) {
        return trimmed;
      }
      if (regionMeta && typeof regionMeta.lat === 'number' && typeof regionMeta.lng === 'number') {
        var pad = polySpan > 1.8 ? 0.11 : (polySpan > 1.2 ? 0.14 : 0.18);
        return centroidPadBounds(regionMeta.lat, regionMeta.lng, pad);
      }
    }

    if (placeBounds && placeBounds.isValid()) {
      return placeBounds;
    }
    if (polygonBounds && polygonBounds.isValid()) {
      return polygonBounds;
    }
    return null;
  }

  function refreshShabiyaDrilldownView() {
    if (!map) {
      return;
    }
    var pilotActive = MC.isPilotShabiya && state.lastShabiyaDetail &&
      MC.isPilotShabiya(state.lastShabiyaDetail.name, state.lastShabiyaDetail.code);
    map.invalidateSize(false);
    if (MC.refreshMapMaskForView) {
      MC.refreshMapMaskForView();
    }
    if (MC.updateMapClipOverlays) {
      MC.updateMapClipOverlays();
    }
    if (MC.applyTileCoveragePanLock) {
      MC.applyTileCoveragePanLock({ snap: !pilotActive, animate: false });
    }
    if (MC.labels && typeof MC.labels.syncVisibility === 'function') {
      MC.labels.syncVisibility();
    }
    schedulePlaceLabelLayout();
    window.setTimeout(function () {
      if (MC.refreshMapMaskForView) {
        MC.refreshMapMaskForView();
      }
      if (MC.scheduleOfflineTileRefresh) {
        MC.scheduleOfflineTileRefresh();
      } else {
        [MC.offlineLayer, MC.offlineSatLayer].forEach(function (ly) {
          if (ly && map.hasLayer(ly) && typeof ly.redraw === 'function') {
            ly.redraw();
          }
        });
      }
    }, 80);
  }

  function flyToShabiyaFocus(focusBounds) {
    if (!map || !focusBounds || !focusBounds.isValid()) {
      return;
    }
    state.userOverviewLocked = true;
    var zCap = Math.max(10, maxZoomForFocusBounds(focusBounds));
    if (MC.isPilotShabiya && state.lastShabiyaDetail && MC.isPilotShabiya(state.lastShabiyaDetail.name, state.lastShabiyaDetail.code)) {
      zCap = Math.min(zCap, 10);
    }
    var flyBounds = focusBounds;
    if (MC.clampBoundsToOfflineTileZone) {
      var clamped = MC.clampBoundsToOfflineTileZone(focusBounds, zCap);
      if (clamped && clamped.isValid()) {
        flyBounds = clamped;
      }
    }
    var runFly = function () {
      if (!map || !flyBounds || !flyBounds.isValid()) {
        return;
      }
      map.invalidateSize(false);
      if (typeof map.stop === 'function') {
        map.stop();
      }
      if (MC.updateMapClipOverlays) {
        MC.updateMapClipOverlays();
      }
      if (MC.refreshMapMaskForView) {
        MC.refreshMapMaskForView();
      }
      if (MC.labels && typeof MC.labels.syncVisibility === 'function') {
        MC.labels.syncVisibility();
      }
      var pilotFly = MC.isPilotShabiya && state.lastShabiyaDetail &&
        MC.isPilotShabiya(state.lastShabiyaDetail.name, state.lastShabiyaDetail.code);
      if (pilotFly) {
        map.flyTo(flyBounds.getCenter(), zCap, { duration: 0.65 });
      } else {
        map.flyToBounds(flyBounds, {
          padding: [36, 36],
          maxZoom: zCap,
          duration: 0.65
        });
      }
      if (MC.scheduleAfterMapFly) {
        MC.scheduleAfterMapFly(function () {
          refreshShabiyaDrilldownView();
        }, 780);
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        requestAnimationFrame(runFly);
      });
    } else {
      setTimeout(runFly, 16);
    }
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

  function handleCityBoundaryClick(name, lat0, lng0, ev, entityId) {
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
    var eid = parseInt(entityId, 10) || 0;
    window.dispatchEvent(
      new CustomEvent('addr-place-select', { detail: { name: nameStr, lat: lat, lng: lng, type: type0, cityId: eid > 0 ? eid : 0 } })
    );
    if (eid > 0) {
      if (
        state.lastShabiyaDetail &&
        isPilotShabiya(state.lastShabiyaDetail.name, state.lastShabiyaDetail.code) &&
        !matchesPilotPrimaryCityName(nameStr)
      ) {
        MC.flyToPlace(lat, lng, type0);
        return;
      }
      if (isPilotPrimaryCityId(eid)) {
        showPilotDernaCityBoundaries(eid, {
          flyTo: true,
          hidePlaceMarkers: true,
          cityName: nameStr
        });
        MC.syncMarkerCtaReveal();
        return;
      }
      showCityChildBoundaries(eid, { flyTo: true, hidePlaceMarkers: true });
    } else {
      MC.flyToPlace(lat, lng, type0);
    }
    MC.syncMarkerCtaReveal();
  }

  function ingestBoundaryCityMarkers(cityFeats, gen, bbox) {
    var added = 0;
    var list = Array.isArray(cityFeats) ? cityFeats : [];
    var fi;
    for (fi = 0; fi < list.length; fi++) {
      if (!placeGenerationAlive(gen)) {
        break;
      }
      var feature = list[fi];
      var props = (feature && feature.properties) || {};
      if (props.is_grid && String(props.level || '') !== 'city') {
        continue;
      }
      if (String(props.level || '') !== 'city') {
        continue;
      }
      var nm = boundaryFeatureName(feature);
      if (!nm || state.cityPlaceByName[nm]) {
        continue;
      }
      var center = boundaryFeatureLabelCenter(feature, null);
      if (!center) {
        continue;
      }
      var ll = L.latLng(center.lat, center.lng);
      if (!bounds.contains(ll)) {
        continue;
      }
      if (bbox && typeof bbox.isValid === 'function' && bbox.isValid() && !bbox.contains(ll)) {
        continue;
      }
      state.cityPlaceByName[nm] = { lat: center.lat, lng: center.lng, type: 'city' };
      installYellowPlaceCircle(nm, center.lat, center.lng, 'city', added);
      added++;
    }
    return added;
  }

  function fitPilotDernaMapView(features, zoomHint) {
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
    } else if (map.removeLayer) {
      map.removeLayer(tmp);
    }
    if (!bb || !bb.isValid()) {
      return;
    }
    if (typeof map.stop === 'function') {
      map.stop();
    }
    var zCap = Math.min(maxZ, zoomHint != null ? zoomHint : 11);
    map.setView(bb.getCenter(), zCap, { animate: false });
    if (MC.applyTileCoveragePanLock) {
      MC.applyTileCoveragePanLock({ snap: false, animate: false });
    }
    if (MC.refreshMapMaskForView) {
      MC.refreshMapMaskForView();
    }
    if (MC.scheduleOfflineTileRefresh) {
      MC.scheduleOfflineTileRefresh();
    }
  }

  function fitPilotDernaShabiyaPreview(features) {
    var focus = CITY_VIEW_FOCUS['درنة'];
    if (focus && map) {
      if (typeof map.stop === 'function') {
        map.stop();
      }
      map.setView([focus.lat, focus.lng], 12, { animate: false });
      if (MC.applyTileCoveragePanLock) {
        MC.applyTileCoveragePanLock({ snap: false, animate: false });
      }
      if (MC.refreshMapMaskForView) {
        MC.refreshMapMaskForView();
      }
      if (MC.scheduleOfflineTileRefresh) {
        MC.scheduleOfflineTileRefresh();
      }
      return;
    }
    fitPilotDernaMapView(features, 12);
  }

  function fitPilotDernaCityView(areaFeats, opts) {
    opts = opts || {};
    if (!map) {
      return;
    }
    var feats = areaFeats && areaFeats.length ? areaFeats : [];
    if (!feats.length) {
      return;
    }
    var focusCfg = resolveCityViewFocusConfig(opts.cityName || 'درنة');
    var centerLl = resolveFocusCenterLatLng(feats, focusCfg);
    var bb = null;
    if (centerLl && focusCfg) {
      bb = boundsSymmetricAroundCenter(feats, centerLl, focusCfg);
    }
    if (!bb || !bb.isValid()) {
      fitPilotDernaMapView(feats, 14);
      return;
    }
    if (typeof map.stop === 'function') {
      map.stop();
    }
    var padTop = 52;
    var padLeft = 40;
    var padBottom = focusCfg && focusCfg.paddingBottom != null ? focusCfg.paddingBottom : 40;
    var padRight = 40;
    var extra = MC.CITY_SELECT_EXTRA_ZOOM != null ? MC.CITY_SELECT_EXTRA_ZOOM : NEIGHBORHOOD_VIEW_EXTRA_ZOOM;
    var absoluteCap = Math.min(maxZ, 14);
    var mapFloor = typeof map.getMinZoom === 'function' ? map.getMinZoom() : (MC.minZ || 5);
    var fitCap = Math.max(mapFloor, absoluteCap - extra);
    map.fitBounds(bb, {
      paddingTopLeft: [padLeft, padTop],
      paddingBottomRight: [padRight, padBottom],
      maxZoom: fitCap,
      animate: false
    });
    if (MC.bumpMapZoomLevels) {
      MC.bumpMapZoomLevels(extra, { animate: false, duration: 0 });
    }
    var targetZoom = absoluteCap;
    if (map.getZoom() < targetZoom) {
      map.setZoom(targetZoom, { animate: false });
    }
    if (focusCfg) {
      var dy = 0;
      if (focusCfg.panUpSteps) {
        dy -= (parseInt(focusCfg.panUpSteps, 10) || 0) * MAP_PAN_STEP_PX;
      }
      if (focusCfg.panDownSteps) {
        dy += (parseInt(focusCfg.panDownSteps, 10) || 0) * MAP_PAN_STEP_PX;
      }
      if (dy !== 0) {
        map.panBy([0, dy], { animate: false });
      }
    }
    if (MC.applyTileCoveragePanLock) {
      MC.applyTileCoveragePanLock({ snap: false, animate: false });
    }
    if (MC.refreshMapMaskForView) {
      MC.refreshMapMaskForView();
    }
  }

  function isPilotPrimaryCityId(cityId) {
    var cid = parseInt(cityId, 10) || 0;
    if (cid < 1 || !state.pilotPrimaryCityId) {
      return false;
    }
    return cid === Number(state.pilotPrimaryCityId);
  }

  function showPilotDernaCityBoundaries(cityId, opts) {
    opts = opts || {};
    var cid = parseInt(cityId, 10) || 0;
    if (cid < 1 || !state.cityBoundariesLayer) {
      return Promise.resolve(false);
    }
    var gen = placesLoadGeneration;
    clearCityBoundaries();
    var opSeq = ++cityBoundariesGeneration;
    if (opts.hidePlaceMarkers !== false) {
      state.cityPlaceByName = {};
      if (state.cityPlacesLayer) {
        state.cityPlacesLayer.clearLayers();
      }
      dispatchCityPlacesUpdated([]);
    }
    hideShabiyatLayerForCityView();
    state.focusedCityId = cid;
    state.focusedAreaId = null;
    state.pilotAreaPlacementActive = false;
    state.focusedAreaFeature = null;
    state.focusedAreaBounds = null;
    if (MC.clearAreaPanLock) {
      MC.clearAreaPanLock({ snap: false, animate: false });
    }
    resetPilotAreaPlacementChrome();
    restorePilotDernaAreaLayerStyles();
    restorePilotAreaLabelVisibility();

    return fetchSavedBoundaryFeature('city', cid, gen, opSeq)
      .then(function (savedCityFeature) {
        if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
          return false;
        }
        return fetchBoundaryFeaturesRaw('area', cid, gen, opSeq, 0, {
          levelsOnly: ['area'],
          savedOnly: true
        }).then(function (areaFeats) {
          if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
            return false;
          }
          var cityShellFeats = savedCityFeature ? [savedCityFeature] : [];
          var hasAreaGrid = !!(areaFeats && areaFeats.length);
          /* City view: show neighborhood grid only; keep city shell for shabiya preview fallback. */
          if (cityShellFeats.length && !hasAreaGrid) {
            renderBoundaryFeatures(
              cityShellFeats,
              function (nm, lat0, lng0, ev, entityId) {
                handleCityBoundaryClick(nm, lat0, lng0, ev, entityId);
              },
              {
                layerLevel: 'city',
                permanentLabels: false,
                pilotDocumentationGrid: true,
                pilotGridPart: 'shell'
              }
            );
          }
          if (hasAreaGrid) {
            renderBoundaryFeatures(
              areaFeats,
              function (nm, lat0, lng0, ev, entityId) {
                handleAreaBoundaryClick(nm, entityId, cid, lat0, lng0, ev);
              },
              {
                layerLevel: 'area',
                permanentLabels: shouldShowEntityLabels(),
                pilotDocumentationGrid: true,
                pilotGridPart: 'cell'
              }
            );
          }
          setPilotDernaGridMapClass(true);
          ensureCityBoundariesLayerOnMap();
          if (shouldFlyMapForBoundary(opts)) {
            state.userOverviewLocked = true;
            if (hasAreaGrid) {
              fitPilotDernaCityView(areaFeats, { cityName: opts.cityName || 'درنة' });
            } else if (cityShellFeats.length) {
              fitPilotDernaMapView(cityShellFeats, 14);
            }
          }
          refreshShabiyaDrilldownView();
          schedulePlaceLabelLayout();
          return true;
        });
      })
      .catch(function () {
        return false;
      });
  }
  MC.showPilotDernaCityBoundaries = showPilotDernaCityBoundaries;

  function renderPilotDernaDocumentationGrid(pilotEntityId, pilotCityFeats, gen, opSeq) {
    if (!pilotEntityId || !pilotCityFeats.length) {
      return Promise.resolve();
    }
    return fetchSavedBoundaryFeature('city', pilotEntityId, gen, opSeq)
      .then(function (savedCityFeature) {
        if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
          return;
        }
        var cityShellFeats = savedCityFeature ? [savedCityFeature] : pilotCityFeats;
        renderBoundaryFeatures(
          cityShellFeats,
          function (nm, lat0, lng0, ev, entityId) {
            handleCityBoundaryClick(nm, lat0, lng0, ev, entityId);
          },
          {
            layerLevel: 'city',
            permanentLabels: false,
            pilotDocumentationGrid: true,
            pilotGridPart: 'shell'
          }
        );
        setPilotDernaGridMapClass(true);
        ensureCityBoundariesLayerOnMap();
        if (shouldFlyMapForBoundary({ flyTo: true })) {
          state.userOverviewLocked = true;
          fitPilotDernaShabiyaPreview(cityShellFeats);
        }
        refreshShabiyaDrilldownView();
        schedulePlaceLabelLayout();
      });
  }

  function loadPilotShabiyaRegionView(regionId, gen, bbox, focusBounds) {
    if (!regionId || !state.cityBoundariesLayer) {
      return Promise.resolve(0);
    }
    var opSeq = ++cityBoundariesGeneration;
    return fetchBoundaryFeaturesRaw('city', regionId, gen, opSeq, 0, null)
      .then(function (allFeats) {
        if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
          return 0;
        }
        if (!allFeats.length) {
          return 0;
        }
        var addedMarkers = ingestBoundaryCityMarkers(allFeats, gen, bbox);
        var pilotEntityId = 0;
        var pi;
        for (pi = 0; pi < allFeats.length; pi++) {
          var props = (allFeats[pi].properties) || {};
          if (matchesPilotPrimaryCityName(props.name)) {
            pilotEntityId = boundaryFeatureEntityId(allFeats[pi]);
            break;
          }
        }
        var pilotFeats = [];
        if (pilotEntityId > 0) {
          for (pi = 0; pi < allFeats.length; pi++) {
            if (boundaryFeatureEntityId(allFeats[pi]) === pilotEntityId) {
              pilotFeats.push(allFeats[pi]);
            }
          }
        }
        if (pilotFeats.length) {
          state.pilotPrimaryCityId = pilotEntityId;
          return renderPilotDernaDocumentationGrid(pilotEntityId, pilotFeats, gen, opSeq).then(function () {
            return addedMarkers;
          });
        }
        state.pilotPrimaryCityId = 0;
        if (focusBounds && focusBounds.isValid && focusBounds.isValid()) {
          flyToShabiyaFocus(focusBounds);
        }
        return addedMarkers;
      })
      .catch(function () {
        return 0;
      });
  }

  function loadCityBoundariesForRegion(regionId, gen) {
    if (state.focusedCityId > 0) {
      return;
    }
    clearCityBoundaries();
    if (!regionId || !state.cityBoundariesLayer) {
      return;
    }
    var opSeq = ++cityBoundariesGeneration;
    fetchBoundaryFeaturesRaw('city', regionId, gen, opSeq, 0, { levelsOnly: ['city'] })
      .then(function (cityFeats) {
        if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
          return;
        }
        if (!cityFeats.length) {
          return;
        }
        var showCityBoundaryLabels =
          shouldShowEntityLabels() && Object.keys(state.cityPlaceByName || {}).length === 0;
        renderBoundaryFeatures(cityFeats, function (nm, lat0, lng0, ev, entityId) {
          handleCityBoundaryClick(nm, lat0, lng0, ev, entityId);
        }, { layerLevel: 'city', permanentLabels: showCityBoundaryLabels });
        ensureCityBoundariesLayerOnMap();
        schedulePlaceLabelLayout();
      })
      .catch(function () {});
  }

  function resolveMaskUrl(u) {
    if (!u) { return ''; }
    if (/^https?:\/\//i.test(u)) { return u; }
    try { return new URL(u, window.location.href).toString(); } catch (eU) { return u; }
  }

  function escapePlaceLabelHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function labelRectsOverlap(a, b, pad) {
    var gap = pad == null ? LABEL_COLLISION_PAD : pad;
    return !(
      a.right + gap < b.left ||
      a.left - gap > b.right ||
      a.bottom + gap < b.top ||
      a.top - gap > b.bottom
    );
  }

  function rectOverlapsAny(rect, placedRects, pad) {
    var pi;
    for (pi = 0; pi < placedRects.length; pi++) {
      if (labelRectsOverlap(rect, placedRects[pi], pad)) {
        return true;
      }
    }
    return false;
  }

  function countRectOverlaps(rect, placedRects, pad) {
    var count = 0;
    var pi;
    for (pi = 0; pi < placedRects.length; pi++) {
      if (labelRectsOverlap(rect, placedRects[pi], pad)) {
        count += 1;
      }
    }
    return count;
  }

  function applyPlacePinSlot(pinEl, labelEl, slot) {
    if (!pinEl) { return; }
    var dir = slot && slot.dir ? slot.dir : 'top';
    pinEl.className = 'city-place-pin city-place-pin--' + dir;
    pinEl.setAttribute('data-label-dir', dir);
    var ox = slot && slot.offset ? slot.offset[0] : 0;
    var oy = slot && slot.offset ? slot.offset[1] : 0;
    pinEl.style.setProperty('--label-ox', ox + 'px');
    pinEl.style.setProperty('--label-oy', oy + 'px');
    if (labelEl) {
      labelEl.style.marginLeft = '';
      labelEl.style.marginTop = '';
    }
  }

  function rebindBoundaryTooltip(layer, slot) {
    var meta = layer._addrTooltipMeta;
    if (!meta || !layer.bindTooltip) { return null; }
    var off = slot && slot.offset ? slot.offset : [0, 0];
    if (layer.unbindTooltip) {
      layer.unbindTooltip();
    }
    layer.bindTooltip(meta.text, {
      permanent: true,
      direction: slot && slot.dir ? slot.dir : 'top',
      className: meta.className,
      offset: L.point(off[0], off[1])
    });
    if (layer.openTooltip) {
      layer.openTooltip();
    }
    var tip = layer.getTooltip && layer.getTooltip();
    if (!tip || !tip.getElement) { return null; }
    return tip.getElement();
  }

  function pickLabelSlot(slots, seed, measureFn, placedRects, gridFallback, gridRange) {
    var bestFallback = null;
    var bestFallbackOverlaps = Infinity;
    var attempt;
    var range = gridRange != null ? gridRange : 156;
    var step = range > 180 ? 22 : 26;
    for (attempt = 0; attempt < slots.length; attempt++) {
      var slotIdx = (seed + attempt) % slots.length;
      var slot = slots[slotIdx];
      var rect = measureFn(slot);
      if (!rect || !rect.width || !rect.height) { continue; }
      if (!rectOverlapsAny(rect, placedRects)) {
        return { slot: slot, rect: rect, slotIdx: slotIdx };
      }
      var overlapCount = countRectOverlaps(rect, placedRects);
      if (overlapCount < bestFallbackOverlaps) {
        bestFallbackOverlaps = overlapCount;
        bestFallback = { slot: slot, rect: rect, slotIdx: slotIdx };
      }
    }
    if (gridFallback && bestFallbackOverlaps > 0) {
      var gy;
      for (gy = -range; gy <= range; gy += step) {
        var gx;
        for (gx = -range; gx <= range; gx += step) {
          if (gx === 0 && gy === 0) { continue; }
          var gridSlot = { dir: 'top', offset: [gx, gy] };
          var gridRect = measureFn(gridSlot);
          if (!gridRect || !gridRect.width || !gridRect.height) { continue; }
          if (!rectOverlapsAny(gridRect, placedRects)) {
            return { slot: gridSlot, rect: gridRect, slotIdx: -1 };
          }
        }
      }
    }
    return bestFallback;
  }

  function installBoundaryLabelPin(name, lat0, lng0, level, labelSeed) {
    if (!state.boundaryLabelLayer) { return null; }
    var safeName = escapePlaceLabelHtml(name);
    var lvl = String(level || 'area');
    var labelCls =
      lvl === 'street'
        ? ' city-place-pin__label--street'
        : lvl === 'city'
          ? ' city-place-pin__label--city'
          : ' city-place-pin__label--area';
    var cm = L.marker([lat0, lng0], {
      pane: 'cityPane',
      interactive: false,
      icon: L.divIcon({
        className: 'boundary-label-pin-icon',
        html:
          '<div class="city-place-pin city-place-pin--center city-place-pin--exact-anchor city-place-pin--label-only" data-label-dir="center" title="' +
          safeName +
          '">' +
          '<span class="city-place-pin__label' +
          labelCls +
          '">' +
          safeName +
          '</span>' +
          '</div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      })
    });
    cm._addrLabelSeed = labelSeed != null ? labelSeed : 0;
    cm._addrLayerLevel = lvl;
    cm.addTo(state.boundaryLabelLayer);
    return cm;
  }

  function layoutPinLabelsInLayer(layerGroup, placedRects, opts) {
    placedRects = placedRects || [];
    opts = opts || {};
    if (!layerGroup || !map) { return placedRects; }
    var gridRange = opts.gridRange != null ? opts.gridRange : 156;
    var layers = [];
    layerGroup.eachLayer(function (layer) {
      layers.push(layer);
    });
    if (!layers.length) { return placedRects; }

    layers.sort(function (a, b) {
      var la = String(a._addrLayerLevel || '');
      var lb = String(b._addrLayerLevel || '');
      if (la === 'area' && lb !== 'area') { return -1; }
      if (lb === 'area' && la !== 'area') { return 1; }
      var al = a.getLatLng ? a.getLatLng() : null;
      var bl = b.getLatLng ? b.getLatLng() : null;
      if (!al || !bl) { return 0; }
      if (al.lat !== bl.lat) { return al.lat < bl.lat ? -1 : 1; }
      return al.lng < bl.lng ? -1 : (al.lng > bl.lng ? 1 : 0);
    });

    var li;
    for (li = 0; li < layers.length; li++) {
      var layer = layers[li];
      var el = layer.getElement && layer.getElement();
      if (!el) { continue; }
      var pin = el.querySelector('.city-place-pin');
      var label = el.querySelector('.city-place-pin__label');
      if (!pin || !label) { continue; }

      var seed = layer._addrLabelSeed != null ? layer._addrLabelSeed : li;
      var picked = pickLabelSlot(PIN_LABEL_SLOTS, seed, function (slot) {
        applyPlacePinSlot(pin, label, slot);
        return label.getBoundingClientRect();
      }, placedRects, true, gridRange);
      if (picked) {
        layer._addrLabelSlotIdx = picked.slotIdx;
        applyPlacePinSlot(pin, label, picked.slot);
        placedRects.push(picked.rect);
      }
    }
    return placedRects;
  }

  function collectPinLabelRects(layerGroup) {
    var rects = [];
    if (!layerGroup) { return rects; }
    layerGroup.eachLayer(function (layer) {
      var el = layer.getElement && layer.getElement();
      if (!el) { return; }
      var label = el.querySelector('.city-place-pin__label');
      if (!label) { return; }
      var r = label.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        rects.push(r);
      }
    });
    return rects;
  }

  function resetBoundaryLabelPinLayout() {
    if (!state.boundaryLabelLayer) { return; }
    state.boundaryLabelLayer.eachLayer(function (layer) {
      var el = layer.getElement && layer.getElement();
      if (!el) { return; }
      var pin = el.querySelector('.city-place-pin');
      var label = el.querySelector('.city-place-pin__label');
      if (pin && label) {
        applyPlacePinSlot(pin, label, { dir: 'center', offset: [0, 0] });
      }
    });
  }

  function shouldAnchorPlaceLabelsExactly() {
    if (state.focusedCityId > 0 || state.focusedAreaId) {
      return false;
    }
    if (state.shabiyatDrilldownWanted || state.userOverviewLocked) {
      return true;
    }
    if (state.lastShabiyaDetail) {
      var key = String(state.lastShabiyaDetail.code || state.lastShabiyaDetail.name || '').trim();
      if (key) {
        return true;
      }
    }
    return false;
  }

  function layoutShabiyaPlaceLabelsExact() {
    if (!state.cityPlacesLayer) {
      return;
    }
    state.cityPlacesLayer.eachLayer(function (layer) {
      var el = layer.getElement && layer.getElement();
      if (!el) {
        return;
      }
      var pin = el.querySelector('.city-place-pin');
      var label = el.querySelector('.city-place-pin__label');
      if (pin && label) {
        applyPlacePinSlot(pin, label, { dir: 'center', offset: [0, 0] });
      }
    });
  }

  function layoutAllMapLabels() {
    /* Keep area/street labels at saved/center anchor — same as boundary editor. */
    resetBoundaryLabelPinLayout();
    if (shouldAnchorPlaceLabelsExactly()) {
      layoutShabiyaPlaceLabelsExact();
      return;
    }
    var placedRects = collectPinLabelRects(state.boundaryLabelLayer);
    layoutPinLabelsInLayer(state.cityPlacesLayer, placedRects, { gridRange: 156 });
  }

  function schedulePlaceLabelLayout() {
    if (placeLabelLayoutTimer) {
      clearTimeout(placeLabelLayoutTimer);
    }
    placeLabelLayoutTimer = setTimeout(function () {
      placeLabelLayoutTimer = null;
      layoutAllMapLabels();
    }, 40);
  }

  map.on('zoomend moveend', schedulePlaceLabelLayout);
  window.addEventListener('resize', schedulePlaceLabelLayout);

  function installYellowPlaceCircle(name, lat0, lng0, type0, labelSeed) {
    var safeName = escapePlaceLabelHtml(name);
    var exactAnchor = shouldAnchorPlaceLabelsExactly();
    var pinDir = exactAnchor ? 'center' : 'top';
    var pinExtraCls = exactAnchor ? ' city-place-pin--exact-anchor' : '';
    var dotHtml = exactAnchor
      ? ''
      : '<span class="city-place-pin__dot" aria-hidden="true"></span>';
    var cm = L.marker([lat0, lng0], {
      pane: 'cityPane',
      icon: L.divIcon({
        className: 'city-place-pin-icon',
        html:
          '<div class="city-place-pin city-place-pin--' +
          pinDir +
          pinExtraCls +
          '" data-label-dir="' +
          pinDir +
          '" title="' +
          safeName +
          '">' +
          dotHtml +
          '<span class="city-place-pin__label">' +
          safeName +
          '</span>' +
          '</div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      })
    });
    cm._addrLabelSeed = labelSeed != null ? labelSeed : 0;
    cm.on('mouseover', function () {
      var el = cm.getElement && cm.getElement();
      if (el) {
        var pin = el.querySelector('.city-place-pin');
        if (pin) { pin.classList.add('is-hover'); }
      }
      if (cm.bringToFront) { cm.bringToFront(); }
    });
    cm.on('mouseout', function () {
      var el = cm.getElement && cm.getElement();
      if (el) {
        var pin = el.querySelector('.city-place-pin');
        if (pin) { pin.classList.remove('is-hover'); }
      }
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
      if (nameSeen[nm]) {
        continue;
      }
      nameSeen[nm] = 1;
      state.cityPlaceByName[nm] = { lat: plat, lng: plng, type: pt };
      installYellowPlaceCircle(nm, plat, plng, pt, added);
      added++;
    }
    var keys = Object.keys(nameSeen).sort(function (a, bb) {
      return a.localeCompare(bb, 'ar');
    });
    if (added > 0) {
      schedulePlaceLabelLayout();
    }
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

    MC.showApiMsg('جارٍ تحميل الأماكن…', false);

    var ingestL = collectLocalPlaceRows(shName, shCode);
    var filterB = polygonBounds && polygonBounds.isValid() ? polygonBounds : (b && b.isValid() ? b : null);
    var resL = ingestPlaceRows(ingestL, gen, filterB, true);
    var regionId = resolveRegionDbId(state.lastShabiyaDetail.n, shCode);
    if (regionId > 0 && isPilotShabiya(shName, shCode)) {
      loadPilotShabiyaRegionView(regionId, gen, filterB, b).then(function (addedFromBounds) {
        if (!placeGenerationAlive(gen)) {
          return;
        }
        finishShabiyaPlacesLoad(gen, resL.added + addedFromBounds);
      });
      return;
    }
    if (regionId > 0) {
      loadCityBoundariesForRegion(regionId, gen);
    }
    finishShabiyaPlacesLoad(gen, resL.added);
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
    state.userOverviewLocked = true;
    try {
      window.dispatchEvent(new Event('addr-map-clear-annotations'));
    } catch (eAnn) {}
    var p = (layer.feature && layer.feature.properties) || {};
    var detail = {
      province: p.province || provinceLetter || '',
      n: p.n,
      name: String(nameHint || '').trim() || String(p.name || '').trim() || '',
      code: String(codeHint || '').trim() || String(p.code || '').trim()
    };
    state.lastShabiyaDetail = detail;
    state.selectedPlace = null;
    resetMapLayersForHierarchyChange({
      clearPlaces: true,
      resetShabiya: false,
      keepShabiyaDetail: true,
      clearSelectedPlace: true
    });
    if (MC.refreshMapMaskForView) {
      MC.refreshMapMaskForView();
    }
    var polygonBounds = null;
    try {
      polygonBounds = layer.getBounds();
    } catch (eGb) {
      polygonBounds = null;
    }

    var placeRows = collectLocalPlaceRows(detail.name, detail.code);
    var regionMeta = lookupRegionMeta(detail.code, detail.n);
    var focusBounds = resolveShabiyaFocusBounds(layer, placeRows, regionMeta, polygonBounds);
    var pilotShabiyaView = isPilotShabiya(detail.name, detail.code);
    if (pilotShabiyaView) {
      var dernaFocus = CITY_VIEW_FOCUS['درنة'];
      if (dernaFocus && typeof map.stop === 'function') {
        map.stop();
      }
      if (dernaFocus) {
        map.setView([dernaFocus.lat, dernaFocus.lng], 12, { animate: false });
      }
      if (MC.applyTileCoveragePanLock) {
        MC.applyTileCoveragePanLock({ snap: false, animate: false });
      }
      if (MC.refreshMapMaskForView) {
        MC.refreshMapMaskForView();
      }
    }
    if (focusBounds && focusBounds.isValid() && !pilotShabiyaView) {
      flyToShabiyaFocus(focusBounds);
    } else if (!pilotShabiyaView) {
      state.userOverviewLocked = false;
    }

    setShabiyaLayerSelected(layer);
    hideShabiyatLayerForDrilldown();
    loadPlacesForShabiyaBounds(focusBounds || polygonBounds, polygonBounds);
    restoreBoundariesLayerPreference();
    if (MC.labels && typeof MC.labels.syncVisibility === 'function') {
      MC.labels.syncVisibility();
    }
    MC.syncMarkerCtaReveal();
    return true;
  }

  function focusShabiyaFromFormImpl(name, provinceLetter, codeHint) {
    if (blockNonPilotShabiya(name, codeHint)) {
      return false;
    }
    if (readOnly) { return true; }
    var layer = findShabiyaLayer(name, provinceLetter, codeHint);
    if (!layer) { return false; }
    return focusShabiyaLayer(layer, name, provinceLetter, codeHint);
  }
  MC.focusShabiyaFromForm = focusShabiyaFromFormImpl;

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
      weight: 1.5,
      opacity: 0.92,
      fillColor: pal.fill,
      fillOpacity: 0.14,
      dashArray: null,
      lineJoin: 'round',
      lineCap: 'round'
    };
  }

  if (shabiyatUrl) {
    function loadShabiyatGeoJson() {
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

              if (blockNonPilotShabiya(p.name || '', p.code || '')) {
                return;
              }

              var fillDetail = {
                level: 'shabiya',
                province: p.province || '',
                area: p.n,
                place: p.name || '',
                code: p.code || ''
              };

              if (readOnly) {
                focusShabiyaLayer(layer, p.name || '', p.province || '', p.code || '');
                return;
              }

              /* Sync form first, then focus the clicked layer directly (same zoom path as dropdown). */
              window.dispatchEvent(new CustomEvent('addr-map-fill', { detail: fillDetail }));
              focusShabiyaLayer(layer, p.name || '', p.province || '', p.code || '');

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
        });
        if (state.shabiyatDrilldownWanted || state.shabiyatLayerHiddenForCity) {
          hideShabiyatLayerForDrilldown();
        } else {
          applyBoundariesLayerVisibility();
        }
        if (MC.labels && typeof MC.labels.setCentroidsFromLayers === 'function') {
          MC.labels.setCentroidsFromLayers(state.shabiyatLayer);
        }
        if (typeof MC.refreshMapMaskForView === 'function') {
          MC.refreshMapMaskForView();
        }
        syncShabiyatLayerOrder();
      })
      .catch(function () {});
    }

    function syncShabiyatLayerOrder() {
      if (!state.shabiyatLayer || typeof state.shabiyatLayer.eachLayer !== 'function') {
        return;
      }
      state.shabiyatLayer.eachLayer(function (layer) {
        if (layer && layer.bringToFront) {
          layer.bringToFront();
        }
      });
    }

    map.whenReady(function () {
      loadShabiyatGeoJson();
    });
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
})(0);
