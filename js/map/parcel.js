/**
 * Parcel drawing tool: polygon vertices, preview, color palette wiring, finish/cancel,
 * exposes the click handler to MapCore so the main click dispatcher can route to it.
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
})();
