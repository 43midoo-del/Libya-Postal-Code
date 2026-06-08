/**
 * Phase 4 full-edit form helpers:
 *  - Filter shabiya <select> by wilayah
 *  - Keep map marker placement mode on (any click moves the marker)
 *  - Sync pc_province with the wilayah dropdown
 */
(function () {
  'use strict';

  var wEl  = document.getElementById('addr-wilayah');
  var shEl = document.getElementById('shabiya');
  var pvEl = document.getElementById('pc_province');
  var WILKEY_TO_PROV = { barqa: 'B', tripolitania: 'T', fezzan: 'F' };

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
  if (wEl) {
    wEl.addEventListener('change', function () {
      syncShabiyaByWilayah();
      syncProvinceByWilayah();
    });
  }
  syncShabiyaByWilayah();

  /* keep marker placement enabled — every map click moves the marker */
  function enableMarkerMode() {
    if (window.AddrMap && typeof window.AddrMap.setMarkerMode === 'function') {
      window.AddrMap.setMarkerMode(true);
    }
  }
  document.addEventListener('DOMContentLoaded', enableMarkerMode);
  setTimeout(enableMarkerMode, 250);
  setTimeout(enableMarkerMode, 800);

  /* After core.js places marker via internal handler, ensure marker mode is re-armed */
  var mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.addEventListener('click', function () { setTimeout(enableMarkerMode, 0); });
  }

  /* sync pc_province on first load to wilayah dropdown if mismatched */
  syncProvinceByWilayah();
})();
