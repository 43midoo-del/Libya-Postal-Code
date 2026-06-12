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
  var PLACE_LABEL_DIRS = ['top', 'right', 'bottom', 'left'];
  var placeLabelLayoutTimer = null;

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

  function boundaryFeatureStyleForRender(p, ctx) {
    var props = p || {};
    var ctx0 = ctx || {};
    var eid = ctx0.entityId != null ? Number(ctx0.entityId) : 0;
    var layerLevel = String(ctx0.layerLevel || '');
    var emphasizeArea = ctx0.emphasizeEntityId != null ? Number(ctx0.emphasizeEntityId) : 0;
    var highlightStreet = ctx0.highlightStreetId != null ? Number(ctx0.highlightStreetId) : 0;

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
    if (renderOpts && renderOpts.layerLevel === 'area') {
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
    map.flyToBounds(bb, {
      paddingTopLeft: [56, 92],
      paddingBottomRight: [56, 56],
      maxZoom: zCap,
      duration: flyOpts.duration != null ? flyOpts.duration : 0.6
    });
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
            entityId: boundaryFeatureEntityId(feature)
          });
        },
        onEachFeature: function (feature, layer) {
          var p = (feature && feature.properties) || {};
          var eid = boundaryFeatureEntityId(feature);
          var baseStyle = boundaryFeatureStyleForRender(p, {
            emphasis: emphasis,
            emphasizeEntityId: renderOpts.emphasizeEntityId,
            highlightStreetId: renderOpts.highlightStreetId,
            layerLevel: renderOpts.layerLevel,
            entityId: eid
          });
          layer._addrBoundaryBaseStyle = baseStyle;
          var nm = String(p.name || '').trim();
          if (!nm) { return; }
          if (renderOpts.permanentLabels) {
            layer.bindTooltip(nm, {
              permanent: true,
              direction: 'top',
              className: boundaryLabelClass(renderOpts)
            });
          } else if (!state.cityPlaceByName[nm]) {
            layer.bindTooltip(nm, { sticky: true, direction: 'top', className: 'shabiya-tooltip' });
          }
          layer.on('mouseover', function () {
            startBorderPulse(layer, boundaryFeatureHoverStyle(baseStyle, p));
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

  function fetchBoundaryFeaturesRaw(level, parentId, gen, opSeq, entityId) {
    if (!parentId) {
      return Promise.resolve([]);
    }
    var url =
      'index.php?r=boundary_list&level=' +
      encodeURIComponent(String(level)) +
      '&parent_id=' +
      encodeURIComponent(String(parentId));
    return fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    })
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
        return filterBoundaryFeatures(fc.features, entityId || 0);
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
      handleCityBoundaryClick(nm, lat0, lng0, ev, entityId);
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

  function handleAreaBoundaryClick(name, entityId, cityId, lat0, lng0, ev) {
    if (L && L.DomEvent && ev) { L.DomEvent.stopPropagation(ev); }
    var nameStr = String(name || '').trim();
    var eid = parseInt(entityId, 10) || 0;
    var cid = parseInt(cityId, 10) || 0;
    if (!nameStr || eid < 1 || cid < 1) { return; }
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

    return fetchBoundaryFeaturesRaw('area', cid, gen, opSeq, 0).then(function (areaFeats) {
      if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
        return false;
      }
      return fetchBoundaryFeaturesRaw('street', aid, gen, opSeq, 0).then(function (streetFeats) {
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
              highlightStreetId: opts.highlightStreetId
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
            emphasizeEntityId: aid
          }
        );

        var flyFeats = collectFeaturesByEntityId(areaFeats, aid).concat(streetFeats || []);
        if (opts.highlightStreetId) {
          var hi = collectFeaturesByEntityId(streetFeats, opts.highlightStreetId);
          if (hi.length) {
            flyFeats = collectFeaturesByEntityId(areaFeats, aid).concat(hi);
          }
        }
        if (opts.flyTo !== false && flyFeats.length) {
          state.userOverviewLocked = true;
          flyToBoundaryFeatureBounds(flyFeats, { maxZoom: Math.min(maxZ, opts.highlightStreetId ? 16 : 15) });
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
    if (opts.hidePlaceMarkers !== false && state.cityPlacesLayer) {
      state.cityPlacesLayer.clearLayers();
    }
    state.focusedCityId = cid;
    state.focusedAreaId = null;
    return fetchBoundaryFeaturesRaw('area', cid, gen, opSeq, 0).then(function (areaFeats) {
      if (opSeq !== cityBoundariesGeneration || gen !== placesLoadGeneration) {
        return false;
      }
      if (!areaFeats.length) {
        var regionId0 =
          state.lastShabiyaDetail && state.lastShabiyaDetail.n != null ? state.lastShabiyaDetail.n : 0;
        if (regionId0) {
          fetchBoundaryList('city', regionId0, gen, cid, null);
        }
        if (opts.flyTo !== false) {
          state.userOverviewLocked = true;
          if (MC.flyToEntityLocation) {
            MC.flyToEntityLocation('city', cid);
          }
        }
        return regionId0 > 0;
      }
      renderBoundaryFeatures(areaFeats, function (nm, lat0, lng0, ev, entityId) {
        handleAreaBoundaryClick(nm, entityId, cid, lat0, lng0, ev);
      }, { emphasis: false, permanentLabels: true, layerLevel: 'area' });
      if (opts.flyTo !== false) {
        state.userOverviewLocked = true;
        flyToBoundaryFeatureBounds(areaFeats, { maxZoom: Math.min(maxZ, 14) });
      }
      return true;
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
  MC.showCityChildBoundaries = showCityChildBoundaries;
  MC.showAreaWithStreets = showAreaWithStreets;
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
        state.userOverviewLocked = false;
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

  function flyToShabiyaFocus(focusBounds) {
    if (!map || !focusBounds || !focusBounds.isValid()) {
      return;
    }
    state.userOverviewLocked = true;
    var zCap = Math.max(10, maxZoomForFocusBounds(focusBounds));
    var runFly = function () {
      if (!map || !focusBounds || !focusBounds.isValid()) {
        return;
      }
      map.invalidateSize(false);
      if (typeof map.stop === 'function') {
        map.stop();
      }
      map.flyToBounds(focusBounds, {
        padding: [48, 48],
        maxZoom: zCap,
        duration: 0.65
      });
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
      showCityChildBoundaries(eid, { flyTo: true, hidePlaceMarkers: true });
    } else {
      MC.flyToPlace(lat, lng, type0);
    }
    MC.syncMarkerCtaReveal();
  }

  function loadCityBoundariesForRegion(regionId, gen) {
    clearCityBoundaries();
    if (!regionId || !state.cityBoundariesLayer) {
      return;
    }
    fetchBoundaryList('city', regionId, gen, 0, function (nm, lat0, lng0, ev, entityId) {
      handleCityBoundaryClick(nm, lat0, lng0, ev, entityId);
    });
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
    var gap = pad == null ? 4 : pad;
    return !(
      a.right + gap < b.left ||
      a.left - gap > b.right ||
      a.bottom + gap < b.top ||
      a.top - gap > b.bottom
    );
  }

  function applyPlacePinDirection(pinEl, dirIdx) {
    if (!pinEl) { return; }
    var dir = PLACE_LABEL_DIRS[((dirIdx % PLACE_LABEL_DIRS.length) + PLACE_LABEL_DIRS.length) % PLACE_LABEL_DIRS.length];
    pinEl.className = 'city-place-pin city-place-pin--' + dir;
    pinEl.setAttribute('data-label-dir', dir);
  }

  function layoutCityPlaceLabels() {
    if (!state.cityPlacesLayer || !map) { return; }
    var layers = [];
    state.cityPlacesLayer.eachLayer(function (layer) {
      layers.push(layer);
    });
    if (!layers.length) { return; }

    layers.sort(function (a, b) {
      var al = a.getLatLng ? a.getLatLng() : null;
      var bl = b.getLatLng ? b.getLatLng() : null;
      if (!al || !bl) { return 0; }
      if (al.lat !== bl.lat) { return al.lat < bl.lat ? -1 : 1; }
      return al.lng < bl.lng ? -1 : (al.lng > bl.lng ? 1 : 0);
    });

    var placedRects = [];
    var li;
    for (li = 0; li < layers.length; li++) {
      var layer = layers[li];
      var el = layer.getElement && layer.getElement();
      if (!el) { continue; }
      var pin = el.querySelector('.city-place-pin');
      var label = el.querySelector('.city-place-pin__label');
      if (!pin || !label) { continue; }

      var seed = layer._addrLabelSeed != null ? layer._addrLabelSeed : li;
      var chosen = seed % PLACE_LABEL_DIRS.length;
      var attempt;
      for (attempt = 0; attempt < PLACE_LABEL_DIRS.length; attempt++) {
        var dirIdx = (seed + attempt) % PLACE_LABEL_DIRS.length;
        applyPlacePinDirection(pin, dirIdx);
        var rect = label.getBoundingClientRect();
        var overlaps = false;
        var pi;
        for (pi = 0; pi < placedRects.length; pi++) {
          if (labelRectsOverlap(rect, placedRects[pi])) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          chosen = dirIdx;
          placedRects.push(rect);
          break;
        }
        if (attempt === PLACE_LABEL_DIRS.length - 1) {
          placedRects.push(rect);
        }
      }
      layer._addrLabelDirIdx = chosen;
      applyPlacePinDirection(pin, chosen);
    }
  }

  function schedulePlaceLabelLayout() {
    if (placeLabelLayoutTimer) {
      clearTimeout(placeLabelLayoutTimer);
    }
    placeLabelLayoutTimer = setTimeout(function () {
      placeLabelLayoutTimer = null;
      layoutCityPlaceLabels();
    }, 40);
  }

  map.on('zoomend moveend', schedulePlaceLabelLayout);

  function installYellowPlaceCircle(name, lat0, lng0, type0, labelSeed) {
    var safeName = escapePlaceLabelHtml(name);
    var cm = L.marker([lat0, lng0], {
      pane: 'cityPane',
      icon: L.divIcon({
        className: 'city-place-pin-icon',
        html:
          '<div class="city-place-pin city-place-pin--top" data-label-dir="top" title="' +
          safeName +
          '">' +
          '<span class="city-place-pin__dot" aria-hidden="true"></span>' +
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
    state.userOverviewLocked = true;
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
    var focusBounds = resolveShabiyaFocusBounds(layer, placeRows, regionMeta, polygonBounds);
    if (focusBounds && focusBounds.isValid()) {
      flyToShabiyaFocus(focusBounds);
    } else {
      state.userOverviewLocked = false;
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
              if (window.AddrMap && typeof window.AddrMap.prepareHierarchyChange === 'function') {
                window.AddrMap.prepareHierarchyChange('shabiya');
              }

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
