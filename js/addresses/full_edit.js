/**
 * Phase 4 full-edit form helpers:
 *  - Filter shabiya <select> by wilayah
 *  - Keep map marker placement mode on (any click moves the marker)
 *  - Sync pc_province ↔ wilayah (bidirectional)
 *  - Sync parcel boundary GeoJSON into hidden fields on submit
 */
(function () {
  'use strict';

  var wEl  = document.getElementById('addr-wilayah');
  var shEl = document.getElementById('shabiya');
  var pvEl = document.getElementById('pc_province');
  var WILKEY_TO_PROV = { barqa: 'B', tripolitania: 'T', fezzan: 'F' };
  var PROV_TO_WILKEY = { B: 'barqa', T: 'tripolitania', F: 'fezzan' };

  function syncShabiyaByWilayah() {
    if (!wEl || !shEl) { return; }
    var wk = wEl.value;
    var opts = shEl.querySelectorAll('option');
    var keepCurrent = false;
    for (var i = 0; i < opts.length; i++) {
      var opt = opts[i];
      if (opt.value === '') { opt.hidden = false; continue; }
      var optWk = opt.getAttribute('data-wilayah') || '';
      var show = (optWk === wk);
      opt.hidden = !show;
      if (show && opt.selected) { keepCurrent = true; }
    }
    if (!keepCurrent) { shEl.value = ''; }
  }

  function syncProvinceByWilayah() {
    if (!wEl || !pvEl) { return; }
    var prov = WILKEY_TO_PROV[wEl.value];
    if (prov) { pvEl.value = prov; }
  }

  function syncWilayahByProvince() {
    if (!wEl || !pvEl) { return; }
    var wk = PROV_TO_WILKEY[String(pvEl.value || '').trim().toUpperCase()];
    if (wk && wEl.value !== wk) {
      wEl.value = wk;
      syncShabiyaByWilayah();
    }
  }

  if (wEl) {
    wEl.addEventListener('change', function () {
      syncShabiyaByWilayah();
      syncProvinceByWilayah();
    });
  }
  if (pvEl) {
    pvEl.addEventListener('change', function () {
      syncWilayahByProvince();
    });
  }
  syncShabiyaByWilayah();
  syncProvinceByWilayah();

  function enableMarkerMode() {
    if (window.AddrMap && typeof window.AddrMap.setMarkerMode === 'function') {
      window.AddrMap.setMarkerMode(true);
    }
  }
  document.addEventListener('DOMContentLoaded', enableMarkerMode);
  setTimeout(enableMarkerMode, 250);
  setTimeout(enableMarkerMode, 800);

  var mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.addEventListener('click', function () { setTimeout(enableMarkerMode, 0); });
  }

  function loadSavedParcel() {
    var dataEl = document.getElementById('addr-edit-parcel-data');
    if (!dataEl) {
      return;
    }
    var payload;
    try {
      payload = JSON.parse(dataEl.textContent || '{}');
    } catch (e0) {
      return;
    }
    if (!payload || !payload.geojson) {
      return;
    }
    if (window.MapParcel && typeof window.MapParcel.loadFromGeoJSON === 'function') {
      window.MapParcel.loadFromGeoJSON(payload.geojson, payload.desc || '', null, false);
    }
  }

  function syncParcelHiddenFields() {
    var gjIn = document.getElementById('parcel-geojson');
    var descIn = document.getElementById('parcel-desc-hidden');
    var descArea = document.getElementById('map-parcel-desc');
    var parcel = window.MapParcel && typeof window.MapParcel.getGeoJSON === 'function'
      ? window.MapParcel.getGeoJSON()
      : null;
    if (gjIn) {
      gjIn.value = parcel && parcel.geojson ? JSON.stringify(parcel.geojson) : '';
    }
    var desc = descArea ? String(descArea.value || '').trim() : (parcel ? parcel.desc || '' : '');
    if (descIn) {
      descIn.value = desc;
    }
  }

  setTimeout(loadSavedParcel, 300);
  setTimeout(loadSavedParcel, 900);

  var form = document.getElementById('addr-full-edit-form');
  if (form) {
    form.addEventListener('submit', function () {
      syncParcelHiddenFields();
    });
  }

  var descArea = document.getElementById('map-parcel-desc');
  if (descArea) {
    descArea.addEventListener('change', syncParcelHiddenFields);
    descArea.addEventListener('blur', syncParcelHiddenFields);
  }
})();
