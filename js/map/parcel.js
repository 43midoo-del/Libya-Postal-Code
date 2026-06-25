/**
 * Parcel drawing tool: polygon vertices, preview, color palette wiring, finish/cancel,
 * exposes the click handler to MapCore so the main click dispatcher can route to it.
 * Also exposes window.MapParcel for serialization and reload of saved boundaries.
 */
(function () {
  'use strict';

  if (!window.MapCore || !window.MapCore.map) {
    return;
  }
  var MC = window.MapCore;
  var map = MC.map;
  var bounds = MC.bounds;
  var readOnly = MC.readOnly;
  var state = MC.state;

  var annotations = L.layerGroup().addTo(map);
  var parcelVertices = [];
  var parcelPreview = null;
  var drawColor = '#22c55e';

  function setDrawMode(mode) {
    state.drawMode = mode || 'none';
    if (state.drawMode !== 'parcel') {
      clearParcelDraft(false);
    }
    if (state.drawMode === 'parcel' && state.markerModePending) {
      state.markerModePending = false;
      MC.syncMarkerModeButton();
    }
    if (state.drawMode === 'parcel') {
      if (MC.hideBoundariesForAddressPick) {
        MC.hideBoundariesForAddressPick();
      }
    } else if (MC.syncBoundaryLabelsForAddressScene) {
      MC.syncBoundaryLabelsForAddressScene();
    }
    if (typeof MC.syncMapCrosshairCursor === 'function') {
      MC.syncMapCrosshairCursor();
    }
  }

  function clearParcelDraft(clearPreviewOnly) {
    if (parcelPreview) {
      try { annotations.removeLayer(parcelPreview); } catch (e0) {}
      parcelPreview = null;
    }
    if (!clearPreviewOnly) {
      parcelVertices = [];
    }
    updateParcelButtons();
  }

  function redrawParcelPreview() {
    if (parcelPreview) {
      try { annotations.removeLayer(parcelPreview); } catch (e1) {}
      parcelPreview = null;
    }
    if (parcelVertices.length === 0) {
      updateParcelButtons();
      return;
    }
    var latlngs = [];
    for (var pi = 0; pi < parcelVertices.length; pi++) {
      latlngs.push([parcelVertices[pi].lat, parcelVertices[pi].lng]);
    }
    parcelPreview = L.polyline(latlngs, {
      color: drawColor,
      weight: 2,
      dashArray: '5 5',
      interactive: false
    }).addTo(annotations);
    updateParcelButtons();
  }

  function updateParcelButtons() {
    var fin = document.getElementById('btn-parcel-finish');
    var can = document.getElementById('btn-parcel-cancel');
    var n = parcelVertices.length;
    if (fin) { fin.disabled = n < 3; }
    if (can) { can.disabled = state.drawMode !== 'parcel' && n === 0; }
  }

  function parseStoredGeoJson(raw) {
    if (!raw) {
      return null;
    }
    if (typeof raw === 'object') {
      return raw;
    }
    try {
      return JSON.parse(String(raw));
    } catch (eParse) {
      return null;
    }
  }

  function collectPolygonLayers() {
    var polys = [];
    annotations.eachLayer(function (layer) {
      if (layer instanceof L.Polygon && layer !== parcelPreview) {
        polys.push(layer);
      }
    });
    return polys;
  }

  function getGeoJSON() {
    var polys = collectPolygonLayers();
    if (polys.length < 1) {
      return null;
    }
    var features = [];
    for (var i = 0; i < polys.length; i++) {
      var gj = polys[i].toGeoJSON();
      if (gj && gj.geometry) {
        features.push(gj);
      }
    }
    if (features.length < 1) {
      return null;
    }
    var descEl = document.getElementById('map-parcel-desc');
    var desc = descEl ? String(descEl.value || '').trim() : '';
    var geojson = features.length === 1 ? features[0].geometry : {
      type: 'FeatureCollection',
      features: features
    };
    return { geojson: geojson, desc: desc };
  }

  function clearFinishedParcels() {
    var toRemove = collectPolygonLayers();
    for (var ri = 0; ri < toRemove.length; ri++) {
      try { annotations.removeLayer(toRemove[ri]); } catch (eRm) {}
    }
  }

  function loadFromGeoJSON(raw, desc, color, viewOnly) {
    clearFinishedParcels();
    clearParcelDraft(false);
    var gj = parseStoredGeoJson(raw);
    if (!gj) {
      return false;
    }
    var useColor = color || drawColor;
    var tip = desc ? String(desc) : '';
    var descEl = document.getElementById('map-parcel-desc');
    if (descEl && tip) {
      descEl.value = tip;
    }
    L.geoJSON(gj, {
      style: {
        color: useColor,
        weight: 2,
        fillColor: useColor,
        fillOpacity: 0.14,
        interactive: !viewOnly
      },
      onEachFeature: function (feature, layer) {
        if (tip) {
          layer.bindTooltip(tip, { sticky: true });
        }
        layer.addTo(annotations);
      }
    });
    return true;
  }

  function finishParcelPolygon() {
    if (parcelVertices.length < 3) {
      return;
    }
    var latlngs = [];
    for (var fi = 0; fi < parcelVertices.length; fi++) {
      latlngs.push([parcelVertices[fi].lat, parcelVertices[fi].lng]);
    }
    if (parcelPreview) {
      try { annotations.removeLayer(parcelPreview); } catch (e2) {}
      parcelPreview = null;
    }
    var poly = L.polygon(latlngs, {
      color: drawColor,
      weight: 2,
      fillColor: drawColor,
      fillOpacity: 0.14
    }).addTo(annotations);
    var descEl = document.getElementById('map-parcel-desc');
    var desc = descEl ? String(descEl.value || '').trim() : '';
    if (desc) {
      poly.bindTooltip(desc, { sticky: true });
    }
    parcelVertices = [];
    setDrawMode('none');
    syncToolboxActive();
    try {
      var ring = poly.getLatLngs();
      window.dispatchEvent(
        new CustomEvent('addr-parcel-finished', { detail: { latlngs: ring && ring[0] ? ring[0] : ring, layer: poly } })
      );
    } catch (eFin) {}
  }

  var toolbox = document.querySelector('.gis-toolbox');
  function syncToolboxActive() {
    if (!toolbox) { return; }
    var all = toolbox.querySelectorAll('[data-map-tool]');
    for (var i = 0; i < all.length; i++) {
      var modeAttr = all[i].getAttribute('data-map-tool');
      all[i].classList.toggle('is-active', state.drawMode !== 'none' && modeAttr === state.drawMode);
    }
    updateParcelButtons();
  }

  if (toolbox) {
    toolbox.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-map-tool]');
      if (!btn) { return; }
      var mode = btn.getAttribute('data-map-tool') || 'none';
      if (mode === state.drawMode && mode !== 'none') {
        setDrawMode('none');
        syncToolboxActive();
        return;
      }
      setDrawMode(mode);
      syncToolboxActive();
    });
  }

  var btnParcelFinish = document.getElementById('btn-parcel-finish');
  if (btnParcelFinish) {
    btnParcelFinish.addEventListener('click', function () {
      finishParcelPolygon();
    });
  }
  var btnParcelCancel = document.getElementById('btn-parcel-cancel');
  if (btnParcelCancel) {
    btnParcelCancel.addEventListener('click', function () {
      clearParcelDraft(false);
      setDrawMode('none');
      syncToolboxActive();
    });
  }

  window.addEventListener('addr-map-draw-color', function (e) {
    if (e.detail && e.detail.color) {
      drawColor = e.detail.color;
      if (state.drawMode === 'parcel' && parcelVertices.length > 0) {
        redrawParcelPreview();
      }
    }
  });

  function handleDrawClick(ll) {
    if (state.drawMode !== 'parcel' || readOnly) {
      return false;
    }
    parcelVertices.push(L.latLng(ll.lat, ll.lng));
    redrawParcelPreview();
    return true;
  }
  MC.setDrawClickHandler(handleDrawClick);

  window.addEventListener('addr-map-clear-annotations', function () {
    annotations.clearLayers();
    parcelVertices = [];
    parcelPreview = null;
    updateParcelButtons();
  });

  MC.resetDraw = function () {
    setDrawMode('none');
    syncToolboxActive();
  };

  window.MapParcel = {
    getGeoJSON: getGeoJSON,
    loadFromGeoJSON: loadFromGeoJSON,
    clearAll: function () {
      window.dispatchEvent(new Event('addr-map-clear-annotations'));
    },
    hasParcel: function () {
      return collectPolygonLayers().length > 0;
    },
    removeParcelLayer: function (layer) {
      if (!layer) { return; }
      try { annotations.removeLayer(layer); } catch (eRmL) {}
      updateParcelButtons();
    },
    getLayerGroup: function () {
      return annotations;
    }
  };

  window.addEventListener('addr-map-load-parcel', function (ev) {
    if (!ev || !ev.detail) {
      return;
    }
    loadFromGeoJSON(
      ev.detail.geojson,
      ev.detail.desc || '',
      ev.detail.color || null,
      !!ev.detail.viewOnly
    );
  });

})();
