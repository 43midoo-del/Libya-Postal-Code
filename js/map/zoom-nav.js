/**
 * Semantic zoom navigation: +/- drills between administrative levels
 * (Libya → wilayah → shabiya → city → area) with form sync.
 */
(function () {
  'use strict';

  if (!window.MapCore || !window.MapCore.map) {
    return;
  }

  var MC = window.MapCore;
  var map = MC.map;
  var state = MC.state;
  var readOnly = MC.readOnly;

  var PROV_TO_WILKEY = { B: 'barqa', T: 'tripolitania', F: 'fezzan' };
  var LEVELS = ['country', 'wilayah', 'shabiya', 'city', 'area'];

  var nav = {
    level: 'country',
    busy: false
  };

  function canSemanticZoom() {
    if (readOnly) {
      return false;
    }
    if (state.drawMode && state.drawMode !== 'none') {
      return false;
    }
    if (state.markerModePending) {
      return false;
    }
    return true;
  }

  function mapCenter() {
    return map.getCenter();
  }

  function inferLevelFromState() {
    if (state.focusedAreaId > 0) {
      return 'area';
    }
    if (state.focusedCityId > 0) {
      return 'city';
    }
    if (state.lastShabiyaDetail && String(state.lastShabiyaDetail.name || state.lastShabiyaDetail.code || '').trim()) {
      if (state.cityBoundariesLayer && state.cityBoundariesLayer.getLayers().length > 0) {
        return 'city';
      }
      if (state.cityPlacesLayer && state.cityPlacesLayer.getLayers().length > 0) {
        return 'shabiya';
      }
      return 'shabiya';
    }
    var wilayahSel = document.getElementById('addr-wilayah');
    if (wilayahSel && String(wilayahSel.value || '').trim()) {
      return 'wilayah';
    }
    return 'country';
  }

  function syncNavLevelFromMap() {
    nav.level = inferLevelFromState();
  }

  function dispatchMapFill(detail) {
    try {
      window.dispatchEvent(
        new CustomEvent('addr-map-fill', { detail: Object.assign({ zoomNav: true }, detail || {}) })
      );
    } catch (eFill) {}
  }

  function provinceToWilayahKey(prov) {
    return PROV_TO_WILKEY[String(prov || '').trim().toUpperCase()] || '';
  }

  function resolveShabiyaHit() {
    if (typeof MC.resolveShabiyaAtLatLng === 'function') {
      return MC.resolveShabiyaAtLatLng(mapCenter());
    }
    return null;
  }

  function drillToCountry() {
    if (MC.resetMapLayersForHierarchyChange) {
      MC.resetMapLayersForHierarchyChange({
        clearPlaces: true,
        resetShabiya: true,
        keepShabiyaDetail: false,
        clearSelectedPlace: true
      });
    }
    if (MC.clearMapSelection) {
      MC.clearMapSelection();
    }
    if (MC.fitFullLibyaInView) {
      MC.fitFullLibyaInView({ animate: true, force: true });
    }
    dispatchMapFill({ level: 'country' });
    nav.level = 'country';
  }

  function drillToWilayah(wk, prov) {
    if (!wk) {
      return false;
    }
    if (window.AddrMap && typeof window.AddrMap.prepareHierarchyChange === 'function') {
      window.AddrMap.prepareHierarchyChange('wilayah');
    }
    if (MC.showWilayahRegionGrids) {
      MC.showWilayahRegionGrids(wk);
    } else if (MC.flyToWilayahKey) {
      MC.flyToWilayahKey(wk);
    }
    if (prov) {
      dispatchMapFill({ level: 'wilayah', province: prov });
    }
    nav.level = 'wilayah';
    return true;
  }

  function drillToShabiya(hit) {
    if (!hit || !hit.layer) {
      return false;
    }
    var p = hit.properties || {};
    if (MC.blockNonPilotShabiya && MC.blockNonPilotShabiya(p.name || '', p.code || '')) {
      return false;
    }
    if (window.AddrMap && typeof window.AddrMap.prepareHierarchyChange === 'function') {
      window.AddrMap.prepareHierarchyChange('shabiya');
    }
    dispatchMapFill({
      level: 'shabiya',
      province: p.province || '',
      area: p.n,
      place: p.name || '',
      code: p.code || ''
    });
    if (typeof MC.focusShabiyaFromForm === 'function') {
      MC.focusShabiyaFromForm(p.name || '', p.province || '', p.code || '');
    }
    nav.level = 'shabiya';
    return true;
  }

  function drillToCity(place) {
    if (!place || !place.name) {
      return Promise.resolve(false);
    }
    var detail = state.lastShabiyaDetail || {};
    var regionN = detail.n;
    if (window.AddrMap && typeof window.AddrMap.prepareHierarchyChange === 'function') {
      window.AddrMap.prepareHierarchyChange('city');
    }
    dispatchMapFill({ level: 'city', place: place.name });
    var resolveCity = typeof MC.resolveCityIdInRegion === 'function'
      ? MC.resolveCityIdInRegion(regionN, place.name, L.latLng(place.lat, place.lng))
      : Promise.resolve(0);
    return resolveCity.then(function (cityId) {
      if (cityId > 0 && window.AddrMap && typeof window.AddrMap.showCityChildBoundaries === 'function') {
        return window.AddrMap.showCityChildBoundaries(cityId, {
          flyTo: true,
          hidePlaceMarkers: true,
          cityName: place.name
        }).then(function () {
          nav.level = 'city';
          return true;
        });
      }
      if (MC.flyToPlace) {
        MC.flyToPlace(place.lat, place.lng, place.type || 'town');
      }
      nav.level = 'city';
      return true;
    });
  }

  function drillToArea(areaHit) {
    if (!areaHit || areaHit.entityId < 1) {
      return false;
    }
    var cityId = areaHit.cityId || parseInt(state.focusedCityId, 10) || 0;
    if (cityId < 1) {
      return false;
    }
    try {
      window.dispatchEvent(
        new CustomEvent('addr-block-select', {
          detail: {
            level: 'area',
            id: areaHit.entityId,
            name: areaHit.name,
            parentId: cityId,
            zoomNav: true
          }
        })
      );
    } catch (eBlk) {}
    if (window.AddrMap && typeof window.AddrMap.showAreaWithStreets === 'function') {
      window.AddrMap.showAreaWithStreets(areaHit.entityId, cityId, { flyTo: true });
    }
    nav.level = 'area';
    return true;
  }

  function drillIn() {
    if (!canSemanticZoom() || nav.busy) {
      return;
    }
    syncNavLevelFromMap();
    var level = nav.level;
    var hit;

    if (level === 'country') {
      var nr = MC.nearestRegion ? MC.nearestRegion(mapCenter().lat, mapCenter().lng) : null;
      var prov = nr ? nr.province : '';
      hit = resolveShabiyaHit();
      if (hit && hit.properties && hit.properties.province) {
        prov = hit.properties.province;
      }
      var wk = provinceToWilayahKey(prov);
      if (wk) {
        drillToWilayah(wk, prov);
      }
      return;
    }

    if (level === 'wilayah') {
      hit = resolveShabiyaHit();
      if (hit) {
        drillToShabiya(hit);
      }
      return;
    }

    if (level === 'shabiya') {
      var place = typeof MC.resolveNearestCityPlace === 'function'
        ? MC.resolveNearestCityPlace(mapCenter())
        : null;
      if (!place) {
        return;
      }
      nav.busy = true;
      drillToCity(place).finally(function () {
        nav.busy = false;
      });
      return;
    }

    if (level === 'city') {
      var areaHit = typeof MC.resolveAreaBoundaryAtLatLng === 'function'
        ? MC.resolveAreaBoundaryAtLatLng(mapCenter())
        : null;
      if (areaHit) {
        drillToArea(areaHit);
      } else if (MC.bumpMapZoomLevels) {
        MC.bumpMapZoomLevels(1, { animate: true });
      }
      return;
    }

    if (level === 'area' && MC.bumpMapZoomLevels) {
      MC.bumpMapZoomLevels(1, { animate: true });
    }
  }

  function drillOut() {
    if (!canSemanticZoom() || nav.busy) {
      return;
    }
    syncNavLevelFromMap();
    var level = nav.level;
    var detail = state.lastShabiyaDetail || {};

    if (level === 'area') {
      var cityId = parseInt(state.focusedCityId, 10) || 0;
      if (
        state.pilotAreaPlacementActive &&
        window.MapCore &&
        typeof window.MapCore.exitPilotAreaPlacementMode === 'function'
      ) {
        nav.busy = true;
        window.MapCore.exitPilotAreaPlacementMode({ refitCity: true }).finally(function () {
          nav.busy = false;
          nav.level = 'city';
        });
        return;
      }
      if (
        cityId > 0 &&
        window.MapCore &&
        typeof window.MapCore.isPilotPrimaryCityId === 'function' &&
        window.MapCore.isPilotPrimaryCityId(cityId) &&
        window.AddrMap &&
        typeof window.AddrMap.showPilotDernaCityBoundaries === 'function'
      ) {
        nav.busy = true;
        window.AddrMap.showPilotDernaCityBoundaries(cityId, {
          flyTo: true,
          hidePlaceMarkers: true,
          cityName: state.selectedPlace ? state.selectedPlace.name : 'درنة'
        }).finally(function () {
          nav.busy = false;
          nav.level = 'city';
        });
        return;
      }
      if (cityId > 0 && window.AddrMap && typeof window.AddrMap.showCityChildBoundaries === 'function') {
        nav.busy = true;
        window.AddrMap.showCityChildBoundaries(cityId, {
          flyTo: true,
          hidePlaceMarkers: true,
          cityName: state.selectedPlace ? state.selectedPlace.name : ''
        }).finally(function () {
          nav.busy = false;
          nav.level = 'city';
        });
      }
      return;
    }

    if (level === 'city') {
      if (MC.resetMapLayersForHierarchyChange) {
        MC.resetMapLayersForHierarchyChange({
          clearPlaces: false,
          resetShabiya: false,
          keepShabiyaDetail: true,
          clearSelectedPlace: true
        });
      }
      if (MC.restoreShabiyatLayerIfHidden) {
        MC.restoreShabiyatLayerIfHidden();
      }
      if (detail.name && detail.province && typeof MC.focusShabiyaFromForm === 'function') {
        MC.focusShabiyaFromForm(detail.name, detail.province, detail.code || '');
        dispatchMapFill({
          level: 'shabiya',
          province: detail.province,
          area: detail.n,
          place: detail.name,
          code: detail.code || ''
        });
      }
      nav.level = 'shabiya';
      return;
    }

    if (level === 'shabiya') {
      var wk = provinceToWilayahKey(detail.province);
      if (!wk) {
        var wilayahSel = document.getElementById('addr-wilayah');
        wk = wilayahSel ? String(wilayahSel.value || '').trim() : '';
      }
      if (wk) {
        drillToWilayah(wk, detail.province || '');
      }
      return;
    }

    if (level === 'wilayah') {
      drillToCountry();
      return;
    }

    if (level === 'country' && MC.fitFullLibyaInView) {
      MC.fitFullLibyaInView({ animate: true, force: true });
    }
  }

  function installSemanticZoomControls() {
    var origZoomIn = map.zoomIn.bind(map);
    var origZoomOut = map.zoomOut.bind(map);

    map.zoomIn = function (options) {
      if (canSemanticZoom()) {
        drillIn();
        return map;
      }
      return origZoomIn(options);
    };

    map.zoomOut = function (options) {
      if (canSemanticZoom()) {
        drillOut();
        return map;
      }
      return origZoomOut(options);
    };
  }

  window.addEventListener('addr-shabiya-from-form', function () {
    nav.level = 'shabiya';
  });

  window.addEventListener('addr-map-fill', function (ev) {
    if (!ev || !ev.detail || ev.detail.zoomNav) {
      return;
    }
    var lv = String(ev.detail.level || '');
    if (lv === 'city') {
      nav.level = 'city';
    } else if (lv === 'shabiya') {
      nav.level = 'shabiya';
    } else if (lv === 'wilayah') {
      nav.level = 'wilayah';
    } else if (lv === 'country') {
      nav.level = 'country';
    }
  });

  window.addEventListener('addr-block-select', function (ev) {
    if (!ev || !ev.detail) {
      return;
    }
    if (String(ev.detail.level || '') === 'area') {
      nav.level = 'area';
    }
  });

  window.addEventListener('addr-map-reset', function () {
    nav.level = 'country';
    nav.busy = false;
  });

  installSemanticZoomControls();
  syncNavLevelFromMap();

  window.AddrZoomNav = {
    drillIn: drillIn,
    drillOut: drillOut,
    getLevel: function () { return nav.level; },
    syncLevel: syncNavLevelFromMap
  };
})();
