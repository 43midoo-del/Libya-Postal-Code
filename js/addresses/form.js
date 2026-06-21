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

  var editMapZoom = cfg.isEdit && cfg.editMapZoom != null ? parseInt(cfg.editMapZoom, 10) || 17 : 15;
  var contextBarLiveFromMap = true;
  var editCommittedHoodVal = '';
  var editHoodChangeSuppress = 0;
  var contextBarWilayahPinned = false;
  var wilayahChangeSuppress = 0;
  var shabiyaChangeSuppress = 0;
  var currentCityDbId = 0;

  function beginWilayahProgrammatic() { wilayahChangeSuppress++; }
  function endWilayahProgrammatic() { wilayahChangeSuppress = Math.max(0, wilayahChangeSuppress - 1); }
  function beginShabiyaProgrammatic() { shabiyaChangeSuppress++; }
  function endShabiyaProgrammatic() { shabiyaChangeSuppress = Math.max(0, shabiyaChangeSuppress - 1); }

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

  var blocksFetchGen = 0;

  function resetNeighborhoodSelect() {
    if (!neighborhoodIn) { return; }
    neighborhoodIn.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = '— اختر الحي أو الشارع —';
    neighborhoodIn.appendChild(o0);
    if (sectorIn) { sectorIn.value = 'S'; }
    var stNum = document.getElementById('street_number');
    if (stNum) { stNum.value = ''; }
  }

  function resetCityAreaBranchAndDatalist() {
    blocksFetchGen += 1;
    currentCityDbId = 0;
    if (cityAreaIn) { cityAreaIn.value = ''; }
    resetNeighborhoodSelect();
    rebuildCityAreaDatalist([]);
    if (window.AddrSaved) { window.AddrSaved.clear(); }
  }

  function getNeighborhoodLabel() {
    if (!neighborhoodIn) { return ''; }
    if (neighborhoodIn.tagName === 'SELECT') {
      var opt = neighborhoodIn.options[neighborhoodIn.selectedIndex];
      return opt && opt.value ? String(opt.textContent || '').trim() : '';
    }
    return String(neighborhoodIn.value || '').trim();
  }

  function hasPlacedAddressMarker() {
    if (window.AddrMap && typeof window.AddrMap.hasPlacedAddressMarker === 'function') {
      return window.AddrMap.hasPlacedAddressMarker();
    }
    var latEl = document.getElementById('map-lat');
    var lngEl = document.getElementById('map-lng');
    if (!latEl || !lngEl) { return false; }
    var la = parseFloat(latEl.value);
    var ln = parseFloat(lngEl.value);
    return isFinite(la) && isFinite(ln);
  }

  function parseBlockOptionValue(val) {
    var m = String(val || '').match(/^(area|street):(\d+)$/);
    if (!m) { return null; }
    return { level: m[1], id: parseInt(m[2], 10) };
  }

  function flyToSelectedBlock() {
    if (hasPlacedAddressMarker() || !neighborhoodIn || neighborhoodIn.tagName !== 'SELECT') { return; }
    var opt = neighborhoodIn.options[neighborhoodIn.selectedIndex];
    if (!opt || !opt.value) { return; }
    var parsed = parseBlockOptionValue(opt.value);
    if (!parsed || !window.AddrMap || typeof window.AddrMap.flyToEntityLocation !== 'function') {
      return;
    }
    window.AddrMap.flyToEntityLocation(parsed.level, parsed.id);
  }

  function focusMapOnSelectedCity(data, flyTo) {
    if (!window.AddrMap) {
      return;
    }
    var allowFly = flyTo !== false && !hasPlacedAddressMarker();
    var cityId = 0;
    if (data && data.city_id != null) {
      cityId = parseInt(data.city_id, 10) || 0;
    }
    if (!cityId && currentCityDbId > 0) {
      cityId = currentCityDbId;
    }
    if (cityId > 0 && typeof window.AddrMap.showPilotDernaCityBoundaries === 'function'
        && window.MapCore && typeof window.MapCore.isPilotShabiya === 'function') {
      var shNamePilot = shabiyaSel ? String(shabiyaSel.value || '').trim() : '';
      var rowPilot = findShabiyaRowForCurrentWilayah(shNamePilot);
      var codePilot = rowPilot ? String(rowPilot.code || '').trim() : '';
      var cnPilot = cityAreaIn ? String(cityAreaIn.value || '').trim() : '';
      if (window.MapCore.isPilotShabiya(shNamePilot, codePilot) && cnPilot === 'درنة') {
        window.AddrMap.showPilotDernaCityBoundaries(cityId, {
          flyTo: allowFly,
          hidePlaceMarkers: true,
          cityName: cnPilot
        });
        return;
      }
    }
    if (cityId > 0 && typeof window.AddrMap.showCityChildBoundaries === 'function') {
      window.AddrMap.showCityChildBoundaries(cityId, {
        flyTo: allowFly,
        hidePlaceMarkers: true,
        cityName: cityAreaIn ? String(cityAreaIn.value || '').trim() : ''
      });
      return;
    }
    var cn = cityAreaIn ? String(cityAreaIn.value || '').trim() : '';
    if (allowFly && cn && typeof window.AddrMap.flyToLoadedCityPlace === 'function') {
      window.AddrMap.flyToLoadedCityPlace(cn);
    }
  }

  function showCityGridOnly(flyTo) {
    focusMapOnSelectedCity(null, flyTo);
  }

  function showSelectedBlockGrid() {
    if (!neighborhoodIn || neighborhoodIn.tagName !== 'SELECT') {
      return;
    }
    if (!cityAreaIn || !String(cityAreaIn.value || '').trim()) {
      return;
    }
    var allowFly = !hasPlacedAddressMarker();
    var opt = neighborhoodIn.options[neighborhoodIn.selectedIndex];
    if (!opt || !opt.value) {
      showCityGridOnly(allowFly);
      return;
    }
    if (!window.AddrMap || currentCityDbId < 1) {
      return;
    }
    var parsed = parseBlockOptionValue(opt.value);
    if (!parsed) {
      showCityGridOnly(allowFly);
      return;
    }
    if (parsed.level === 'area' && typeof window.AddrMap.showAreaWithStreets === 'function') {
      window.AddrMap.showAreaWithStreets(parsed.id, currentCityDbId, { flyTo: allowFly });
      return;
    }
    if (parsed.level === 'street' && typeof window.AddrMap.showAreaWithStreets === 'function') {
      var areaId = parseInt(opt.getAttribute('data-area-id') || '0', 10);
      if (areaId > 0) {
        window.AddrMap.showAreaWithStreets(areaId, currentCityDbId, {
          flyTo: allowFly,
          highlightStreetId: parsed.id
        });
        return;
      }
    }
    if (typeof window.AddrMap.showBlockBoundaryOnly === 'function') {
      var parentId = parsed.level === 'area' ? currentCityDbId : parseInt(opt.getAttribute('data-area-id') || '0', 10);
      if (parentId > 0) {
        window.AddrMap.showBlockBoundaryOnly(parsed.level, parsed.id, parentId);
      }
    }
  }

  function syncSelectedBlockFromSelect() {
    if (!neighborhoodIn || neighborhoodIn.tagName !== 'SELECT') { return; }
    var opt = neighborhoodIn.options[neighborhoodIn.selectedIndex];
    if (!opt || !opt.value) {
      if (sectorIn) { sectorIn.value = 'S'; }
      var stClear = document.getElementById('street_number');
      if (stClear) { stClear.value = ''; }
      loadSavedForCurrentHood();
      updatePreview();
      updateContextBar();
      return;
    }
    var sector = opt.getAttribute('data-sector') || 'S';
    if (sectorIn) { sectorIn.value = String(sector).toUpperCase().slice(0, 2); }
    var pcCityAttr = opt.getAttribute('data-pc-city');
    if (cityIn && pcCityAttr) { cityIn.value = String(pcCityAttr); }
    var stNum = document.getElementById('street_number');
    if (stNum) {
      stNum.value = opt.getAttribute('data-type') === 'street'
        ? String(opt.getAttribute('data-name') || '').trim()
        : '';
    }
    loadSavedForCurrentHood();
    updatePreview();
    updateContextBar();
  }

  function populateNeighborhoodOptions(rows, matchLabel) {
    if (!neighborhoodIn || neighborhoodIn.tagName !== 'SELECT') { return; }
    resetNeighborhoodSelect();
    var list = Array.isArray(rows) ? rows : [];
    var areaGrp = document.createElement('optgroup');
    areaGrp.label = 'أحياء';
    var streetGrp = document.createElement('optgroup');
    streetGrp.label = 'شوارع';
    var hasArea = false;
    var hasStreet = false;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row || !row.id) { continue; }
      var o = document.createElement('option');
      o.value = String(row.type || 'area') + ':' + String(row.id);
      o.textContent = String(row.label || row.name || '—');
      o.setAttribute('data-sector', String(row.sector || 'S'));
      o.setAttribute('data-pc-city', String(row.pc_city != null ? row.pc_city : '1'));
      o.setAttribute('data-type', String(row.type || 'area'));
      o.setAttribute('data-name', String(row.name || ''));
      if (row.area_id != null) {
        o.setAttribute('data-area-id', String(row.area_id));
      }
      if (row.type === 'street') {
        streetGrp.appendChild(o);
        hasStreet = true;
      } else {
        areaGrp.appendChild(o);
        hasArea = true;
      }
    }
    if (hasArea) { neighborhoodIn.appendChild(areaGrp); }
    if (hasStreet) { neighborhoodIn.appendChild(streetGrp); }
    if (!hasArea && !hasStreet) { return; }
    var want = matchLabel ? String(matchLabel).trim() : '';
    if (want) {
      for (var j = 0; j < neighborhoodIn.options.length; j++) {
        var o2 = neighborhoodIn.options[j];
        if (!o2.value) { continue; }
        if (o2.textContent === want || o2.getAttribute('data-name') === want) {
          neighborhoodIn.selectedIndex = j;
          break;
        }
      }
    }
    syncSelectedBlockFromSelect();
    if (neighborhoodIn.value) {
      showSelectedBlockGrid();
    }
  }

  function loadCityBlocksForCurrentCity(matchLabel) {
    var cityName = cityAreaIn ? String(cityAreaIn.value || '').trim() : '';
    var regionId = areaIn ? parseInt(areaIn.value, 10) : 0;
    if (!cityName || !regionId || regionId < 1) {
      resetNeighborhoodSelect();
      if (window.AddrMap && typeof window.AddrMap.restoreShabiyatLayerIfHidden === 'function') {
        window.AddrMap.restoreShabiyatLayerIfHidden();
      }
      return Promise.resolve(null);
    }
    var gen = ++blocksFetchGen;
    resetNeighborhoodSelect();
    var url =
      'index.php?r=address_city_blocks&city=' +
      encodeURIComponent(cityName) +
      '&region_id=' +
      encodeURIComponent(String(regionId));
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) { throw new Error('blocks http ' + r.status); }
        return r.json();
      })
      .then(function (data) {
        if (gen !== blocksFetchGen) { return null; }
        if (!data || !data.ok) { return null; }
        currentCityDbId = data.city_id != null ? parseInt(data.city_id, 10) || 0 : 0;
        if (cityIn && data.pc_city != null) { cityIn.value = String(data.pc_city); }
        if (data.options && data.options.length) {
          populateNeighborhoodOptions(data.options, matchLabel);
        } else if (data.message) {
          showMsg(data.message, false);
        }
        focusMapOnSelectedCity(data, !hasPlacedAddressMarker());
        return data;
      })
      .catch(function () {
        if (gen === blocksFetchGen) {
          showMsg('تعذّر تحميل الأحياء والشوارع.', true);
        }
        return null;
      });
  }

  function resetMapForHierarchyChange(level) {
    if (cfg.isEdit || !window.AddrMap) {
      return;
    }
    if (typeof window.AddrMap.prepareHierarchyChange === 'function') {
      window.AddrMap.prepareHierarchyChange(level);
    } else if (typeof window.AddrMap.clearMapSelection === 'function') {
      window.AddrMap.clearMapSelection();
    }
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
    var h = getNeighborhoodLabel();
    if (c && h) { return c + ' | ' + h; }
    return c || h || '';
  }

  /* Show / clear the already-saved addresses (points + parcels) of the selected hood. */
  function loadSavedForCurrentHood() {
    if (!window.AddrSaved) { return; }
    var sh = shabiyaSel ? String(shabiyaSel.value || '').trim() : '';
    var loc = buildLocality();
    if (sh && loc.indexOf(' | ') >= 0) {
      window.AddrSaved.loadForHood(sh, loc);
    } else {
      window.AddrSaved.clear();
    }
  }

  function selectedWilayahAr() {
    if (!wilayahSel) { return '—'; }
    var opt = wilayahSel.options[wilayahSel.selectedIndex];
    return opt ? String(opt.textContent || '').trim() || '—' : '—';
  }

  function syncProvinceFromWilayah() {
    if (!provinceIn || !wilayahSel) { return; }
    var wk = wilayahSel.value;
    provinceIn.value = wk ? (WKEY_TO_PROV[wk] || '') : '';
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
    var hoodLbl = getNeighborhoodLabel();
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
    if (!w) {
      var ozEmpty = document.createElement('option');
      ozEmpty.value = '';
      ozEmpty.textContent = '—';
      shabiyaSel.appendChild(ozEmpty);
      shabiyaSel.value = '';
      var paEmpty = document.getElementById('pc_area');
      if (paEmpty) { paEmpty.value = ''; }
      syncAreaFromShabiya();
      return;
    }
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
      if (paClear) { paClear.value = ''; }
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
      if (cfg.isEdit) {
        syncProvinceFromWilayah();
        return;
      }
      contextBarWilayahPinned = true;
      resetMapForHierarchyChange('wilayah');
        var wkCh = wilayahSel.value ? String(wilayahSel.value).trim() : '';
        if (wkCh && window.AddrMap && typeof window.AddrMap.showWilayahRegionGrids === 'function') {
          window.AddrMap.showWilayahRegionGrids(wkCh);
        } else if (window.AddrMap) {
          if (typeof window.AddrMap.fitLibya === 'function') {
            window.AddrMap.fitLibya();
          }
        }
      syncProvinceFromWilayah();
      refillShabiyat(false);
      resetCityAreaBranchAndDatalist();
      updatePreview();
      updateContextBar();
    });
    if (wilayahSel.value) {
      syncProvinceFromWilayah();
      refillShabiyat();
    } else {
      refillShabiyat(false);
    }
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
      if (shabiyaChangeSuppress > 0) {
        syncAreaFromShabiya();
        updatePreview();
        updateContextBar();
        return;
      }
      if (cfg.isEdit) {
        return;
      }
      resetCityAreaBranchAndDatalist();
      var pv = shabiyaSel.value ? String(shabiyaSel.value).trim() : '';
      if (!pv) {
        resetMapForHierarchyChange('shabiya');
        var wkBack = wilayahSel && wilayahSel.value ? String(wilayahSel.value).trim() : '';
        if (wkBack && window.AddrMap && typeof window.AddrMap.showWilayahRegionGrids === 'function') {
          window.AddrMap.showWilayahRegionGrids(wkBack);
        }
        syncAreaFromShabiya();
        updatePreview();
        updateContextBar();
        return;
      }
      if (pv) {
        var rowShPilot = findShabiyaRowForCurrentWilayah(pv);
        var codePilot = rowShPilot ? String(rowShPilot.code || '').trim() : '';
        if (window.MapCore && typeof window.MapCore.blockNonPilotShabiya === 'function'
            && window.MapCore.blockNonPilotShabiya(pv, codePilot)) {
          beginShabiyaProgrammatic();
          shabiyaSel.value = '';
          endShabiyaProgrammatic();
          syncAreaFromShabiya();
          updatePreview();
          updateContextBar();
          return;
        }
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
            new CustomEvent('addr-shabiya-from-form', {
              detail: { name: pv, province: provLetter, code: codeStr }
            })
          );
        } catch (eFormSb) {}
      } else {
        syncAreaFromShabiya();
      }
      updatePreview();
      updateContextBar();
    });
  }

  if (cityAreaIn) {
    cityAreaIn.addEventListener('input', updateContextBar);
    cityAreaIn.addEventListener('change', function () {
      if (cfg.isEdit) { return; }
      resetMapForHierarchyChange('city');
      loadCityBlocksForCurrentCity();
      updateContextBar();
      try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eC) {}
    });
  }
  function getNeighborhoodSelectValue() {
    return neighborhoodIn ? String(neighborhoodIn.value || '') : '';
  }

  function beginEditHoodSuppress() { editHoodChangeSuppress++; }
  function endEditHoodSuppress() { editHoodChangeSuppress = Math.max(0, editHoodChangeSuppress - 1); }

  function revertNeighborhoodSelect(toVal) {
    if (!neighborhoodIn || neighborhoodIn.tagName !== 'SELECT') { return; }
    beginEditHoodSuppress();
    try {
      if (!toVal) {
        neighborhoodIn.selectedIndex = 0;
      } else {
        for (var ri = 0; ri < neighborhoodIn.options.length; ri++) {
          if (neighborhoodIn.options[ri].value === toVal) {
            neighborhoodIn.selectedIndex = ri;
            break;
          }
        }
      }
      syncSelectedBlockFromSelect();
      showSelectedBlockGrid();
      updateContextBar();
    } finally {
      endEditHoodSuppress();
    }
  }

  function clearEditLocationAndParcel() {
    if (window.MapCore && typeof window.MapCore.clearAddressMarker === 'function') {
      window.MapCore.clearAddressMarker();
    }
    if (window.MapParcel && typeof window.MapParcel.clearAll === 'function') {
      window.MapParcel.clearAll();
    }
    var hint = document.getElementById('map-parcel-desc');
    if (hint) { hint.value = ''; }
  }

  function finishNeighborhoodSelectionChange() {
    syncSelectedBlockFromSelect();
    showSelectedBlockGrid();
    try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eFin) {}
    editCommittedHoodVal = getNeighborhoodSelectValue();
  }

  function neighborhoodOptionLabelForValue(val) {
    if (!neighborhoodIn || neighborhoodIn.tagName !== 'SELECT' || !val) { return ''; }
    for (var li = 0; li < neighborhoodIn.options.length; li++) {
      var oL = neighborhoodIn.options[li];
      if (oL.value === val) {
        return String(oL.textContent || '').trim();
      }
    }
    return '';
  }

  var hoodChangeOverlay = document.getElementById('addr-hood-change-overlay');
  var hoodChangeMessage = document.getElementById('addr-hood-change-message');
  var hoodChangeConfirm = document.getElementById('addr-hood-change-confirm');
  var hoodChangeCancel = document.getElementById('addr-hood-change-cancel');
  var hoodChangeBackdrop = document.getElementById('addr-hood-change-backdrop');
  var hoodChangeOnConfirm = null;
  var hoodChangeOnCancel = null;

  function closeHoodChangeModal() {
    if (!hoodChangeOverlay) { return; }
    hoodChangeOverlay.hidden = true;
    document.body.style.overflow = '';
    hoodChangeOnConfirm = null;
    hoodChangeOnCancel = null;
  }

  function openHoodChangeModal(hoodLabel, onConfirm, onCancel) {
    if (!hoodChangeOverlay || !hoodChangeMessage) {
      if (typeof onConfirm === 'function' && window.confirm('هل ترغب بحذف حدود وموقع الحالي والانتقال إلى الحي المحدّد؟')) {
        onConfirm();
      } else if (typeof onCancel === 'function') {
        onCancel();
      }
      return;
    }
    var lbl = hoodLabel ? String(hoodLabel).trim() : 'الذي تم اختياره';
    hoodChangeMessage.textContent =
      'هل ترغب بحذف حدود وموقع الحالي والانتقال إلى الحي (' + lbl + ') لتحديد عنوان ورسم حدود جديدة؟';
    hoodChangeOnConfirm = typeof onConfirm === 'function' ? onConfirm : null;
    hoodChangeOnCancel = typeof onCancel === 'function' ? onCancel : null;
    hoodChangeOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (hoodChangeConfirm) { try { hoodChangeConfirm.focus(); } catch (eHcF) {} }
  }

  if (hoodChangeConfirm) {
    hoodChangeConfirm.addEventListener('click', function () {
      var fn = hoodChangeOnConfirm;
      closeHoodChangeModal();
      if (fn) { fn(); }
    });
  }
  if (hoodChangeCancel) {
    hoodChangeCancel.addEventListener('click', function () {
      var fn = hoodChangeOnCancel;
      closeHoodChangeModal();
      if (fn) { fn(); }
    });
  }
  if (hoodChangeBackdrop) {
    hoodChangeBackdrop.addEventListener('click', function () {
      var fn = hoodChangeOnCancel;
      closeHoodChangeModal();
      if (fn) { fn(); }
    });
  }

  function confirmEditHoodChangeIfNeeded(prevVal, newVal, hoodLabel, onProceed) {
    if (!cfg.isEdit || editHoodChangeSuppress > 0 || prevVal === newVal) {
      if (typeof onProceed === 'function') { onProceed(false); }
      return;
    }
    openHoodChangeModal(
      hoodLabel || neighborhoodOptionLabelForValue(newVal) || 'الذي تم اختياره',
      function () {
        clearEditLocationAndParcel();
        if (typeof onProceed === 'function') { onProceed(true); }
      },
      function () {
        revertNeighborhoodSelect(prevVal);
      }
    );
  }

  function selectNeighborhoodByValue(wantVal, hoodLabel) {
    if (!neighborhoodIn || neighborhoodIn.tagName !== 'SELECT' || !wantVal) { return false; }
    var prevVal = editCommittedHoodVal;
    function applySelect() {
      for (var bi = 0; bi < neighborhoodIn.options.length; bi++) {
        if (neighborhoodIn.options[bi].value === wantVal) {
          neighborhoodIn.selectedIndex = bi;
          finishNeighborhoodSelectionChange();
          return true;
        }
      }
      return false;
    }
    if (cfg.isEdit && editHoodChangeSuppress === 0 && wantVal !== prevVal) {
      beginEditHoodSuppress();
      try {
        for (var pi = 0; pi < neighborhoodIn.options.length; pi++) {
          if (neighborhoodIn.options[pi].value === wantVal) {
            neighborhoodIn.selectedIndex = pi;
            break;
          }
        }
      } finally {
        endEditHoodSuppress();
      }
      confirmEditHoodChangeIfNeeded(prevVal, wantVal, hoodLabel, function (cleared) {
        if (cleared) {
          finishNeighborhoodSelectionChange();
        }
      });
      return true;
    }
    return applySelect();
  }

  if (neighborhoodIn) {
    neighborhoodIn.addEventListener('change', function () {
      if (editHoodChangeSuppress > 0) {
        return;
      }
      var prevVal = editCommittedHoodVal;
      var newVal = getNeighborhoodSelectValue();
      if (!cfg.isEdit || newVal === prevVal) {
        finishNeighborhoodSelectionChange();
        return;
      }
      confirmEditHoodChangeIfNeeded(prevVal, newVal, getNeighborhoodLabel(), function (cleared) {
        if (cleared) {
          finishNeighborhoodSelectionChange();
        }
      });
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
    var hoodPart = '';
    if (loc.indexOf(' | ') >= 0) {
      var parts = loc.split(' | ');
      if (cityAreaIn) { cityAreaIn.value = (parts[0] || '').trim(); }
      hoodPart = (parts[1] || '').trim();
    } else {
      if (cityAreaIn) { cityAreaIn.value = loc; }
    }
    if (cityAreaIn && cityAreaIn.value) {
      var blocksLoad = loadCityBlocksForCurrentCity(hoodPart);
      if (cfg.isEdit && blocksLoad && typeof blocksLoad.then === 'function') {
        blocksLoad.then(function () {
          if (window.AddrMap && typeof window.AddrMap.showSavedLocation === 'function' && isFinite(la) && isFinite(ln)) {
            window.AddrMap.showSavedLocation(la, ln, editMapZoom);
          }
          if (cfg.isEdit) {
            editCommittedHoodVal = getNeighborhoodSelectValue();
          }
        });
      }
    } else {
      resetNeighborhoodSelect();
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
    if (!opts.skipShabiyaMapReload && shabiyaSel && shabiyaSel.value && provinceIn) {
      try {
        var rowSbSv = findShabiyaRowForCurrentWilayah(String(shabiyaSel.value).trim());
        var codeSbSv = rowSbSv ? String(rowSbSv.code || '').trim() : '';
        window.dispatchEvent(
          new CustomEvent('addr-shabiya-from-form', {
            detail: {
              name: String(shabiyaSel.value).trim(),
              province: String(provinceIn.value || '').trim(),
              code: codeSbSv
            }
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
        window.AddrMap.showSavedLocation(la, ln, cfg.isEdit ? editMapZoom : 15);
      }
    }
    try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eSv) {}
    if (cfg.isEdit) {
      editCommittedHoodVal = getNeighborhoodSelectValue();
    }
  }

  /* Fill the hierarchy + postal segments from an already-registered address (the one
     whose parcel contains the freshly placed point) and set the apartment/unit number,
     WITHOUT touching the placed marker coordinates. Used by the duplicate modal when the
     new entry is an apartment / separate building inside an existing property. */
  function applyExistingPropertyContext(r, apartmentValue) {
    if (cfg.isEdit || !r) { return; }
    contextBarLiveFromMap = true;
    contextBarWilayahPinned = false;
    if (r.wilayah && wilayahSel && WIL_KEY[r.wilayah]) {
      beginWilayahProgrammatic();
      try { wilayahSel.value = r.wilayah; } finally { endWilayahProgrammatic(); }
    }
    syncProvinceFromWilayah();
    if (provinceIn && r.pc_province) { provinceIn.value = String(r.pc_province); }
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
    var hoodPart = '';
    if (loc.indexOf(' | ') >= 0) {
      var parts = loc.split(' | ');
      if (cityAreaIn) { cityAreaIn.value = (parts[0] || '').trim(); }
      hoodPart = (parts[1] || '').trim();
    } else if (cityAreaIn) {
      cityAreaIn.value = loc;
    }
    if (cityAreaIn && cityAreaIn.value) {
      loadCityBlocksForCurrentCity(hoodPart);
    } else {
      resetNeighborhoodSelect();
    }
    var apt = document.getElementById('apartment_number');
    if (apt) { apt.value = apartmentValue != null ? String(apartmentValue) : ''; }
    updatePreview();
    updateContextBar();
  }

  function gatherNewPayload() {
    var parcelPayload = null;
    if (window.MapParcel && typeof window.MapParcel.getGeoJSON === 'function') {
      parcelPayload = window.MapParcel.getGeoJSON();
    }
    var aptEl = document.getElementById('apartment_number');
    return {
      action: cfg.isEdit && cfg.editId ? 'update' : 'create',
      id: cfg.isEdit && cfg.editId ? cfg.editId : undefined,
      csrf_token: cfg.csrf,
      pc_province: provinceIn ? provinceIn.value : '',
      pc_area: areaIn ? parseInt(areaIn.value, 10) : 0,
      pc_city: cityIn ? parseInt(cityIn.value, 10) : 0,
      pc_sector: sectorIn ? sectorIn.value : '',
      holder_name: (document.getElementById('holder_name') || {}).value || '',
      type: (document.getElementById('type') || {}).value || 'residential',
      apartment_number: aptEl ? (aptEl.value || '') : '',
      locality: buildLocality(),
      street_number: (document.getElementById('street_number') || {}).value || '',
      shabiya: shabiyaSel ? shabiyaSel.value || '' : '',
      map_lat: (document.getElementById('map-lat') || {}).value || '',
      map_lng: (document.getElementById('map-lng') || {}).value || '',
      parcel_geojson: parcelPayload && parcelPayload.geojson ? JSON.stringify(parcelPayload.geojson) : '',
      parcel_desc: parcelPayload ? (parcelPayload.desc || '') : ''
    };
  }

  function resetAddFormFields(skipMapReset) {
    if (cfg.isEdit) { return; }
    contextBarLiveFromMap = false;
    contextBarWilayahPinned = false;
    clearContextBarValues();
    if (wilayahSel) {
      beginWilayahProgrammatic();
      try { wilayahSel.value = ''; } finally { endWilayahProgrammatic(); }
    }
    syncProvinceFromWilayah();
    refillShabiyat(false);
    if (sectorIn) { sectorIn.value = 'S'; }
    if (cityIn) { cityIn.value = '1'; }
    var hn = document.getElementById('holder_name');
    if (hn) { hn.value = ''; }
    if (cityAreaIn) { cityAreaIn.value = ''; }
    resetNeighborhoodSelect();
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
    resetNeighborhoodSelect();
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

  function refocusCurrentShabiyaOnMap() {
    if (cfg.isEdit || !shabiyaSel || !shabiyaSel.value) {
      return;
    }
    var pv = String(shabiyaSel.value).trim();
    var provLetter = provinceIn ? String(provinceIn.value || '').trim() : '';
    if (!pv || !provLetter) {
      return;
    }
    var row = findShabiyaRowForCurrentWilayah(pv);
    var code = row ? String(row.code || '').trim() : '';
    try {
      window.dispatchEvent(
        new CustomEvent('addr-shabiya-from-form', {
          detail: { name: pv, province: provLetter, code: code }
        })
      );
    } catch (_) {}
  }

  function resetAfterSaveToShabiya() {
    if (cfg.isEdit) {
      return;
    }
    contextBarLiveFromMap = false;
    contextBarWilayahPinned = true;
    try {
      cfg.editId = 0;
    } catch (eId) {}
    syncProvinceFromWilayah();
    syncAreaFromShabiya();
    resetCityAreaBranchAndDatalist();
    if (cityIn) {
      cityIn.value = '1';
    }
    if (sectorIn) {
      sectorIn.value = 'S';
    }
    var hn = document.getElementById('holder_name');
    if (hn) {
      hn.value = '';
    }
    var ap = document.getElementById('apartment_number');
    if (ap) {
      ap.value = '';
    }
    var st = document.getElementById('street_number');
    if (st) {
      st.value = '';
    }
    var typ = document.getElementById('type');
    if (typ) {
      typ.value = 'residential';
    }
    var hint = document.getElementById('map-parcel-desc');
    if (hint) {
      hint.value = '';
    }
    updatePreview();
    updateContextBar();
    stripAddressNewIdFromLocation();
    resetMapForHierarchyChange('shabiya');
    try {
      window.dispatchEvent(new Event('addr-map-clear-annotations'));
    } catch (_) {}
    refocusCurrentShabiyaOnMap();
    if (window.AddrMap && typeof window.AddrMap.restoreDefaultBoundaryLayers === 'function') {
      window.AddrMap.restoreDefaultBoundaryLayers();
    } else if (window.AddrMap && typeof window.AddrMap.restoreBoundariesLayerPreference === 'function') {
      window.AddrMap.restoreBoundariesLayerPreference();
    }
    try {
      window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh'));
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
      try { window.dispatchEvent(new Event('addr-map-reset')); } catch (eBtnRst) {}
      showMsg('أُعيدت الإدخالات.', false);
    });
  }

  /* Map → form fill (multi-level drill-down) */
  function applyMapFill(d) {
    if (cfg.isEdit) { return; }
    contextBarLiveFromMap = true;
    contextBarWilayahPinned = false;
    var level = (d && d.level) ? String(d.level) : '';

    if (level === 'country') {
      if (wilayahSel) {
        beginWilayahProgrammatic();
        try { wilayahSel.value = ''; } finally { endWilayahProgrammatic(); }
      }
      syncProvinceFromWilayah();
      refillShabiyat(false);
      if (cityAreaIn) { cityAreaIn.value = ''; }
      resetNeighborhoodSelect();
      updatePreview();
      updateContextBar();
      try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eCnt) {}
      return;
    }

    if (level === 'wilayah') {
      if (d.province && wilayahSel) {
        var wkWil = WILAYAH_BY_PROVINCE[d.province];
        if (wkWil) {
          beginWilayahProgrammatic();
          try { wilayahSel.value = wkWil; } finally { endWilayahProgrammatic(); }
        }
      }
      syncProvinceFromWilayah();
      refillShabiyat(false);
      if (shabiyaSel) {
        beginShabiyaProgrammatic();
        try { shabiyaSel.value = ''; } finally { endShabiyaProgrammatic(); }
      }
      syncAreaFromShabiya();
      if (cityAreaIn) { cityAreaIn.value = ''; }
      resetNeighborhoodSelect();
      updatePreview();
      updateContextBar();
      try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eWil) {}
      return;
    }

    if (level === 'city') {
      if (cityAreaIn && d.place) { cityAreaIn.value = String(d.place).trim(); }
      resetNeighborhoodSelect();
      loadCityBlocksForCurrentCity();
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
      beginShabiyaProgrammatic();
      try {
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
      } finally {
        endShabiyaProgrammatic();
      }
    }
    syncAreaFromShabiya();
    var pa = document.getElementById('pc_area');
    if (pa && d.area != null) { pa.value = String(d.area); }
    if (cityIn && d.city != null) { cityIn.value = String(d.city); }
    if (sectorIn && d.sector) { sectorIn.value = String(d.sector).toUpperCase().slice(0, 2); }
    if (level === 'shabiya') {
      if (cityAreaIn) { cityAreaIn.value = ''; }
      resetNeighborhoodSelect();
    } else if (cityAreaIn && d.place) {
      cityAreaIn.value = String(d.place).trim();
      loadCityBlocksForCurrentCity();
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
    var cityIdFromMap = parseInt(d.cityId, 10) || 0;
    if (!cityIdFromMap) {
      resetMapForHierarchyChange('city');
    }
    resetNeighborhoodSelect();
    loadCityBlocksForCurrentCity();
    updatePreview();
    updateContextBar();
    try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eP) {}
  });

  window.addEventListener('addr-block-select', function (ev) {
    if (!ev || !ev.detail) { return; }
    var d = ev.detail;
    var level = String(d.level || '');
    var id = parseInt(d.id, 10) || 0;
    if (!id || !neighborhoodIn || neighborhoodIn.tagName !== 'SELECT') { return; }
    var wantVal = level + ':' + id;
    var hoodLbl = d.name ? String(d.name).trim() : '';
    if (selectNeighborhoodByValue(wantVal, hoodLbl)) { return; }
    if (cityAreaIn && cityAreaIn.value) {
      loadCityBlocksForCurrentCity(hoodLbl).then(function () {
        selectNeighborhoodByValue(wantVal, hoodLbl);
        try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eRf) {}
      });
    }
  });

  window.addEventListener('addr-city-places-updated', function (ev) {
    var raw = ev && ev.detail ? ev.detail.names : null;
    rebuildCityAreaDatalist(Array.isArray(raw) ? raw : []);
  });

  window.addEventListener('addr-neighborhood-fill', function (ev) {
    if (!ev || !ev.detail || !neighborhoodIn) { return; }
    var n = ev.detail.neighborhood ? String(ev.detail.neighborhood).trim() : '';
    if (!n) { return; }
    if (neighborhoodIn.tagName === 'SELECT') {
      var matchedVal = '';
      for (var ni = 0; ni < neighborhoodIn.options.length; ni++) {
        var oN = neighborhoodIn.options[ni];
        if (!oN.value) { continue; }
        if (oN.textContent === n || oN.getAttribute('data-name') === n) {
          matchedVal = oN.value;
          break;
        }
      }
      if (!matchedVal && cityAreaIn && cityAreaIn.value) {
        loadCityBlocksForCurrentCity(n);
        return;
      }
      if (matchedVal) {
        selectNeighborhoodByValue(matchedVal, n);
      }
      if (!hasPlacedAddressMarker()) {
        flyToSelectedBlock();
      }
    } else {
      neighborhoodIn.value = n;
    }
    updateContextBar();
  });

  /* Non-blocking duplicate warnings: a centered modal lets the user keep the placement
     ("موافق على أي حال") or revert it ("إلغاء وإرجاع"). Triggers when the new point falls
     inside a saved parcel, or the new parcel overlaps/contains a saved one — same hood. */
  var dupWarnOverlay = document.getElementById('addr-dup-warn-overlay');
  var dupWarnMessage = document.getElementById('addr-dup-warn-message');
  var dupWarnConfirm = document.getElementById('addr-dup-warn-confirm');
  var dupWarnCancel = document.getElementById('addr-dup-warn-cancel');
  var dupWarnBackdrop = document.getElementById('addr-dup-warn-backdrop');
  var dupWarnUnitBtn = document.getElementById('addr-dup-warn-unit');
  var dupWarnUnitWrap = document.getElementById('addr-dup-warn-unit-wrap');
  var dupWarnUnitInput = document.getElementById('addr-dup-warn-unit-input');
  var dupWarnUnitApply = document.getElementById('addr-dup-warn-unit-apply');
  var dupWarnRevert = null;
  var dupWarnMatchedRow = null;

  function closeDupWarnModal() {
    if (!dupWarnOverlay) { return; }
    dupWarnOverlay.hidden = true;
    document.body.style.overflow = '';
    dupWarnRevert = null;
    dupWarnMatchedRow = null;
    if (dupWarnUnitWrap) { dupWarnUnitWrap.hidden = true; }
    if (dupWarnUnitInput) { dupWarnUnitInput.value = ''; }
    if (dupWarnUnitBtn) { dupWarnUnitBtn.hidden = true; }
  }

  function openDupWarnModal(opts) {
    if (!dupWarnOverlay || !dupWarnMessage) { return; }
    opts = opts || {};
    dupWarnMessage.textContent = opts.message || '';
    dupWarnRevert = typeof opts.onRevert === 'function' ? opts.onRevert : null;
    dupWarnMatchedRow = opts.matchedRow || null;
    if (dupWarnUnitWrap) { dupWarnUnitWrap.hidden = true; }
    if (dupWarnUnitInput) { dupWarnUnitInput.value = ''; }
    if (dupWarnUnitBtn) { dupWarnUnitBtn.hidden = !dupWarnMatchedRow; }
    dupWarnOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (dupWarnConfirm) { try { dupWarnConfirm.focus(); } catch (eFoc) {} }
  }

  if (dupWarnConfirm) {
    dupWarnConfirm.addEventListener('click', closeDupWarnModal);
  }
  if (dupWarnBackdrop) {
    dupWarnBackdrop.addEventListener('click', closeDupWarnModal);
  }
  if (dupWarnCancel) {
    dupWarnCancel.addEventListener('click', function () {
      var fn = dupWarnRevert;
      closeDupWarnModal();
      if (fn) { fn(); }
    });
  }
  if (dupWarnUnitBtn) {
    dupWarnUnitBtn.addEventListener('click', function () {
      if (dupWarnUnitWrap) { dupWarnUnitWrap.hidden = false; }
      if (dupWarnUnitInput) { try { dupWarnUnitInput.focus(); } catch (eUF) {} }
    });
  }
  if (dupWarnUnitApply) {
    dupWarnUnitApply.addEventListener('click', function () {
      var val = dupWarnUnitInput ? String(dupWarnUnitInput.value || '').trim() : '';
      if (!val) {
        if (dupWarnUnitInput) { try { dupWarnUnitInput.focus(); } catch (eUF2) {} }
        return;
      }
      var row = dupWarnMatchedRow;
      closeDupWarnModal();
      applyExistingPropertyContext(row, val);
      showMsg('سيُسجَّل العنوان كشقة/مبنى ضمن العقار المسجّل مسبقاً: ' + val, false);
    });
  }

  window.addEventListener('addr-address-marker-placed', function (ev) {
    if (!window.AddrSaved || !ev || !ev.detail) { return; }
    var la = parseFloat(ev.detail.lat);
    var ln = parseFloat(ev.detail.lng);
    if (!isFinite(la) || !isFinite(ln)) { return; }
    var matched = window.AddrSaved.findContainingAddress(la, ln);
    if (matched) {
      openDupWarnModal({
        message: 'الموقع المُحدّد يقع داخل حدود عقار مسجّل مسبقاً في نفس الحي.',
        matchedRow: matched,
        onRevert: function () {
          if (window.MapCore && typeof window.MapCore.clearAddressMarker === 'function') {
            window.MapCore.clearAddressMarker();
          }
          try { window.dispatchEvent(new CustomEvent('addr-marker-cta-refresh')); } catch (eR) {}
        }
      });
    }
  });

  window.addEventListener('addr-parcel-finished', function (ev) {
    if (!window.AddrSaved || !ev || !ev.detail || !ev.detail.latlngs) { return; }
    var ring = window.AddrSaved.latlngsToRing(ev.detail.latlngs);
    if (!ring || ring.length < 4) { return; }
    var poly = [ring];
    var hit = window.AddrSaved.parcelOverlapsLoaded(poly);
    if (!hit) {
      var loadedRows = window.AddrSaved.getLoaded();
      for (var i = 0; i < loadedRows.length; i++) {
        var row = loadedRows[i];
        if (row.lat !== null && window.AddrSaved.polygonContains(poly, row.lat, row.lng)) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      var drawnLayer = ev.detail.layer || null;
      openDupWarnModal({
        message: 'حدود الأرض المرسومة تتداخل مع عقار مسجّل مسبقاً في نفس الحي.',
        onRevert: function () {
          if (window.MapParcel && typeof window.MapParcel.removeParcelLayer === 'function') {
            window.MapParcel.removeParcelLayer(drawnLayer);
          }
        }
      });
    }
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

  var workbench = document.querySelector('.add-address-workbench');
  if (workbench) {
    var hideToolboxBtn = document.getElementById('btn-gis-toolbox-hide');
    var showToolboxBtn = document.getElementById('btn-gis-toolbox-show');
    var hideSidebarBtn = document.getElementById('btn-addr-sidebar-hide');
    var showSidebarBtn = document.getElementById('btn-addr-sidebar-show');

    function refreshMapLayout() {
      window.setTimeout(function () {
        if (window.MapCore && window.MapCore.map) {
          window.MapCore.map.invalidateSize(false);
          if (typeof window.MapCore.refreshMapMaskForView === 'function') {
            window.MapCore.refreshMapMaskForView();
          }
          if (typeof window.MapCore.updateMapClipOverlays === 'function') {
            window.MapCore.updateMapClipOverlays();
          }
        }
      }, 320);
    }

    function setToolboxCollapsed(collapsed) {
      workbench.classList.toggle('add-address-workbench--gis-toolbox-collapsed', collapsed);
      if (hideToolboxBtn) {
        hideToolboxBtn.hidden = collapsed;
      }
      if (showToolboxBtn) {
        showToolboxBtn.setAttribute('aria-hidden', collapsed ? 'false' : 'true');
        showToolboxBtn.tabIndex = collapsed ? 0 : -1;
      }
      refreshMapLayout();
    }

    function setSidebarCollapsed(collapsed) {
      workbench.classList.toggle('add-address-workbench--sidebar-collapsed', collapsed);
      if (hideSidebarBtn) {
        hideSidebarBtn.hidden = collapsed;
      }
      if (showSidebarBtn) {
        showSidebarBtn.setAttribute('aria-hidden', collapsed ? 'false' : 'true');
        showSidebarBtn.tabIndex = collapsed ? 0 : -1;
      }
      refreshMapLayout();
    }

    if (hideToolboxBtn) {
      hideToolboxBtn.addEventListener('click', function () {
        setToolboxCollapsed(true);
      });
    }
    if (showToolboxBtn) {
      showToolboxBtn.addEventListener('click', function () {
        setToolboxCollapsed(false);
      });
    }
    if (hideSidebarBtn) {
      hideSidebarBtn.addEventListener('click', function () {
        setSidebarCollapsed(true);
      });
    }
    if (showSidebarBtn) {
      showSidebarBtn.addEventListener('click', function () {
        setSidebarCollapsed(false);
      });
    }
  }

  function initSavedParcelBoundary() {
    if (!cfg.savedParcel || !cfg.savedParcel.geojson) {
      return;
    }
    function tryLoad() {
      if (window.MapParcel && typeof window.MapParcel.loadFromGeoJSON === 'function') {
        window.MapParcel.loadFromGeoJSON(
          cfg.savedParcel.geojson,
          cfg.savedParcel.desc || '',
          null,
          false
        );
        return true;
      }
      return false;
    }
    if (!tryLoad()) {
      window.addEventListener('load', function () {
        setTimeout(tryLoad, 120);
      });
    }
  }
  initSavedParcelBoundary();

  if (cfg.isEdit && cfg.editRecord) {
    function bootEditRecord() {
      applySavedRecord(cfg.editRecord);
    }
    if (document.readyState === 'complete') {
      setTimeout(bootEditRecord, 300);
    } else {
      window.addEventListener('load', function () {
        setTimeout(bootEditRecord, 300);
      });
    }
  }

  /* Public surface for sibling modules (save.js, edit.js). */
  window.AddressForm = {
    cfg: cfg,
    showMsg: showMsg,
    gatherNewPayload: gatherNewPayload,
    applySavedRecord: applySavedRecord,
    resetAddFormFields: resetAddFormFields,
    resetAddFormParcelOnly: resetAddFormParcelOnly,
    applyExistingPropertyContext: applyExistingPropertyContext,
    resetAfterSaveToShabiya: resetAfterSaveToShabiya,
    dispatchNewSceneWithinCurrentShubiya: dispatchNewSceneWithinCurrentShubiya,
    stripAddressNewIdFromLocation: stripAddressNewIdFromLocation,
    updateContextBar: updateContextBar,
    updatePreview: updatePreview
  };
})();
