/**
 * Address form: wilayah → shabiya → sector → property preview, context bar sync,
 * map-fill / place / shabiya event handlers, color palette wiring.
 * Exposes shared form state via window.AddressForm for sibling save/edit modules.
 */
(function () {
  'use strict';

  var cfgEl = document.getElementById('addr-page-config');
  if (!cfgEl) {
    return;
  }

  var cfg;
  try {
    cfg = JSON.parse(cfgEl.textContent || '{}');
  } catch (e) {
    return;
  }

  var shabiyaToN = cfg.shabiyaToN && typeof cfg.shabiyaToN === 'object' ? cfg.shabiyaToN : {};
  var wilayahSelectLabels =
    cfg.wilayahSelectLabels && typeof cfg.wilayahSelectLabels === 'object' ? cfg.wilayahSelectLabels : {};

  var shDataEl = document.getElementById('libya-shabiyat-data');
  var allShabiyat = [];
  if (shDataEl) {
    try {
      allShabiyat = JSON.parse(shDataEl.textContent || '[]');
    } catch (e2) {
      allShabiyat = [];
    }
  }
  if (!Array.isArray(allShabiyat)) {
    allShabiyat = [];
  }

  function shabiyaCodeOrderNum(row) {
    var c = String((row && row.code) || '').trim();
    var m = c.match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 1e9;
  }

  function shabiyaOptionLabel(row) {
    var nm = String((row && row.name) || '').trim();
    var c = String((row && row.code) || '').trim();
    if (nm && c) {
      return nm + ' (' + c + ')';
    }
    return nm || c || '—';
  }

  function lookupShabiyaCodeByAdminName(adminName) {
    var n = String(adminName || '').trim();
    if (!n) {
      return '';
    }
    for (var xi = 0; xi < allShabiyat.length; xi++) {
      var row = allShabiyat[xi];
      if (row && (row.name || '') === n) {
        return String(row.code || '').trim();
      }
    }
    return '';
  }

  function formatShabiyaCtxChip(rawCode, adminArabicName) {
    var c = String(rawCode || '').trim();
    var nm = String(adminArabicName || '').trim();
    if (c && nm) {
      return c + ' ' + nm;
    }
    if (c) {
      return c;
    }
    if (nm) {
      return nm;
    }
    return '—';
  }

  var WILAYAH_BY_PROVINCE = { B: 'barqa', T: 'tripolitania', F: 'fezzan' };
  var WKEY_TO_PROV = { barqa: 'B', tripolitania: 'T', fezzan: 'F' };
  var WIL_KEY = { barqa: 1, tripolitania: 1, fezzan: 1 };

  var wilayahSel = document.getElementById('addr-wilayah');
  var shabiyaSel = document.getElementById('shabiya');
  var provinceIn = document.getElementById('pc_province');
  var msgEl = document.getElementById('addr-api-msg');
  var cityAreaIn = document.getElementById('addr-city-area');
  var cityAreaDatalist = document.getElementById('addr-city-area-list');
  var neighborhoodIn = document.getElementById('addr-neighborhood');
  var ctxPlace = document.getElementById('ctx-place');
  var ctxArea = document.getElementById('ctx-area');
  var ctxWilayah = document.getElementById('ctx-wilayah');
  var ctxProvince = document.getElementById('ctx-province');

  var contextBarLiveFromMap = !!cfg.isEdit;
  var contextBarWilayahPinned = false;
  var wilayahChangeSuppress = 0;

  function beginWilayahProgrammatic() { wilayahChangeSuppress++; }
  function endWilayahProgrammatic() { wilayahChangeSuppress = Math.max(0, wilayahChangeSuppress - 1); }

  function clearContextBarValues() {
    if (ctxProvince) { ctxProvince.textContent = ''; }
    if (ctxWilayah) { ctxWilayah.textContent = ''; }
    if (ctxArea) { ctxArea.textContent = ''; }
    if (ctxPlace) { ctxPlace.textContent = ''; }
  }

  function rebuildCityAreaDatalist(names) {
    if (!cityAreaDatalist) { return; }
    cityAreaDatalist.innerHTML = '';
    var arr = Array.isArray(names) ? names : [];
    for (var di = 0; di < arr.length; di++) {
      var label = String(arr[di] || '').trim();
      if (!label) { continue; }
      var opt = document.createElement('option');
      opt.value = label;
      cityAreaDatalist.appendChild(opt);
    }
  }

  function resetCityAreaBranchAndDatalist() {
    if (cityAreaIn) { cityAreaIn.value = ''; }
    if (neighborhoodIn) { neighborhoodIn.value = ''; }
    rebuildCityAreaDatalist([]);
  }

  function applyWilayahSelectLabelsFromConfig() {
    if (!wilayahSel || !wilayahSel.options) { return; }
    for (var wi = 0; wi < wilayahSel.options.length; wi++) {
      var opt = wilayahSel.options[wi];
      var vk = opt.value;
      var lbl = wilayahSelectLabels[vk];
      if (lbl) {
        opt.textContent = lbl;
      }
    }
  }

  function buildLocality() {
    var c = cityAreaIn ? String(cityAreaIn.value || '').trim() : '';
    var h = neighborhoodIn ? String(neighborhoodIn.value || '').trim() : '';
    if (c && h) { return c + ' | ' + h; }
    return c || h || '';
  }

  function selectedWilayahAr() {
    if (!wilayahSel) { return '—'; }
    var opt = wilayahSel.options[wilayahSel.selectedIndex];
    return opt ? String(opt.textContent || '').trim() || '—' : '—';
  }

  function syncProvinceFromWilayah() {
    if (!provinceIn || !wilayahSel) { return; }
    var wk = wilayahSel.value;
    provinceIn.value = WKEY_TO_PROV[wk] || 'T';
  }

  function syncAreaFromShabiya() {
    var pa = document.getElementById('pc_area');
    if (!pa || !shabiyaSel || !shabiyaSel.value) { return; }
    var name = String(shabiyaSel.value).trim();
    var n = shabiyaToN[name];
    if (n != null) {
      pa.value = String(n);
    }
  }

  function updateContextBar() {
    if (cfg.isEdit) { return; }
    if (!ctxPlace && !ctxWilayah) { return; }
    if (!contextBarLiveFromMap) {
      clearContextBarValues();
      if (contextBarWilayahPinned && wilayahSel && provinceIn && ctxProvince && ctxWilayah) {
        var wkPin = wilayahSel.value;
        if (wkPin && WIL_KEY[wkPin]) {
          ctxProvince.textContent = provinceIn.value || WKEY_TO_PROV[wkPin] || '—';
          ctxWilayah.textContent = selectedWilayahAr();
          if (ctxArea && shabiyaSel) {
            var shPin = String(shabiyaSel.value || '').trim();
            if (shPin) {
              ctxArea.textContent = formatShabiyaCtxChip(lookupShabiyaCodeByAdminName(shPin), shPin);
            } else {
              ctxArea.textContent = '—';
            }
          }
          if (ctxPlace) { ctxPlace.textContent = '—'; }
        }
      }
      return;
    }
    var sh = shabiyaSel && shabiyaSel.value ? String(shabiyaSel.value).trim() : '';
    if (ctxArea) {
      var codeLbl = lookupShabiyaCodeByAdminName(sh);
      ctxArea.textContent = formatShabiyaCtxChip(codeLbl, sh);
    }
    var cityLbl = cityAreaIn ? String(cityAreaIn.value || '').trim() : '';
    var hoodLbl = neighborhoodIn ? String(neighborhoodIn.value || '').trim() : '';
    if (ctxPlace) {
      if (cityLbl && hoodLbl) {
        ctxPlace.textContent = cityLbl + ' — ' + hoodLbl;
      } else {
        ctxPlace.textContent = cityLbl || hoodLbl || '—';
      }
    }
    if (ctxWilayah) { ctxWilayah.textContent = selectedWilayahAr(); }
    if (ctxProvince && provinceIn) { ctxProvince.textContent = provinceIn.value || '—'; }
  }

  function showMsg(text, isErr) {
    if (window.AddrMap && typeof window.AddrMap.cancelAddrApiMsgAutoHide === 'function') {
      window.AddrMap.cancelAddrApiMsgAutoHide();
    }
    if (!msgEl) { return; }
    if (!text) {
      msgEl.hidden = true;
      msgEl.textContent = '';
      msgEl.className = 'addr-api-msg';
      return;
    }
    msgEl.hidden = false;
    msgEl.textContent = text;
    msgEl.className = 'addr-api-msg' + (isErr ? ' addr-api-msg--err' : ' addr-api-msg--ok');
  }

  function refillShabiyat(preserveSelection) {
    if (!wilayahSel || !shabiyaSel) { return; }
    var preserve = preserveSelection !== false;
    var w = wilayahSel.value;
    var prev = preserve ? shabiyaSel.value : '';
    shabiyaSel.innerHTML = '';
    if (!preserve) {
      var oz = document.createElement('option');
      oz.value = '';
      oz.textContent = '—';
      shabiyaSel.appendChild(oz);
    }
    var forWil = [];
    for (var i = 0; i < allShabiyat.length; i++) {
      if (allShabiyat[i].wilayah !== w) { continue; }
      forWil.push(allShabiyat[i]);
    }
    forWil.sort(function (a, b) { return shabiyaCodeOrderNum(a) - shabiyaCodeOrderNum(b); });
    for (var j = 0; j < forWil.length; j++) {
      var row = forWil[j];
      var o = document.createElement('option');
      o.value = row.name;
      o.textContent = shabiyaOptionLabel(row);
      shabiyaSel.appendChild(o);
    }
    if (shabiyaSel.options.length === 0) {
      var od = document.createElement('option');
      od.value = '';
      od.textContent = '—';
      shabiyaSel.appendChild(od);
      shabiyaSel.value = '';
      syncAreaFromShabiya();
      return;
    }
    if (preserve && prev) {
      shabiyaSel.value = prev;
      if (!shabiyaSel.value) {
        for (var pj = 0; pj < shabiyaSel.options.length; pj++) {
          if (shabiyaSel.options[pj].value === prev) {
            shabiyaSel.selectedIndex = pj;
            break;
          }
        }
      }
    }
    if (!preserve) {
      shabiyaSel.value = '';
      var paClear = document.getElementById('pc_area');
      if (paClear) { paClear.value = '1'; }
    } else if (!shabiyaSel.value) {
      shabiyaSel.selectedIndex = 0;
    }
    syncAreaFromShabiya();
  }

  function findShabiyaRowForCurrentWilayah(name) {
    var w = wilayahSel ? wilayahSel.value : '';
    var nm = String(name || '').trim();
    if (!w || !nm || !wilayahSel) { return null; }
    for (var si = 0; si < allShabiyat.length; si++) {
      var row = allShabiyat[si];
      if (row && row.wilayah === w && String(row.name || '').trim() === nm) {
        return row;
      }
    }
    return null;
  }

  if (wilayahSel) {
    applyWilayahSelectLabelsFromConfig();
    wilayahSel.addEventListener('change', function () {
      if (wilayahChangeSuppress > 0) {
        syncProvinceFromWilayah();
        return;
      }
      if (!cfg.isEdit) {
        contextBarWilayahPinned = true;
        if (window.AddrMap) {
          if (typeof window.AddrMap.clearMapSelection === 'function') {
            window.AddrMap.clearMapSelection();
          }
          if (typeof window.AddrMap.flyToWilayahKey === 'function') {
            window.AddrMap.flyToWilayahKey(wilayahSel.value);
          }
        }
      }
      syncProvinceFromWilayah();
      refillShabiyat(false);
      resetCityAreaBranchAndDatalist();
      updatePreview();
      updateContextBar();
    });
    syncProvinceFromWilayah();
    refillShabiyat();
    updateContextBar();
  }

  var propDisplay = document.getElementById('pc_property_display');
  var areaIn = document.getElementById('pc_area');
  var cityIn = document.getElementById('pc_city');
  var sectorIn = document.getElementById('pc_sector');

  function updatePreview() {
    if (!propDisplay || !provinceIn || !areaIn || !cityIn || !sectorIn) { return; }
    var sec = (sectorIn.value || '').trim().toUpperCase().slice(0, 2) || '—';
    propDisplay.placeholder = '';
    propDisplay.value =
      provinceIn.value + ' ' + (areaIn.value || '0') + '-' + (cityIn.value || '0') + '-' + sec + ' …';
  }

  [provinceIn, areaIn, cityIn, sectorIn].forEach(function (n) {
    if (n) {
      n.addEventListener('input', function () { updatePreview(); updateContextBar(); });
      n.addEventListener('change', function () { updatePreview(); updateContextBar(); });
    }
  });

  if (shabiyaSel) {
    shabiyaSel.addEventListener('change', function () {
      resetCityAreaBranchAndDatalist();
      var pv = shabiyaSel.value ? String(shabiyaSel.value).trim() : '';
      if (!cfg.isEdit && !pv) {
        if (window.AddrMap && typeof window.AddrMap.clearMapSelection === 'function') {
          window.AddrMap.clearMapSelection();
        }
        syncAreaFromShabiya();
        updatePreview();
        updateContextBar();
        return;
      }
      if (!cfg.isEdit && pv) {
        var provLetter = provinceIn ? String(provinceIn.value || '').trim() : '';
        if (!provLetter && wilayahSel) {
          provLetter = WKEY_TO_PROV[wilayahSel.value] || 'T';
        }
        var nVal = shabiyaToN[pv];
        var rowSh = findShabiyaRowForCurrentWilayah(pv);
        var codeStr = rowSh ? String(rowSh.code || '').trim() : '';
        try {
          window.dispatchEvent(
            new CustomEvent('addr-map-fill', {
              detail: { level: 'shabiya', province: provLetter, area: nVal != null ? nVal : '', place: pv, code: codeStr }
            })
          );
        } catch (eFill) {}
        try {
          window.dispatchEvent(
            new CustomEvent('addr-shabiya-from-form', { detail: { name: pv, province: provLetter } })
          );
        } catch (eFormSb) {}
      } else {
        syncAreaFromShabiya();
      }
      updatePreview();
      updateContextBar();
    });
  }

  [cityAreaIn, neighborhoodIn].forEach(function (elI) {
    if (elI) {
      elI.addEventListener('input', updateContextBar);
    }
  });
  if (cityAreaIn) {
    cityAreaIn.addEventListener('change', function () {
      var cn = String(cityAreaIn.value || '').trim();
      if (!cfg.isEdit && cn && window.AddrMap && typeof window.AddrMap.flyToLoadedCityPlace === 'function') {
        window.AddrMap.flyToLoadedCityPlace(cn);
      }
      updateContextBar();
      try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eC) {}
    });
  }
  updatePreview();
  updateContextBar();

  function applySavedRecord(r, opts) {
    if (!r) { return; }
    opts = opts || {};
    if (!cfg.isEdit) {
      contextBarLiveFromMap = true;
      contextBarWilayahPinned = false;
    }
    var la = parseFloat(r.latitude);
    var ln = parseFloat(r.longitude);
    if (cfg.isEdit) {
      if (window.AddrMap && typeof window.AddrMap.showSavedLocation === 'function') {
        if (isFinite(la) && isFinite(ln)) {
          window.AddrMap.showSavedLocation(la, ln, 15);
        }
      }
      showMsg('تم عرض موقع السجل على الخريطة.', false);
      return;
    }
    var latIn = document.getElementById('map-lat');
    var lngIn = document.getElementById('map-lng');
    if (latIn && r.latitude != null) { latIn.value = String(r.latitude); }
    if (lngIn && r.longitude != null) { lngIn.value = String(r.longitude); }
    if (r.wilayah && wilayahSel && WIL_KEY[r.wilayah]) {
      beginWilayahProgrammatic();
      try { wilayahSel.value = r.wilayah; } finally { endWilayahProgrammatic(); }
    }
    syncProvinceFromWilayah();
    if (provinceIn && r.pc_province) {
      provinceIn.value = String(r.pc_province);
    }
    refillShabiyat();
    if (shabiyaSel && r.shabiya) {
      var sn = String(r.shabiya).trim();
      var matchedSb = false;
      for (var si = 0; si < shabiyaSel.options.length; si++) {
        if (shabiyaSel.options[si].value === sn) {
          shabiyaSel.selectedIndex = si;
          matchedSb = true;
          break;
        }
      }
      if (!matchedSb) { shabiyaSel.value = sn; }
    }
    syncAreaFromShabiya();
    if (areaIn && r.pc_area != null) { areaIn.value = String(r.pc_area); }
    if (cityIn && r.pc_city != null) { cityIn.value = String(r.pc_city); }
    if (sectorIn && r.pc_sector) { sectorIn.value = String(r.pc_sector).toUpperCase().slice(0, 2); }
    var loc = r.locality ? String(r.locality) : '';
    if (loc.indexOf(' | ') >= 0) {
      var parts = loc.split(' | ');
      if (cityAreaIn) { cityAreaIn.value = (parts[0] || '').trim(); }
      if (neighborhoodIn) { neighborhoodIn.value = (parts[1] || '').trim(); }
    } else {
      if (cityAreaIn) { cityAreaIn.value = loc; }
      if (neighborhoodIn) { neighborhoodIn.value = ''; }
    }
    var hn = document.getElementById('holder_name');
    if (hn && r.owner_name != null) { hn.value = String(r.owner_name); }
    var typ = document.getElementById('type');
    if (typ && r.type) { typ.value = r.type; }
    var apt = document.getElementById('apartment_number');
    if (apt && r.apartment_number != null) { apt.value = String(r.apartment_number); }
    var st = document.getElementById('street_number');
    if (st && r.street_number != null) { st.value = String(r.street_number); }
    updatePreview();
    if (propDisplay && r.pc_province && r.pc_area != null && r.pc_city != null && r.pc_sector && r.pc_property != null) {
      var secDisp = String(r.pc_sector).toUpperCase().slice(0, 2);
      propDisplay.value =
        String(r.pc_province) + ' ' + String(r.pc_area) + '-' + String(r.pc_city) + '-' + secDisp + ' ' + String(r.pc_property);
    }
    updateContextBar();
    if (!opts.skipShabiyaMapReload && !cfg.isEdit && shabiyaSel && shabiyaSel.value && provinceIn) {
      try {
        window.dispatchEvent(
          new CustomEvent('addr-shabiya-from-form', {
            detail: { name: String(shabiyaSel.value).trim(), province: String(provinceIn.value || '').trim() }
          })
        );
      } catch (eSbSv) {}
    }
    try {
      if (window.AddrMap && typeof window.AddrMap.bootstrapMarkerGateContext === 'function') {
        var cityNamBoot = cityAreaIn ? String(cityAreaIn.value || '').trim() : '';
        window.AddrMap.bootstrapMarkerGateContext({
          province: r.pc_province,
          area: r.pc_area,
          shabiyaName: shabiyaSel ? String(shabiyaSel.value || '').trim() : r.shabiya ? String(r.shabiya).trim() : '',
          code: '',
          cityAreaName: cityNamBoot
        });
      }
    } catch (eGate) {}
    if (window.AddrMap && typeof window.AddrMap.showSavedLocation === 'function') {
      if (isFinite(la) && isFinite(ln)) {
        window.AddrMap.showSavedLocation(la, ln, 15);
      }
    }
    try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eSv) {}
  }

  function gatherNewPayload() {
    return {
      action: 'create',
      csrf_token: cfg.csrf,
      pc_province: provinceIn ? provinceIn.value : '',
      pc_area: areaIn ? parseInt(areaIn.value, 10) : 0,
      pc_city: cityIn ? parseInt(cityIn.value, 10) : 0,
      pc_sector: sectorIn ? sectorIn.value : '',
      holder_name: (document.getElementById('holder_name') || {}).value || '',
      type: (document.getElementById('type') || {}).value || 'residential',
      apartment_number: (document.getElementById('apartment_number') || {}).value || '',
      locality: buildLocality(),
      street_number: (document.getElementById('street_number') || {}).value || '',
      shabiya: shabiyaSel ? shabiyaSel.value || '' : '',
      map_lat: (document.getElementById('map-lat') || {}).value || '',
      map_lng: (document.getElementById('map-lng') || {}).value || ''
    };
  }

  function resetAddFormFields() {
    if (cfg.isEdit) { return; }
    contextBarLiveFromMap = false;
    contextBarWilayahPinned = false;
    clearContextBarValues();
    if (wilayahSel) {
      beginWilayahProgrammatic();
      try { wilayahSel.value = 'tripolitania'; } finally { endWilayahProgrammatic(); }
    }
    syncProvinceFromWilayah();
    refillShabiyat();
    if (sectorIn) { sectorIn.value = 'S'; }
    if (cityIn) { cityIn.value = '1'; }
    var hn = document.getElementById('holder_name');
    if (hn) { hn.value = ''; }
    if (cityAreaIn) { cityAreaIn.value = ''; }
    if (neighborhoodIn) { neighborhoodIn.value = ''; }
    var typ = document.getElementById('type');
    if (typ) { typ.value = 'residential'; }
    var hint = document.getElementById('map-parcel-desc');
    if (hint) { hint.value = ''; }
    updatePreview();
    updateContextBar();
  }

  function resetAddFormParcelOnly() {
    if (cfg.isEdit) { return; }
    contextBarLiveFromMap = false;
    contextBarWilayahPinned = true;
    syncProvinceFromWilayah();
    syncAreaFromShabiya();
    var hn = document.getElementById('holder_name');
    if (hn) { hn.value = ''; }
    var ap = document.getElementById('apartment_number');
    if (ap) { ap.value = ''; }
    var st = document.getElementById('street_number');
    if (st) { st.value = ''; }
    if (cityAreaIn) { cityAreaIn.value = ''; }
    if (neighborhoodIn) { neighborhoodIn.value = ''; }
    var typ = document.getElementById('type');
    if (typ) { typ.value = 'residential'; }
    var hint = document.getElementById('map-parcel-desc');
    if (hint) { hint.value = ''; }
    updatePreview();
    updateContextBar();
  }

  function stripAddressNewIdFromLocation() {
    try {
      var u = new URL(window.location.href);
      if ((u.searchParams.get('r') || '') !== 'address_new') { return; }
      if (!u.searchParams.has('id')) { return; }
      u.searchParams.delete('id');
      var tail = 'index.php?' + u.searchParams.toString();
      history.replaceState(null, '', tail);
    } catch (_) {}
  }

  function dispatchNewSceneWithinCurrentShubiya() {
    var shName = shabiyaSel ? String(shabiyaSel.value || '').trim() : '';
    var pl = provinceIn ? String(provinceIn.value || '').trim() : '';
    var wk = wilayahSel ? String(wilayahSel.value || '').trim() : '';
    stripAddressNewIdFromLocation();
    try {
      window.dispatchEvent(
        new CustomEvent('addr-map-new-scene', {
          detail: { keepShubiyaContext: !cfg.isEdit, shabiyaName: shName, provinceLetter: pl, wilayahKey: wk }
        })
      );
    } catch (_) {}
  }

  var btnReset = document.getElementById('btn-reset-entries');
  if (btnReset) {
    btnReset.addEventListener('click', function () {
      resetAddFormFields();
      window.dispatchEvent(new Event('addr-map-reset'));
      showMsg('أُعيدت الإدخالات.', false);
    });
  }

  /* Map → form fill (multi-level drill-down) */
  function applyMapFill(d) {
    if (cfg.isEdit) { return; }
    contextBarLiveFromMap = true;
    contextBarWilayahPinned = false;
    var level = (d && d.level) ? String(d.level) : '';

    if (level === 'city') {
      if (cityAreaIn && d.place) { cityAreaIn.value = String(d.place).trim(); }
      if (neighborhoodIn) { neighborhoodIn.value = ''; }
      updatePreview();
      updateContextBar();
      try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eMr) {}
      return;
    }

    if (d.province && wilayahSel) {
      var wk = WILAYAH_BY_PROVINCE[d.province];
      if (wk) {
        beginWilayahProgrammatic();
        try { wilayahSel.value = wk; } finally { endWilayahProgrammatic(); }
      }
    }
    syncProvinceFromWilayah();
    refillShabiyat();
    if (shabiyaSel) {
      var matched = false;
      if (d.place) {
        var targetName = String(d.place).trim();
        for (var ji = 0; ji < shabiyaSel.options.length; ji++) {
          if (shabiyaSel.options[ji].value === targetName) {
            shabiyaSel.selectedIndex = ji;
            matched = true;
            break;
          }
        }
      }
      if (!matched && d.area != null) {
        for (var j = 0; j < shabiyaSel.options.length; j++) {
          var o2 = shabiyaSel.options[j];
          var nn2 = shabiyaToN[o2.value];
          if (Number(nn2) === Number(d.area)) {
            shabiyaSel.selectedIndex = j;
            matched = true;
            break;
          }
        }
      }
      if (!matched && d.place) { shabiyaSel.value = String(d.place).trim(); }
    }
    syncAreaFromShabiya();
    var pa = document.getElementById('pc_area');
    if (pa && d.area != null) { pa.value = String(d.area); }
    if (cityIn && d.city != null) { cityIn.value = String(d.city); }
    if (sectorIn && d.sector) { sectorIn.value = String(d.sector).toUpperCase().slice(0, 2); }
    if (level === 'shabiya') {
      if (cityAreaIn) { cityAreaIn.value = ''; }
      if (neighborhoodIn) { neighborhoodIn.value = ''; }
    } else if (cityAreaIn && d.place) {
      cityAreaIn.value = String(d.place).trim();
    }
    updatePreview();
    updateContextBar();
    try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eMr2) {}
  }

  window.addEventListener('addr-map-fill', function (ev) {
    if (!ev || !ev.detail) { return; }
    applyMapFill(ev.detail);
  });

  window.addEventListener('addr-shabiya-select', function () { updateContextBar(); });

  window.addEventListener('addr-place-select', function (ev) {
    if (!ev || !ev.detail) { return; }
    if (!cfg.isEdit) {
      contextBarLiveFromMap = true;
      contextBarWilayahPinned = false;
    }
    var d = ev.detail;
    if (cityAreaIn && d.name) { cityAreaIn.value = String(d.name).trim(); }
    if (neighborhoodIn) { neighborhoodIn.value = ''; }
    updatePreview();
    updateContextBar();
    try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eP) {}
  });

  window.addEventListener('addr-city-places-updated', function (ev) {
    var raw = ev && ev.detail ? ev.detail.names : null;
    rebuildCityAreaDatalist(Array.isArray(raw) ? raw : []);
  });

  window.addEventListener('addr-neighborhood-fill', function (ev) {
    if (!ev || !ev.detail || !neighborhoodIn) { return; }
    var n = ev.detail.neighborhood;
    if (n) { neighborhoodIn.value = String(n).trim(); }
    updateContextBar();
  });

  /* Color palette for parcel drawing — routes to map/parcel via custom event */
  var palette = document.getElementById('gis-palette');
  if (palette) {
    palette.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-color]');
      if (!b) { return; }
      var c = b.getAttribute('data-color');
      var allp = palette.querySelectorAll('button');
      for (var pi = 0; pi < allp.length; pi++) {
        allp[pi].classList.toggle('is-selected', allp[pi] === b);
      }
      window.dispatchEvent(new CustomEvent('addr-map-draw-color', { detail: { color: c } }));
    });
  }

  /* Restore persisted parcel description from previous "save settings". */
  try {
    var saved = JSON.parse(localStorage.getItem('addrDashboardUi') || '{}');
    if (saved.hint) {
      var ht = document.getElementById('map-parcel-desc');
      if (ht) { ht.value = saved.hint; }
    }
  } catch (e4) {}

  /* Public surface for sibling modules (save.js, edit.js). */
  window.AddressForm = {
    cfg: cfg,
    showMsg: showMsg,
    gatherNewPayload: gatherNewPayload,
    applySavedRecord: applySavedRecord,
    resetAddFormFields: resetAddFormFields,
    resetAddFormParcelOnly: resetAddFormParcelOnly,
    dispatchNewSceneWithinCurrentShubiya: dispatchNewSceneWithinCurrentShubiya,
    stripAddressNewIdFromLocation: stripAddressNewIdFromLocation,
    updateContextBar: updateContextBar,
    updatePreview: updatePreview
  };
})();
