/**
 * Boundary Editor — wires Leaflet + Leaflet-Geoman:
 *   left panel:  level tabs + entity dropdown
 *   middle:      map with Geoman drawing tools
 *   right panel: name / code / color / save / delete
 *
 * Workflow:
 *   1) User clicks a level tab (ولاية / شعبية / مدينة / حي / شارع).
 *   2) Entity dropdown is auto-populated with ALL entities at that level.
 *   3) Picking an entity loads its boundary (if any) and makes it editable.
 *      No boundary yet ⇒ user can draw a new one and Save.
 *   4) Entity dropdown lists all entities at the active level.
 *
 * Talks to BoundaryEditorController:
 *   GET  index.php?r=boundary_entities      &level=&parent_id=
 *   GET  index.php?r=boundary_get           &level=&entity_id=  (saved geometry from DB)
 *   GET  index.php?r=boundary_list          &level=&parent_id=
 *   POST index.php?r=boundary_save          (CSRF)
 *   POST index.php?r=boundary_delete        (CSRF)
 *   POST index.php?r=boundary_entity_create (CSRF)
 *   POST index.php?r=boundary_entity_add_grid (CSRF) — area|street + grid at click
 */
(function () {
  'use strict';

  function reportEditorError(err, prefix) {
    var msg = (err && err.message) ? String(err.message) : String(err || 'خطأ غير معروف');
    var elStatus = document.getElementById('be-status');
    if (elStatus) {
      elStatus.textContent = (prefix || 'خطأ في المحرر') + ': ' + msg;
      elStatus.classList.add('is-err');
    }
    if (typeof console !== 'undefined' && console.error) {
      console.error(prefix || 'boundary editor', err);
    }
  }

  try {

  var el = document.getElementById('be-map');
  if (!el || typeof L === 'undefined') {
    return;
  }

  var csrfEl = document.getElementById('be-csrf');
  var csrf = csrfEl ? csrfEl.value : '';

  var swLat = parseFloat(el.dataset.swLat);
  var swLng = parseFloat(el.dataset.swLng);
  var neLat = parseFloat(el.dataset.neLat);
  var neLng = parseFloat(el.dataset.neLng);
  var bounds = L.latLngBounds([swLat, swLng], [neLat, neLng]);
  var minZ = parseInt(el.dataset.minZoom, 10) || 5;
  var maxZ = parseInt(el.dataset.maxZoom, 10) || 19;
  var maxZSat = parseInt(el.dataset.maxZoomSat, 10) || 17;
  var currentBaseKind = 'osm';

  function applyMapMaxZoomForBase(kind) {
    var cap = kind === 'sat' ? maxZSat : maxZ;
    map.setMaxZoom(cap);
    if (map.getZoom() > cap) {
      map.setZoom(cap);
    }
  }

  var map = L.map('be-map', {
    maxBounds: bounds,
    maxBoundsViscosity: 0.85,
    minZoom: minZ,
    maxZoom: maxZ
  });
  map.createPane('labelEditPane');
  map.getPane('labelEditPane').style.zIndex = 960;

  /* Default = OSM so the user always sees a map. The offline layer is wired
   * but only auto-falls-back when MBTiles is empty/missing. */
  var offline = L.tileLayer('index.php?r=tile&z={z}&x={x}&y={y}', {
    maxZoom: maxZ, maxNativeZoom: 18, bounds: bounds,
    attribution: 'Libya Postal (offline) / OSM',
    errorTileUrl: ''
  });
  var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: maxZ, maxNativeZoom: 19, bounds: bounds,
    attribution: '&copy; OpenStreetMap'
  });
  var satLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: maxZSat,
      maxNativeZoom: maxZSat,
      bounds: bounds,
      attribution: '&copy; Esri, Maxar, Earthstar Geographics'
    }
  );

  function syncBaseLayerUi() {
    var satActive = currentBaseKind === 'sat';
    document.querySelectorAll('.be-base-map-btn[data-base]').forEach(function (btn) {
      var isSat = btn.getAttribute('data-base') === 'sat';
      var active = isSat ? satActive : !satActive;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setBaseLayer(kind) {
    if (kind !== 'sat' && kind !== 'osm') {
      return;
    }
    currentBaseKind = kind;
    if (kind === 'sat') {
      if (map.hasLayer(osm)) {
        map.removeLayer(osm);
      }
      if (!map.hasLayer(satLayer)) {
        satLayer.addTo(map);
      }
    } else {
      if (map.hasLayer(satLayer)) {
        map.removeLayer(satLayer);
      }
      if (!map.hasLayer(osm)) {
        osm.addTo(map);
      }
    }
    applyMapMaxZoomForBase(kind);
    syncBaseLayerUi();
    map.invalidateSize(false);
    if (typeof satLayer.redraw === 'function') {
      satLayer.redraw();
    }
    if (typeof osm.redraw === 'function') {
      osm.redraw();
    }
  }

  document.querySelectorAll('.be-base-map-btn[data-base]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setBaseLayer(btn.getAttribute('data-base') === 'sat' ? 'sat' : 'osm');
    });
  });

  osm.addTo(map);
  syncBaseLayerUi();
  map.fitBounds(bounds, { padding: [20, 20] });

  /* Ensure the map fills its container correctly after layout settles. */
  requestAnimationFrame(function () {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [20, 20] });
  });
  window.addEventListener('resize', function () { map.invalidateSize(); });
  if (typeof ResizeObserver === 'function') {
    var ro = new ResizeObserver(function () { map.invalidateSize(); });
    ro.observe(document.getElementById('be-map'));
  }

  /* Geoman init */
  map.pm.setLang('ar');
  map.pm.addControls({
    position: 'topleft',
    drawCircle: false,
    drawCircleMarker: false,
    drawMarker: false,
    drawText: false,
    drawPolyline: false,
    drawPolygon: true,
    drawRectangle: true,
    editMode: true,
    dragMode: true,
    cutPolygon: true,
    removalMode: true,
    rotateMode: true
  });
  map.pm.setGlobalOptions({ snappable: true, snapDistance: 18 });

  /* DOM refs */
  var statusEl = document.getElementById('be-status');
  var entitySel = document.getElementById('be-entity');
  var entityLabel = document.getElementById('be-entity-label');
  var ENTITY_LABELS = {
    state:  'الولاية المراد تحريرها',
    region: 'الشعبية المراد تحريرها',
    city:   'المدينة المراد تحريرها',
    area:   'الحي المراد تحريره',
    street: 'الشارع المراد تحريره'
  };
  var ENTITY_PLACEHOLDERS = {
    state:  'اختر ولاية',
    region: 'اختر شعبية',
    city:   'اختر مدينة',
    area:   'اختر حي',
    street: 'اختر شارع'
  };
  var PROP_LEGENDS = {
    state:  'خصائص الولاية',
    region: 'خصائص الشعبية',
    city:   'خصائص المدينة',
    area:   'خصائص الحي',
    street: 'خصائص الشارع'
  };
  var CHILD_LEVEL_NAMES = {
    region: 'شعبية',
    city:   'مدينة',
    area:   'حي',
    street: 'شارع'
  };
  var propsLegend = document.getElementById('be-props-legend');

  function entityPlaceholder() {
    return ENTITY_PLACEHOLDERS[state.level] || 'اختر كياناً';
  }

  function boundaryScopeParams(level, parentId) {
    return {
      level: level || state.level,
      parent_id: parentId != null ? parentId : (state.drillParentId || '')
    };
  }

  function updateEntityUi() {
    if (entityLabel) {
      entityLabel.textContent = ENTITY_LABELS[state.level] || 'الكيان المراد تحريره';
    }
    if (propsLegend) {
      propsLegend.textContent = PROP_LEGENDS[state.level] || 'خصائص الكيان';
    }
    if (entitySel && entitySel.options.length && entitySel.options[0].value === '') {
      entitySel.options[0].textContent = entityPlaceholder();
    }
  }
  var nameIn = document.getElementById('be-prop-name');
  var codeIn = document.getElementById('be-prop-code');
  var colorIn = document.getElementById('be-prop-color');
  var saveBtn = document.getElementById('be-save-btn');
  var deleteBtn = document.getElementById('be-delete-btn');
  var regenGridBtn = document.getElementById('be-regen-grid-btn');
  var statVertices = document.getElementById('be-stat-vertices');
  var statArea = document.getElementById('be-stat-area');
  var statPerim = document.getElementById('be-stat-perim');
  var addChildWrap = document.getElementById('be-add-child-wrap');
  var addChildBtn = document.getElementById('be-add-child-btn');
  var addChildCtx = document.getElementById('be-add-child-ctx');
  var addChildCancel = document.getElementById('be-add-child-cancel');
  var labelPosWrap = document.getElementById('be-label-pos-wrap');
  var labelResetBtn = document.getElementById('be-label-reset-btn');

  var tabs = document.querySelectorAll('.be-tab');

  var PROVINCE_COLORS = { B: '#ef4444', T: '#22c55e', F: '#cbd5e1' };

  function syncProvinceColorsFromGlobal() {
    if (window.ProvinceColors && typeof window.ProvinceColors.getAll === 'function') {
      var all = window.ProvinceColors.getAll();
      if (all.B) { PROVINCE_COLORS.B = all.B; }
      if (all.T) { PROVINCE_COLORS.T = all.T; }
      if (all.F) { PROVINCE_COLORS.F = all.F; }
    }
  }

  syncProvinceColorsFromGlobal();

  window.addEventListener('province-colors-changed', function () {
    syncProvinceColorsFromGlobal();
    loadOverview();
    if (state.currentLayer && state.entityId) {
      var c = defaultColorForProps({ province: state.level === 'state' ? (codeIn && codeIn.value) : '', color: colorIn ? colorIn.value : '' });
      if (colorIn) { colorIn.value = c; }
      state.currentLayer.setStyle({ color: c, fillColor: c, fillOpacity: state.currentIsGrid ? 0.24 : 0.2 });
    }
  });
  var PROTECTED_LEVELS = { state: true, region: true };
  var GRID_LEVELS = { city: true, area: true };
  var ADD_CHILD_LEVELS = { area: true, street: true };
  var CREATE_ON_SAVE_LEVELS = { region: true, city: true, area: true, street: true };
  var LABEL_POSITION_LEVELS = { city: true, area: true, street: true };
  var contextLabelSeen = {};
  var DRILL_CHILD = { state: 'region', region: 'city', city: 'area', area: 'street' };
  var MAX_SPAN = { city: 0.85, area: 0.35, street: 0.12 };
  var DISMISS_KEY = 'be_dismissed_grids';
  var listSeq = 0;
  var boundarySeq = 0;
  var pickSeq = 0;
  var siblingsSeq = 0;

  var state = {
    level: 'state',
    entityId: 0,
    entityName: '',
    drillParentId: null,
    parentContext: null,
    placeMode: null,
    addNewMode: false,
    childView: { level: null, parentId: null },
    currentLayer: null,
    currentIsGrid: false,
    geometryDirty: false,
    overviewLayer: L.layerGroup().addTo(map),
    statesOverviewLayer: L.layerGroup().addTo(map),
    regionsOverviewLayer: L.layerGroup().addTo(map),
    labelsLayer: L.layerGroup().addTo(map),
    pickLayer: L.layerGroup().addTo(map),
    siblingsLayer: L.layerGroup().addTo(map),
    labelLayer: L.layerGroup().addTo(map),
    contextLabelLayer: L.layerGroup().addTo(map),
    labelMarker: null,
    labelDirty: false
  };

  function labelPositionSupported() {
    return !!LABEL_POSITION_LEVELS[state.level];
  }

  function escapeLabelHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function syncLabelUi() {
    var show = labelPositionSupported() && !!state.currentLayer && (!!state.entityId || !!state.addNewMode);
    if (labelPosWrap) {
      labelPosWrap.hidden = !show;
    }
    if (labelResetBtn) {
      labelResetBtn.disabled = !show || !state.labelMarker;
    }
  }

  function removeLabelMarker() {
    if (state.labelMarker) {
      try { state.labelLayer.removeLayer(state.labelMarker); } catch (eRm) {}
      state.labelMarker = null;
    }
    syncLabelUi();
  }

  function boundaryLayerCenter(layer) {
    if (!layer || !layer.getBounds) { return null; }
    try {
      var c = layer.getBounds().getCenter();
      return c ? { lat: c.lat, lng: c.lng } : null;
    } catch (eC) {
      return null;
    }
  }

  function featureCenterFromGeoJSON(feature) {
    if (!feature || !feature.geometry) { return null; }
    var tmp = null;
    try {
      tmp = L.geoJSON(feature);
      var c = tmp.getBounds().getCenter();
      return c ? { lat: c.lat, lng: c.lng } : null;
    } catch (eFc) {
      return null;
    } finally {
      if (tmp) {
        try { map.removeLayer(tmp); } catch (eRm) {}
      }
    }
  }

  function labelPositionFromProps(props, layer, feature) {
    var lat = props && props.label_lat != null ? Number(props.label_lat) : NaN;
    var lng = props && props.label_lng != null ? Number(props.label_lng) : NaN;
    if (lat === lat && lng === lng) {
      return { lat: lat, lng: lng };
    }
    return boundaryLayerCenter(layer) || featureCenterFromGeoJSON(feature);
  }

  function buildLabelMarkerIcon(name, editable) {
    var safe = escapeLabelHtml(name || state.entityName || '—');
    var pinCls = 'be-label-pin' + (editable ? ' be-label-pin--edit' : ' be-label-pin--ctx');
    return L.divIcon({
      className: 'be-label-pin-icon' + (editable ? ' be-label-pin-icon--edit' : ' be-label-pin-icon--ctx'),
      html:
        '<div class="' + pinCls + '" title="' + safe + '">' +
        '<span class="be-label-pin__text">' + safe + '</span>' +
        '<span class="be-label-pin__dot" aria-hidden="true"></span>' +
        '</div>',
      iconSize: [1, 1],
      iconAnchor: [0, 0]
    });
  }

  function patchLabelMarkerIcon(marker) {
    if (!marker || !marker._icon) { return; }
    var icon = marker._icon;
    icon.style.pointerEvents = 'auto';
    icon.style.overflow = 'visible';
    icon.style.background = 'transparent';
    icon.style.border = 'none';
    var pin = icon.querySelector('.be-label-pin');
    if (pin) {
      pin.style.pointerEvents = 'auto';
    }
  }

  function refreshLabelMarkerText() {
    if (!state.labelMarker) { return; }
    var nm = (nameIn && nameIn.value) ? String(nameIn.value).trim() : state.entityName;
    state.labelMarker.setIcon(buildLabelMarkerIcon(nm, true));
    patchLabelMarkerIcon(state.labelMarker);
  }

  function installLabelMarker(lat, lng, name) {
    removeLabelMarker();
    if (!labelPositionSupported() || lat == null || lng == null) {
      return;
    }
    state.labelMarker = L.marker([lat, lng], {
      draggable: true,
      pane: 'labelEditPane',
      pmIgnore: true,
      interactive: true,
      icon: buildLabelMarkerIcon(name, true),
      zIndexOffset: 2000
    });
    state.labelMarker.on('add', function () {
      patchLabelMarkerIcon(state.labelMarker);
    });
    state.labelMarker.on('dragend', function () {
      state.labelDirty = true;
      updateSaveButton();
      syncLabelUi();
    });
    state.labelMarker.on('mouseover', function () {
      if (state.labelMarker.bringToFront) { state.labelMarker.bringToFront(); }
    });
    state.labelMarker.addTo(state.labelLayer);
    patchLabelMarkerIcon(state.labelMarker);
    if (state.labelMarker.bringToFront) { state.labelMarker.bringToFront(); }
    syncLabelUi();
  }

  function clearContextLabelPins() {
    contextLabelSeen = {};
    state.contextLabelLayer.clearLayers();
  }

  function installContextLabelPin(feature, level) {
    if (!LABEL_POSITION_LEVELS[level]) { return; }
    var p = (feature && feature.properties) || {};
    if (p.is_point || (feature.geometry && feature.geometry.type === 'Point')) { return; }
    var eid = Number(p.entity_id);
    if (!eid || contextLabelSeen[eid]) { return; }
    if (state.entityId && eid === Number(state.entityId)) { return; }
    contextLabelSeen[eid] = true;
    var pos = labelPositionFromProps(p, null, feature);
    if (!pos) { return; }
    var nm = p.name || '';
    if (!nm) { return; }
    var marker = L.marker([pos.lat, pos.lng], {
      draggable: false,
      pane: 'labelEditPane',
      pmIgnore: true,
      interactive: false,
      icon: buildLabelMarkerIcon(nm, false),
      zIndexOffset: 1500
    });
    marker.on('add', function () {
      patchLabelMarkerIcon(marker);
    });
    marker.addTo(state.contextLabelLayer);
    patchLabelMarkerIcon(marker);
  }

  function syncLabelMarkerFromFeature(feature) {
    if (!labelPositionSupported() || !state.currentLayer) {
      removeLabelMarker();
      state.labelDirty = false;
      syncLabelUi();
      return;
    }
    var props = (feature && feature.properties) || {};
    var pos = labelPositionFromProps(props, state.currentLayer, feature);
    if (!pos) {
      removeLabelMarker();
      state.labelDirty = false;
      syncLabelUi();
      return;
    }
    installLabelMarker(pos.lat, pos.lng, props.name || state.entityName);
    state.labelDirty = false;
    syncLabelUi();
  }

  function centerLabelOnBoundary() {
    if (!state.currentLayer) { return; }
    var pos = boundaryLayerCenter(state.currentLayer);
    if (!pos) { return; }
    if (state.labelMarker) {
      state.labelMarker.setLatLng([pos.lat, pos.lng]);
    } else {
      installLabelMarker(pos.lat, pos.lng, state.entityName);
    }
    state.labelDirty = true;
    updateSaveButton();
    syncLabelUi();
    setStatus('تم توسيط اسم العنوان على الحد — اضغط «حفظ» لتثبيت الموقع.', false);
  }

  function appendLabelCoordsToForm(fd) {
    if (!labelPositionSupported() || !state.labelMarker) {
      return;
    }
    var ll = state.labelMarker.getLatLng();
    if (!ll) { return; }
    fd.append('label_lat', String(ll.lat));
    fd.append('label_lng', String(ll.lng));
  }

  function loadPostalRegions() {
    var el = document.getElementById('postal-map-regions-data');
    if (!el) { return []; }
    try {
      var arr = JSON.parse(el.textContent || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (eReg) {
      return [];
    }
  }

  var postalRegions = loadPostalRegions();

  function installBoundaryLabels() {
    state.labelsLayer.clearLayers();
    for (var j = 0; j < postalRegions.length; j++) {
      var lb = postalRegions[j];
      var code = lb.code || (lb.province && lb.n ? lb.province + lb.n : '');
      if (typeof lb.lat !== 'number' || typeof lb.lng !== 'number' || !code) {
        continue;
      }
      L.marker([lb.lat, lb.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'postal-map-label',
          html: '<span>' + String(code).replace(/</g, '') + '</span>',
          iconSize: [44, 24],
          iconAnchor: [22, 12]
        })
      }).addTo(state.labelsLayer);
    }
  }

  function syncLayerToggle(name, layer, checkboxId) {
    var cb = document.getElementById(checkboxId);
    if (!cb || !layer) { return; }
    cb.addEventListener('change', function () {
      updateOverviewVisibility();
    });
  }

  installBoundaryLabels();
  syncLayerToggle('states', state.statesOverviewLayer, 'be-layer-states');
  syncLayerToggle('regions', state.regionsOverviewLayer, 'be-layer-regions');
  syncLayerToggle('labels', state.labelsLayer, 'be-layer-labels');
  syncLayerControlsUi();

  function loadDismissedGrids() {
    try {
      var raw = sessionStorage.getItem(DISMISS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (eDismiss) {
      return [];
    }
  }

  function saveDismissedGrids(list) {
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(list));
    } catch (eSave) {}
  }

  function gridDismissKey(level, entityId) {
    return String(level) + ':' + String(entityId);
  }

  function isGridDismissed(level, entityId) {
    if (!entityId) { return false; }
    return loadDismissedGrids().indexOf(gridDismissKey(level, entityId)) >= 0;
  }

  function dismissGrid(level, entityId) {
    var list = loadDismissedGrids();
    var key = gridDismissKey(level, entityId);
    if (list.indexOf(key) < 0) {
      list.push(key);
      saveDismissedGrids(list);
    }
  }

  function undismissGrid(level, entityId) {
    var key = gridDismissKey(level, entityId);
    saveDismissedGrids(loadDismissedGrids().filter(function (k) { return k !== key; }));
  }

  function shouldSkipGridFeature(level, props) {
    if (!props || !props.is_grid) { return false; }
    return isGridDismissed(level || props.level || state.level, Number(props.entity_id || 0));
  }

  function syncActionButtons() {
    if (!deleteBtn) { return; }
    var hide = !!PROTECTED_LEVELS[state.level];
    var hasLayer = !!state.currentLayer;
    var gridLevel = !!GRID_LEVELS[state.level];
    var dismissed = gridLevel && isGridDismissed(state.level, state.entityId);

    deleteBtn.hidden = hide;
    deleteBtn.disabled = hide || !state.entityId || (!hasLayer && !state.currentIsGrid);
    deleteBtn.textContent = state.currentIsGrid ? 'حذف الشبكة' : 'حذف';

    if (regenGridBtn) {
      regenGridBtn.hidden = hide || !gridLevel;
      regenGridBtn.disabled = hide || !state.entityId || (!dismissed && hasLayer);
    }
  }

  function syncDeleteButton() {
    syncActionButtons();
  }

  function canCreateOnSave() {
    if (state.entityId) { return false; }
    if (!CREATE_ON_SAVE_LEVELS[state.level]) { return false; }
    if (!state.drillParentId) { return false; }
    var nm = (nameIn && nameIn.value || '').trim();
    if (!nm) { return false; }
    return !!state.currentLayer;
  }

  function canSave() {
    if (state.entityId && (state.level === 'state' || state.level === 'region')) {
      return true;
    }
    if (!state.currentLayer) {
      return false;
    }
    if (state.entityId) {
      return true;
    }
    return canCreateOnSave();
  }

  function updateSaveButton() {
    if (!saveBtn) { return; }
    saveBtn.disabled = !canSave();
  }

  function provinceColor(prov, savedColor) {
    if (savedColor) {
      return String(savedColor);
    }
    if (window.ProvinceColors && typeof window.ProvinceColors.getColor === 'function') {
      return window.ProvinceColors.getColor(prov);
    }
    return PROVINCE_COLORS[String(prov || '').toUpperCase()] || '#94a3b8';
  }

  function provinceHoverFill(prov) {
    return provinceColor(prov);
  }

  var beBorderPulseTimers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var beBorderPulseTick = {};

  function beStopBorderPulse(layer) {
    if (!layer) { return; }
    if (beBorderPulseTimers) {
      var t = beBorderPulseTimers.get(layer);
      if (t) {
        clearInterval(t);
        beBorderPulseTimers.delete(layer);
      }
      return;
    }
    if (layer._leaflet_id && beBorderPulseTick[layer._leaflet_id]) {
      clearInterval(beBorderPulseTick[layer._leaflet_id]);
      delete beBorderPulseTick[layer._leaflet_id];
    }
  }

  function beStartBorderPulse(layer, hoverStyle) {
    beStopBorderPulse(layer);
    var pulseOn = true;
    var heavy = Object.assign({}, hoverStyle, {
      weight: (hoverStyle.weight || 2) + 1.4,
      opacity: 1
    });
    var light = Object.assign({}, hoverStyle, {
      weight: hoverStyle.weight || 2,
      opacity: 0.65
    });
    var tick = function () {
      if (!layer._map) {
        beStopBorderPulse(layer);
        return;
      }
      pulseOn = !pulseOn;
      layer.setStyle(pulseOn ? heavy : light);
    };
    tick();
    var id = setInterval(tick, 400);
    if (beBorderPulseTimers) {
      beBorderPulseTimers.set(layer, id);
    } else {
      beBorderPulseTick[layer._leaflet_id] = id;
    }
  }

  function stateHoverStyle(prov, savedColor) {
    var c = provinceColor(prov, savedColor);
    return {
      color: c,
      weight: 4.2,
      opacity: 1,
      fillColor: provinceHoverFill(prov),
      fillOpacity: 0.34,
      dashArray: null
    };
  }

  function regionHoverStyle(prov, savedColor) {
    var c = provinceColor(prov, savedColor);
    return {
      color: c,
      weight: 2.8,
      opacity: 1,
      fillColor: provinceHoverFill(prov),
      fillOpacity: 0.42,
      dashArray: null
    };
  }

  function attachPolygonHover(layer, baseStyleFn, hoverStyleFn) {
    if (!layer || typeof layer.on !== 'function') { return; }
    var baseStyle = baseStyleFn();
    layer.on('mouseover', function () {
      beStartBorderPulse(layer, hoverStyleFn());
      if (layer.bringToFront) { layer.bringToFront(); }
    });
    layer.on('mouseout', function () {
      beStopBorderPulse(layer);
      layer.setStyle(baseStyle);
    });
  }

  function resetEntitySelectLoading() {
    if (!entitySel) { return; }
    entitySel.innerHTML = '';
    var op0 = document.createElement('option');
    op0.value = '';
    op0.textContent = 'جارٍ التحميل…';
    entitySel.appendChild(op0);
    /* Keep enabled so the user can still open the list; options refresh when fetch completes. */
    entitySel.disabled = false;
  }

  function resolveTabParentId(nextLevel, prevLevel, prevEntityId, prevEntityName, cv) {
    var parentId = null;

    if (cv && cv.level === nextLevel && cv.parentId) {
      return cv.parentId;
    }

    if (nextLevel === 'region' && prevLevel === 'state' && prevEntityId) {
      parentId = prevEntityId;
      setParentContext('state', prevEntityId, prevEntityName);
      return parentId;
    }
    if (nextLevel === 'city' && prevLevel === 'region' && prevEntityId) {
      parentId = prevEntityId;
      setParentContext('region', prevEntityId, prevEntityName);
      return parentId;
    }
    if (nextLevel === 'area') {
      if (prevLevel === 'city' && prevEntityId) {
        parentId = prevEntityId;
        setParentContext('city', prevEntityId, prevEntityName);
        return parentId;
      }
      if (state.parentContext && state.parentContext.level === 'city' && state.parentContext.id) {
        return state.parentContext.id;
      }
      return null;
    }
    if (nextLevel === 'street') {
      if (prevLevel === 'area' && prevEntityId) {
        parentId = prevEntityId;
        setParentContext('area', prevEntityId, prevEntityName);
        return parentId;
      }
      if (state.parentContext && state.parentContext.level === 'area' && state.parentContext.id) {
        return state.parentContext.id;
      }
      return null;
    }
    if (nextLevel !== 'state') {
      return null;
    }
    return parentId;
  }

  function activateTab(level) {
    tabs.forEach(function (t) {
      t.classList.toggle('is-active', t.dataset.level === level);
    });
    state.level = level;
    updateEntityUi();
    syncDeleteButton();
    syncLayerControlsUi();
    syncAddChildUi();
  }

  function setParentContext(level, id, name) {
    if (!id) {
      state.parentContext = null;
    } else {
      state.parentContext = { level: level, id: id, name: name || '' };
    }
    syncAddChildUi();
  }

  function syncAddChildUi() {
    var level = state.level;
    var show = !!ADD_CHILD_LEVELS[level];
    if (addChildWrap) {
      addChildWrap.hidden = !show;
    }
    if (!show) {
      state.placeMode = null;
      if (map.getContainer()) {
        map.getContainer().classList.remove('be-map--placing');
      }
      if (addChildCancel) {
        addChildCancel.hidden = true;
      }
      return;
    }
    var parentLabel = level === 'area' ? 'المدينة' : 'الحي';
    var childLabel = level === 'area' ? 'حي' : 'شارع';
    if (addChildBtn) {
      var nm = (nameIn && nameIn.value || '').trim();
      if (state.addNewMode && nm && !state.placeMode) {
        addChildBtn.textContent = 'تحديد على الخريطة';
      } else {
        addChildBtn.textContent = '+ إضافة ' + childLabel;
      }
      addChildBtn.disabled = !state.drillParentId || !!state.placeMode;
    }
    if (addChildCtx) {
      if (!state.drillParentId) {
        addChildCtx.textContent = 'اختر ' + parentLabel + ' أولاً (من الخريطة أو القائمة).';
      } else if (state.parentContext && Number(state.parentContext.id) === Number(state.drillParentId) && state.parentContext.name) {
        addChildCtx.textContent = 'ضمن ' + parentLabel + ': ' + state.parentContext.name;
      } else {
        addChildCtx.textContent = 'ضمن ' + parentLabel + ' (#' + state.drillParentId + ')';
      }
    }
    if (addChildCancel) {
      addChildCancel.hidden = !(state.placeMode || state.addNewMode || state.entityId || state.currentLayer);
    }
    if (show && (state.placeMode || state.addNewMode || !state.entityId)) {
      if (nameIn) { nameIn.disabled = false; }
      if (codeIn) { codeIn.disabled = false; }
      if (colorIn) { colorIn.disabled = false; }
    }
  }

  function prepareNewChild() {
    if (!state.drillParentId) {
      var parentLabel = state.level === 'area' ? 'المدينة' : 'الحي';
      setStatus('اختر ' + parentLabel + ' أولاً (من الخريطة أو القائمة).', true);
      return;
    }
    var childLabel = state.level === 'area' ? 'حي' : 'شارع';
    var name = (nameIn && nameIn.value || '').trim();
    if (state.addNewMode && name) {
      startPlaceMode();
      return;
    }
    cancelPlaceMode(false);
    state.addNewMode = true;
    state.entityId = 0;
    state.entityName = '';
    if (entitySel) { entitySel.value = ''; }
    removeCurrentLayer();
    if (nameIn) {
      nameIn.value = '';
      nameIn.disabled = false;
      nameIn.focus();
    }
    if (codeIn) {
      codeIn.value = '';
      codeIn.disabled = false;
    }
    if (colorIn) {
      colorIn.value = '#0ea5e9';
      colorIn.disabled = false;
    }
    updateSaveButton();
    syncDeleteButton();
    syncAddChildUi();
    setStatus(
      'أدخل بيانات ' + childLabel + ' الجديد وارسم المضلع ثم احفظ، أو أدخل الاسم واضغط «تحديد على الخريطة» لتوليد شبكة تلقائية.',
      false
    );
  }

  function cancelChildSelection() {
    cancelPlaceMode(false);
    state.addNewMode = false;
    state.entityId = 0;
    state.entityName = '';
    if (entitySel) { entitySel.value = ''; }
    removeCurrentLayer();
    setEntityProps(null);
    updateSaveButton();
    syncDeleteButton();
    syncAddChildUi();
    var childLabel = state.level === 'area' ? 'حي' : 'شارع';
    setStatus('أُلغي التحديد — اختر ' + childLabel + 'اً من القائمة أو اضغط «+ إضافة ' + childLabel + '».', false);
  }

  function startPlaceMode() {
    var childLabel = state.level === 'area' ? 'الحي' : 'الشارع';
    var name = (nameIn && nameIn.value || '').trim();
    if (!name) {
      setStatus('أدخل اسم ' + childLabel + ' في حقل الاسم أولاً.', true);
      if (nameIn) { nameIn.focus(); }
      return;
    }
    if (!state.drillParentId) {
      setStatus('اختر الكيان الأب أولاً.', true);
      return;
    }
    state.placeMode = {
      level: state.level,
      parentId: state.drillParentId,
      name: name,
      code: codeIn ? (codeIn.value || '') : '',
      color: colorIn ? (colorIn.value || '#0ea5e9') : '#0ea5e9'
    };
    if (map.getContainer()) {
      map.getContainer().classList.add('be-map--placing');
    }
    setStatus('انقر على الخريطة داخل حدود ' + (state.level === 'area' ? 'المدينة' : 'الحي') + ' لتحديد موقع «' + name + '».', false);
    syncAddChildUi();
  }

  function cancelPlaceMode(clearStatus) {
    state.placeMode = null;
    if (map.getContainer()) {
      map.getContainer().classList.remove('be-map--placing');
    }
    syncAddChildUi();
    if (clearStatus !== false && ADD_CHILD_LEVELS[state.level]) {
      setStatus('أُلغي وضع التحديد على الخريطة.', false);
    }
  }

  function submitPlaceMode(lat, lng) {
    var pm = state.placeMode;
    if (!pm) { return; }
    var fd = new FormData();
    fd.append('csrf_token', csrf);
    fd.append('level', pm.level);
    fd.append('parent_id', String(pm.parentId));
    fd.append('name', pm.name);
    fd.append('code', pm.code);
    fd.append('color', pm.color);
    fd.append('lat', String(lat));
    fd.append('lng', String(lng));

    cancelPlaceMode(false);
    setStatus('جارٍ إنشاء الكيان وحفظ الشبكة…', false);
    fetch(apiUrl('boundary_entity_add_grid'), { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) {
          setStatus((data && data.message) || 'فشل الإضافة.', true);
          return;
        }
        state.entityId = Number(data.id);
        state.entityName = pm.name;
        state.addNewMode = false;
        state.currentIsGrid = false;
        if (nameIn) { nameIn.value = pm.name; }
        if (codeIn && pm.code) { codeIn.value = pm.code; }
        syncDeleteButton();
        refreshEntityList().then(function () {
          if (entitySel) { entitySel.value = String(data.id); }
          if (data.feature) {
            applyLoadedBoundaryFeature(data.feature, true);
          }
          drawSiblingsLayer(state.drillParentId);
          if (state.drillParentId) {
            loadPickLayer(state.level, state.drillParentId);
          }
          var hier = data.hierarchy || {};
          var trail = [];
          ['state', 'region', 'city', 'area', 'street'].forEach(function (k) {
            if (hier[k] && hier[k].name) { trail.push(hier[k].name); }
          });
          setStatus(
            (data.message || 'تم الحفظ.') + (trail.length ? ' — التسلسل: ' + trail.join(' ← ') : ''),
            false
          );
        });
      })
      .catch(function () {
        setStatus('فشل الاتصال بالخادم.', true);
      });
  }

  var layerOverviewWrap = document.getElementById('be-layer-overview-wrap');
  var layerOverviewLabel = document.getElementById('be-map-controls-overview-label');

  function syncLayerControlsUi() {
    var level = state.level;
    var showOverview = level === 'state' || level === 'region';
    if (layerOverviewWrap) {
      layerOverviewWrap.hidden = !showOverview;
    }
    if (layerOverviewLabel) {
      layerOverviewLabel.textContent = level === 'state'
        ? 'طبقات الولاية والشعبيات'
        : 'طبقات الشعبيات والتسميات';
    }
    var stateRow = document.querySelector('.be-layer-check--states');
    var regionRow = document.querySelector('.be-layer-check--regions');
    var labelsRow = document.querySelector('.be-layer-check--labels');
    if (stateRow) { stateRow.hidden = level !== 'state'; }
    if (regionRow) { regionRow.hidden = !showOverview; }
    if (labelsRow) { labelsRow.hidden = !showOverview; }
    updateOverviewVisibility();
  }

  function updateOverviewVisibility() {
    var showOverview = state.level === 'state' || state.level === 'region';
    var layers = [
      { layer: state.statesOverviewLayer, cb: 'be-layer-states' },
      { layer: state.regionsOverviewLayer, cb: 'be-layer-regions' },
      { layer: state.labelsLayer, cb: 'be-layer-labels' }
    ];
    layers.forEach(function (entry) {
      if (!entry.layer) { return; }
      if (!showOverview) {
        if (map.hasLayer(entry.layer)) { map.removeLayer(entry.layer); }
        return;
      }
      if (state.level === 'region' && entry.cb === 'be-layer-states') {
        if (map.hasLayer(entry.layer)) { map.removeLayer(entry.layer); }
        return;
      }
      var cb = document.getElementById(entry.cb);
      if (cb && cb.checked && !map.hasLayer(entry.layer)) {
        map.addLayer(entry.layer);
      } else if (cb && !cb.checked && map.hasLayer(entry.layer)) {
        map.removeLayer(entry.layer);
      }
    });
  }

  function layerSpan(layer) {
    if (!layer || !layer.getBounds) { return null; }
    try {
      var b = layer.getBounds();
      return {
        lat: Math.abs(b.getNorth() - b.getSouth()),
        lng: Math.abs(b.getEast() - b.getWest())
      };
    } catch (eSpan) {
      return null;
    }
  }

  function spanTooLarge(level, span) {
    if (!span) { return false; }
    var max = MAX_SPAN[level];
    if (!max) { return span.lat > 3 || span.lng > 3; }
    return span.lat > max || span.lng > max;
  }

  function flyToLayer(layer, level) {
    if (!layer) { return; }
    level = level || state.level;
    try {
      if (layer.getBounds) {
        var span = layerSpan(layer);
        if (spanTooLarge(level, span)) {
          if (state.entityId) {
            zoomToEntityLocation(level, state.entityId);
          }
          return;
        }
        var zoomCap = level === 'city' ? 15 : (level === 'area' ? 16 : 13);
        map.fitBounds(layer.getBounds(), { padding: [48, 48], maxZoom: Math.min(maxZ, zoomCap) });
      } else if (layer.getLatLng) {
        map.flyTo(layer.getLatLng(), Math.min(maxZ, 13), { duration: 0.45 });
      }
    } catch (eFly) {}
  }

  function flyToLocation(loc) {
    if (!loc) { return; }
    try {
      if (loc.bounds && loc.bounds.length === 4) {
        var b = L.latLngBounds(
          [loc.bounds[0], loc.bounds[1]],
          [loc.bounds[2], loc.bounds[3]]
        );
        var latSpan = Math.abs(loc.bounds[2] - loc.bounds[0]);
        var lngSpan = Math.abs(loc.bounds[3] - loc.bounds[1]);
        if (latSpan < 0.02 && lngSpan < 0.02) {
          map.flyTo([loc.lat, loc.lng], loc.zoom || Math.min(maxZ, 11), { duration: 0.45 });
        } else {
          map.fitBounds(b, { padding: [40, 40], maxZoom: Math.min(maxZ, 13) });
        }
      } else if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        map.flyTo([loc.lat, loc.lng], loc.zoom || Math.min(maxZ, 11), { duration: 0.45 });
      }
    } catch (eLoc) {}
  }

  function zoomToEntityLocation(level, entityId) {
    if (!entityId) { return Promise.resolve(false); }
    var url = apiUrl('boundary_entity_loc', { level: level, entity_id: entityId });
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (data) {
        if (!data || !data.ok) { return false; }
        flyToLocation(data);
        return true;
      })
      .catch(function () { return false; });
  }

  function defaultColorForProps(props) {
    if (props && props.color) {
      return String(props.color);
    }
    var prov = props && (props.province || props.code);
    if (prov) {
      if (window.ProvinceColors && typeof window.ProvinceColors.getColor === 'function') {
        return window.ProvinceColors.getColor(prov);
      }
      var letter = String(prov).charAt(0).toUpperCase();
      if (PROVINCE_COLORS[letter]) {
        return PROVINCE_COLORS[letter];
      }
    }
    return colorIn ? (colorIn.value || '#0ea5e9') : '#0ea5e9';
  }

  function selectEntity(level, entityId, props, layer, fromDropdown) {
    activateTab(level);
    state.addNewMode = false;
    state.entityId = entityId;
    state.entityName = props && props.name ? String(props.name) : '';
    if (entitySel) {
      entitySel.value = String(entityId);
    }
    setEntityProps({
      name: state.entityName,
      code: props && props.code ? String(props.code) : '',
      color: defaultColorForProps(props)
    });
    syncDeleteButton();
    syncAddChildUi();
    loadCurrentBoundary();
    if (!fromDropdown && layer) {
      flyToLayer(layer);
    }
  }

  function openAreaEditorForCity(cityId, cityName, layer) {
    var cid = Number(cityId);
    if (!cid) { return; }
    activateTab('area');
    state.drillParentId = cid;
    state.childView = { level: 'area', parentId: cid };
    setParentContext('city', cid, cityName || '');
    state.entityId = 0;
    state.entityName = '';
    if (entitySel) { entitySel.value = ''; }
    setEntityProps(null);
    removeCurrentLayer();
    syncDeleteButton();
    syncAddChildUi();
    resetEntitySelectLoading();
    setStatus('جارٍ تحميل الأحياء…', false);
    refreshEntityList().then(function () {
      loadPickLayer('area', cid);
      if (layer) { flyToLayer(layer); }
      setStatus('اختر حيّاً من القائمة أو انقر على الخريطة.', false);
    });
  }

  function revealChildren(childLevel, parentId, layer) {
    if (!childLevel || !parentId) { return; }
    state.childView = { level: childLevel, parentId: parentId };
    setStatus('جارٍ تحميل ' + (ENTITY_PLACEHOLDERS[childLevel] || childLevel) + '…', false);
    loadPickLayer(childLevel, parentId).then(function () {
      if (layer) { flyToLayer(layer); }
      setStatus('انقر ' + (CHILD_LEVEL_NAMES[childLevel] || childLevel) + ' على الخريطة للتحرير.', false);
    });
  }

  function drillDown(nextLevel, parentId, props, layer) {
    if (!nextLevel) { return; }
    var parentLevel = state.level;
    var parentName = props && props.name ? String(props.name) : '';
    activateTab(nextLevel);
    state.drillParentId = parentId;
    state.childView = { level: nextLevel, parentId: parentId };
    setParentContext(parentLevel, parentId, parentName);
    removeCurrentLayer();
    setEntityProps(null);
    state.entityId = 0;
    syncDeleteButton();
    setStatus('جارٍ تحميل ' + (ENTITY_PLACEHOLDERS[nextLevel] || nextLevel) + '…', false);
    refreshEntityList().then(function () {
      loadPickLayer(nextLevel, parentId);
      if (layer) { flyToLayer(layer); }
      setStatus('انقر مكاناً على الخريطة للتحرير، أو اختر من القائمة.', false);
    });
  }

  function onMapFeatureClick(props, layer) {
    if (state.placeMode) { return; }
    if (!props || !props.entity_id) { return; }
    var level = props.level || state.level;
    var entityId = Number(props.entity_id);
    if (level === 'region') {
      selectEntity('region', entityId, props, layer, false);
      revealChildren('city', entityId, layer);
      return;
    }
    if (level === 'city') {
      if (props.parent_id) {
        state.drillParentId = Number(props.parent_id);
        state.childView = { level: 'city', parentId: state.drillParentId };
      }
      var cityName = props && props.name ? String(props.name) : '';
      setParentContext('city', entityId, cityName);
      openAreaEditorForCity(entityId, cityName, layer);
      return;
    }
    if (level === 'area') {
      selectEntity('area', entityId, props, layer, false);
      revealChildren('street', entityId, layer);
      return;
    }
    selectEntity(level, entityId, props, layer, false);
  }

  function apiGet(route, params) {
    var url = apiUrl(route, params);
    return fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    })
      .then(function (r) {
        return parseJsonResponse(r).then(function (data) {
          if (!r.ok || data.ok === false) {
            return Object.assign({
              ok: false,
              message: (data && data.message) || ('HTTP ' + r.status)
            }, data || {});
          }
          return data;
        });
      })
      .catch(function () {
        return { ok: false, message: 'تعذّر الاتصال بالخادم.' };
      });
  }

  function loadOverview() {
    return apiGet('boundary_overview').then(function (data) {
        if (!data || !data.ok) {
          setStatus((data && data.message) || 'تعذّر تحميل التقسيمات على الخريطة.', true);
          return;
        }
        state.overviewLayer.clearLayers();
        state.statesOverviewLayer.clearLayers();
        state.regionsOverviewLayer.clearLayers();
        if (!map.hasLayer(state.overviewLayer)) {
          map.addLayer(state.overviewLayer);
        }

        if (data.colors && window.ProvinceColors) {
          window.ProvinceColors.setColors(data.colors, true);
          syncProvinceColorsFromGlobal();
        }

        if (data.states && data.states.features) {
          L.geoJSON(data.states, {
            style: function (f) {
              var p = f.properties || {};
              var prov = p.province || '';
              var c = provinceColor(prov, p.color);
              return {
                color: c,
                weight: 3,
                opacity: 0.9,
                fillColor: c,
                fillOpacity: 0.2,
                dashArray: '6,4',
                interactive: true
              };
            },
            onEachFeature: function (f, layer) {
              var p = f.properties || {};
              var prov = p.province || '';
              var c = provinceColor(prov, p.color);
              layer.bindTooltip((p.code || '') + ' — ' + (p.name || ''), { sticky: true, direction: 'center', className: 'shabiya-tooltip' });
              attachPolygonHover(layer, function () {
                return {
                  color: c,
                  weight: 3,
                  opacity: 0.85,
                  fillColor: c,
                  fillOpacity: 0.2,
                  dashArray: '6,4'
                };
              }, function () {
                return stateHoverStyle(prov, p.color);
              });
              layer.on('click', function (ev) {
                if (L.DomEvent) { L.DomEvent.stopPropagation(ev); }
                selectEntity('state', Number(p.entity_id), p, layer, false);
              });
            }
          }).addTo(state.statesOverviewLayer);
        }

        if (data.regions && data.regions.features) {
          L.geoJSON(data.regions, {
            style: function (f) {
              var p = f.properties || {};
              var prov = p.province || '';
              var c = provinceColor(prov, p.color);
              return {
                color: c,
                weight: 1.4,
                opacity: 0.9,
                fillColor: c,
                fillOpacity: 0.14,
                interactive: true
              };
            },
            onEachFeature: function (f, layer) {
              var p = f.properties || {};
              var prov = p.province || '';
              var c = provinceColor(prov, p.color);
              var tip = (p.code ? p.code + ' — ' : '') + (p.name || '');
              layer.bindTooltip(tip, { sticky: true, direction: 'top', className: 'shabiya-tooltip' });
              attachPolygonHover(layer, function () {
                return {
                  color: c,
                  weight: 1.4,
                  opacity: 0.9,
                  fillColor: c,
                  fillOpacity: 0.14
                };
              }, function () {
                return regionHoverStyle(prov, p.color);
              });
              layer.on('click', function (ev) {
                if (L.DomEvent) { L.DomEvent.stopPropagation(ev); }
                onMapFeatureClick(p, layer);
              });
            }
          }).addTo(state.regionsOverviewLayer);
        }
      });
  }

  function loadPickLayer(level, parentId) {
    state.pickLayer.clearLayers();
    if (!parentId) {
      clearContextLabelPins();
      return Promise.resolve();
    }
    var seq = ++pickSeq;
    var url = apiUrl('boundary_list', boundaryScopeParams(level, parentId));
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { features: [] }; })
      .then(function (fc) {
        if (seq !== pickSeq) { return; }
        if (!state.entityId) { clearContextLabelPins(); }
        var feats = (fc && fc.features) || [];
        feats.forEach(function (f) {
          var p = f.properties || {};
          if (shouldSkipGridFeature(level, p)) { return; }
          if (state.entityId && Number(p.entity_id) === Number(state.entityId)) { return; }
          addGeoFeatureToGroup(f, level, state.pickLayer, 0);
          if (!state.entityId) { installContextLabelPin(f, level); }
        });
      });
  }

  function setStatus(msg, isErr) {
    if (!statusEl) { return; }
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-err', !!isErr);
  }

  function fmt(n, digits) { return Number(n).toFixed(digits == null ? 2 : digits); }

  function refreshStats() {
    if (!state.currentLayer) {
      statVertices.textContent = '—';
      statArea.textContent = '—';
      statPerim.textContent = '—';
      return;
    }
    var gj = state.currentLayer.toGeoJSON ? state.currentLayer.toGeoJSON() : null;
    if (!gj || !gj.geometry) { return; }
    var coords = gj.geometry.coordinates;
    var verts = 0;
    function countRing(ring) { verts += ring.length; }
    function countPoly(poly) { for (var i = 0; i < poly.length; i++) { countRing(poly[i]); } }
    if (gj.geometry.type === 'Polygon') { countPoly(coords); }
    else if (gj.geometry.type === 'MultiPolygon') { coords.forEach(countPoly); }
    statVertices.textContent = String(verts);

    /* approx area in km^2 using spherical excess on the outer ring */
    var sqKm = 0;
    try {
      var layers = (typeof state.currentLayer.getLatLngs === 'function') ? [state.currentLayer] : [];
      layers.forEach(function (lyr) {
        var rings = lyr.getLatLngs();
        if (!rings || !rings.length) { return; }
        var outer = rings[0];
        if (Array.isArray(outer[0])) { outer = outer[0]; }
        var n = outer.length;
        var s = 0;
        for (var i = 0, j = n - 1; i < n; j = i++) {
          var lat1 = outer[i].lat * Math.PI / 180;
          var lat2 = outer[j].lat * Math.PI / 180;
          s += (outer[j].lng - outer[i].lng) * Math.PI / 180 * (2 + Math.sin(lat1) + Math.sin(lat2));
        }
        sqKm += Math.abs(s * 6378.137 * 6378.137 / 2);
      });
    } catch (e) {}
    statArea.textContent = sqKm > 0 ? fmt(sqKm, 1) + ' كم²' : '—';

    /* perimeter */
    var km = 0;
    try {
      var ring = state.currentLayer.getLatLngs ? state.currentLayer.getLatLngs() : [];
      if (Array.isArray(ring) && ring.length) {
        var rr = ring[0];
        if (Array.isArray(rr[0])) { rr = rr[0]; }
        for (var p = 0; p < rr.length - 1; p++) {
          km += rr[p].distanceTo(rr[p + 1]) / 1000;
        }
      }
    } catch (e2) {}
    statPerim.textContent = km > 0 ? fmt(km, 2) + ' كم' : '—';
  }

  /* ============================================================
   *  Data loaders
   * ============================================================ */
  function apiUrl(route, params) {
    var base = (typeof window.LP_API_BASE === 'string' && window.LP_API_BASE) ? window.LP_API_BASE : 'index.php?r=';
    var url = base + encodeURIComponent(route);
    if (params) {
      Object.keys(params).forEach(function (key) {
        var val = params[key];
        if (val === null || val === undefined || val === '') { return; }
        url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(String(val));
      });
    }
    return url;
  }

  function parseJsonResponse(r) {
    return r.text().then(function (txt) {
      try {
        return JSON.parse(txt);
      } catch (eJson) {
        return { ok: false, message: 'استجابة غير صالحة من الخادم.', rows: [] };
      }
    });
  }

  function fetchEntities(level, parentId) {
    return apiGet('boundary_entities', { level: level, parent_id: parentId || '' })
      .then(function (data) {
        if (!data || data.ok === false) {
          return { ok: false, rows: [], message: (data && data.message) || 'تعذّر تحميل القائمة.' };
        }
        return data;
      });
  }

  function fillSelect(selectEl, rows, placeholder) {
    selectEl.innerHTML = '';
    var op0 = document.createElement('option');
    op0.value = '';
    op0.textContent = placeholder || '— اختر —';
    selectEl.appendChild(op0);
    rows.forEach(function (r) {
      var op = document.createElement('option');
      op.value = String(r.id);
      var label = r.code ? r.name + ' (' + r.code + ')' : r.name;
      if (r.has_boundary) { label = '● ' + label; }
      op.textContent = label;
      op.dataset.code = r.code || '';
      if (r.color) { op.dataset.color = String(r.color); }
      op.dataset.has = r.has_boundary ? '1' : '0';
      op.dataset.level = state.level;
      if (r.parent_id) { op.dataset.parentId = String(r.parent_id); }
      selectEl.appendChild(op);
    });
    selectEl.disabled = false;
  }

  function applyParentFromOption(op) {
    if (!op || !op.dataset.parentId) { return false; }
    var parentId = parseInt(op.dataset.parentId, 10);
    if (!parentId) { return false; }
    state.drillParentId = parentId;
    state.childView = { level: state.level, parentId: parentId };
    return true;
  }

  function featureStyle(p, level, selected) {
    var isGrid = !!(p && p.is_grid);
    var color = (p && p.color) || (isGrid ? '#f59e0b' : '#38bdf8');
    if (selected) {
      return {
        color: color,
        weight: 2.5,
        opacity: 1,
        fillColor: color,
        fillOpacity: 0.28,
        dashArray: isGrid ? '4,3' : null
      };
    }
    return {
      color: isGrid ? '#b45309' : (p.color || '#94a3b8'),
      weight: isGrid ? 1.6 : 1.2,
      opacity: 0.85,
      fillColor: isGrid ? '#fbbf24' : (p.color || '#94a3b8'),
      fillOpacity: isGrid ? 0.14 : 0.06,
      dashArray: isGrid ? '5,4' : '4,4',
      interactive: true
    };
  }

  function addGeoFeatureToGroup(f, level, group, selectedId) {
    var p = f.properties || {};
    var isPoint = p.is_point || (f.geometry && f.geometry.type === 'Point');
    if (isPoint && f.geometry && f.geometry.coordinates) {
      var lng = f.geometry.coordinates[0];
      var lat = f.geometry.coordinates[1];
      var cm = L.circleMarker([lat, lng], {
        radius: selectedId && Number(p.entity_id) === Number(selectedId) ? 8 : 6,
        color: '#0c4a6e',
        weight: 2,
        fillColor: '#fcd34d',
        fillOpacity: 0.92
      });
      cm.bindTooltip(p.name || '', { sticky: true, direction: 'top' });
      var cmBase = {
        radius: selectedId && Number(p.entity_id) === Number(selectedId) ? 8 : 6,
        color: '#0c4a6e',
        weight: 2,
        fillColor: '#fcd34d',
        fillOpacity: 0.92
      };
      cm.on('mouseover', function () {
        cm.setStyle({
          radius: 9,
          weight: 2.8,
          color: '#082f49',
          fillColor: '#d97706',
          fillOpacity: 1
        });
        if (cm.bringToFront) { cm.bringToFront(); }
      });
      cm.on('mouseout', function () {
        cm.setStyle(cmBase);
      });
      cm.on('click', function (ev) {
        if (L.DomEvent) { L.DomEvent.stopPropagation(ev); }
        onMapFeatureClick(Object.assign({ level: level }, p), cm);
      });
      cm.addTo(group);
      return;
    }
    var isSelected = !!(selectedId && Number(p.entity_id) === Number(selectedId));
    var basePolyStyle = featureStyle(p, level, isSelected);
    var lyr = L.geoJSON(f, {
      style: basePolyStyle,
      onEachFeature: function (_feat, subLayer) {
        if (isSelected) { return; }
        var hoverStyle = (function () {
          var color = basePolyStyle.fillColor || basePolyStyle.color || '#38bdf8';
          return {
            color: color,
            weight: (basePolyStyle.weight || 1.2) + 1.6,
            opacity: 1,
            fillColor: color,
            fillOpacity: Math.min(0.52, (basePolyStyle.fillOpacity || 0.06) + 0.34),
            dashArray: null
          };
        })();
        attachPolygonHover(subLayer, function () {
          return Object.assign({}, basePolyStyle);
        }, function () {
          return Object.assign({}, hoverStyle);
        });
      }
    });
    lyr.on('click', function (ev) {
      if (L.DomEvent) { L.DomEvent.stopPropagation(ev); }
      onMapFeatureClick(Object.assign({ level: level }, p), lyr);
    });
    lyr.bindTooltip((p.name || '') + (p.is_grid ? ' (شبكة)' : ''), { sticky: true });
    lyr.addTo(group);
  }

  function flyToFeatureCollection(fc, level) {
    if (!fc || !fc.features || !fc.features.length) { return; }
    try {
      var gj = L.geoJSON(fc);
      var bounds = gj.getBounds();
      if (!bounds.isValid()) { return; }
      var zoomCap = level === 'city' ? 14 : (level === 'area' ? 15 : 12);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: Math.min(maxZ, zoomCap) });
    } catch (eFc) {}
  }

  function refreshEntityList() {
    var parentId = state.drillParentId;
    var level = state.level;
    var seq = ++listSeq;
    return fetchEntities(level, parentId).then(function (resp) {
      if (seq !== listSeq || level !== state.level) { return; }
      var rows = (resp && resp.rows) || [];
      if (resp && resp.ok === false && resp.message) {
        setStatus(resp.message, true);
      }
      fillSelect(entitySel, rows, entityPlaceholder());
      syncDeleteButton();
      if (rows.length === 0 && !(resp && resp.ok === false && resp.message)) {
        if (level === 'area' && !parentId) {
          setStatus('اختر مدينة من تبويب «مدينة» (مثلاً درنة) ثم عد لتبويب «حي».', true);
        } else if (level === 'street' && !parentId) {
          setStatus('اختر حيّاً من تبويب «حي» ثم عد لتبويب «شارع».', true);
        } else if (parentId && (level === 'region' || level === 'city' || level === 'area' || level === 'street')) {
          setStatus('لا توجد كيانات تحت الأب المحدد — اختر أباً آخر أو انتقل لمستوى أعلى.', true);
        } else {
          setStatus('لا توجد كيانات في قاعدة البيانات لهذا المستوى.', true);
        }
      } else if (!state.entityId) {
        setStatus('اختر من القائمة أو انقر على الخريطة.', false);
      }
    }).catch(function (err) {
      if (seq !== listSeq || level !== state.level) { return; }
      fillSelect(entitySel, [], entityPlaceholder());
      setStatus('تعذّر تحميل القائمة — حدّث الصفحة.', true);
      reportEditorError(err, 'تعذّر تحميل القائمة');
    }).finally(function () {
      if (seq !== listSeq || level !== state.level || !entitySel) { return; }
      var stillLoading = entitySel.options.length === 1
        && entitySel.options[0].value === ''
        && entitySel.options[0].textContent === 'جارٍ التحميل…';
      if (stillLoading) {
        fillSelect(entitySel, [], entityPlaceholder());
      }
    });
  }

  function drawSiblingsLayer(parentId) {
    state.siblingsLayer.clearLayers();
    if (state.level === 'state' && !state.entityId) {
      clearContextLabelPins();
      return Promise.resolve(null);
    }
    if (state.entityId && LABEL_POSITION_LEVELS[state.level]) {
      clearContextLabelPins();
    }
    var seq = ++siblingsSeq;
    var url = apiUrl('boundary_list', boundaryScopeParams(state.level, parentId));
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { features: [] }; })
      .then(function (fc) {
        if (seq !== siblingsSeq) { return fc; }
        var feats = (fc && fc.features) || [];
        feats.forEach(function (f) {
          var p = f.properties || {};
          if (shouldSkipGridFeature(state.level, p)) { return; }
          if (state.entityId && Number(p.entity_id) === Number(state.entityId)) { return; }
          addGeoFeatureToGroup(f, state.level, state.siblingsLayer, 0);
          if (state.entityId) { installContextLabelPin(f, state.level); }
        });
        return fc;
      })
      .catch(function () { return null; });
  }

  function bootEditor() {
    syncDeleteButton();
    syncAddChildUi();
    setStatus('جارٍ تحميل التقسيمات…', false);
    loadOverview().then(function () {
      return refreshEntityList();
    }).then(function () {
      var n = state.overviewLayer.getLayers().length;
      if (n > 0) {
        setStatus('الولايات والشعبيات على الخريطة — انقر شعبية للتعمّق أو اختر ولاية من القائمة.', false);
      } else if (!entitySel || entitySel.options.length <= 1) {
        setStatus('تعذّر تحميل التقسيمات — تحقق من تسجيل الدخول أو حدّث الصفحة.', true);
      }
    }).catch(function (err) {
      reportEditorError(err, 'فشل تحميل المحرر');
    });
  }

  bootEditor();

  /* ============================================================
   *  Tab switching
   * ============================================================ */
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var nextLevel = tab.dataset.level;
      var prevLevel = state.level;
      var prevEntityId = state.entityId;
      var prevEntityName = state.entityName;
      activateTab(nextLevel);
      resetEntitySelectLoading();
      var cv = state.childView;
      var parentId = resolveTabParentId(nextLevel, prevLevel, prevEntityId, prevEntityName, cv);

      if (nextLevel === 'state') {
        parentId = null;
        setParentContext(null, 0, '');
      }

      state.drillParentId = parentId;
      if (nextLevel === 'area' && parentId) {
        var cityName = prevLevel === 'city' ? prevEntityName : (state.parentContext && state.parentContext.name) || '';
        setParentContext('city', parentId, cityName);
      } else if (nextLevel === 'street' && parentId) {
        var areaName = prevLevel === 'area' ? prevEntityName : (state.parentContext && state.parentContext.name) || '';
        setParentContext('area', parentId, areaName);
      }
      if (!state.drillParentId) {
        state.pickLayer.clearLayers();
      }
      removeCurrentLayer();
      setEntityProps(null);
      state.entityId = 0;
      setStatus('جارٍ تحميل الكيانات…', false);
      refreshEntityList().then(function () {
        if (!state.drillParentId) {
          syncAddChildUi();
          return;
        }
        return loadPickLayer(nextLevel, state.drillParentId).then(function () {
          if (nextLevel === 'city' || nextLevel === 'area' || nextLevel === 'street') {
            return drawSiblingsLayer(state.drillParentId).then(function (fc) {
              if (fc) { flyToFeatureCollection(fc, nextLevel); }
            });
          }
        }).then(function () {
          syncAddChildUi();
        });
      });
    });
  });

  /* ============================================================
   *  Entity pick → load (or prepare to draw) its boundary
   * ============================================================ */
  if (entitySel) {
  entitySel.addEventListener('change', function () {
    var op = entitySel.options[entitySel.selectedIndex];
    if (op && op.dataset.level && op.dataset.level !== state.level) { return; }
    var id = parseInt(entitySel.value, 10);
    if (!id) {
      cancelChildSelection();
      return;
    }
    if (applyParentFromOption(op)) {
      loadPickLayer(state.level, state.drillParentId);
    }
    state.addNewMode = false;
    state.entityId = id;
    state.entityName = op
      ? op.textContent.replace(/^[●\s]+/, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
      : '';
    setEntityProps({
      name: state.entityName,
      code: op ? (op.dataset.code || '') : '',
      color: defaultColorForProps({
        province: op ? (op.dataset.code || '').charAt(0) : '',
        code: op ? (op.dataset.code || '') : '',
        color: op && op.dataset.color ? op.dataset.color : ''
      })
    });
    syncDeleteButton();
    syncAddChildUi();
    updateSaveButton();
    var level = state.level;
    var parentId = state.drillParentId;
    loadCurrentBoundary().then(function (hadBoundary) {
      if (hadBoundary && state.currentLayer) {
        flyToLayer(state.currentLayer, level);
        return;
      }
      return drawSiblingsLayer(parentId).then(function (fc) {
        var match = (fc && fc.features || []).find(function (f) {
          var p = f.properties || {};
          if (Number(p.entity_id) !== Number(id)) { return false; }
          return !shouldSkipGridFeature(level, p);
        });
        if (match) {
          applyLoadedBoundaryFeature(match, false);
          return;
        }
        if (fc && fc.features && fc.features.length) {
          flyToFeatureCollection(fc, level);
          return;
        }
        return zoomToEntityLocation(level, id);
      });
    });
  });
  }

  function loadCurrentBoundary() {
    var level = state.level;
    var entityId = state.entityId;
    var seq = ++boundarySeq;
    var getUrl = apiUrl('boundary_get', { level: level, entity_id: entityId });

    function finishFromList(fc) {
      if (seq !== boundarySeq || level !== state.level || entityId !== state.entityId) {
        return false;
      }
      var match = (fc.features || []).find(function (f) {
        var p = f.properties || {};
        if (Number(p.entity_id) !== Number(state.entityId)) { return false; }
        return !shouldSkipGridFeature(level, p);
      });
      if (!match) {
        var dismissed = isGridDismissed(level, entityId);
        setStatus(
          dismissed
            ? 'الشبكة محذوفة — ارسم مضلعاً جديداً ثم احفظ، أو اضغط «إعادة الشبكة».'
            : 'لا توجد حدود محفوظة — ارسم مضلعاً جديداً ثم احفظ.',
          false
        );
        updateSaveButton();
        syncDeleteButton();
        drawSiblingsLayer(state.drillParentId);
        if (state.drillParentId) {
          loadPickLayer(state.level, state.drillParentId);
        }
        return false;
      }
      applyLoadedBoundaryFeature(match, false);
      return true;
    }

    return fetch(getUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (data) {
        if (seq !== boundarySeq || level !== state.level || entityId !== state.entityId) {
          return false;
        }
        removeCurrentLayer();
        if (data && data.ok && data.feature) {
          applyLoadedBoundaryFeature(data.feature, data.source === 'database');
          return true;
        }
        var listUrl = apiUrl('boundary_list', boundaryScopeParams(level, state.drillParentId));
        return fetch(listUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
          .then(function (r) { return r.ok ? r.json() : { features: [] }; })
          .then(finishFromList);
      })
      .catch(function () {
        setStatus('تعذّر تحميل الحدود.', true);
        return false;
      });
  }

  function applyLoadedBoundaryFeature(match, fromDatabase) {
    if (match.properties) {
      if (match.properties.code && codeIn) { codeIn.value = String(match.properties.code); }
    }
    if (colorIn) {
      colorIn.value = defaultColorForProps(match.properties || {});
    }
    installCurrentLayer(match);
    updateSaveButton();
    syncDeleteButton();
    var srcHint = fromDatabase ? ' (من قاعدة البيانات)' : '';
    setStatus('محمّل: ' + state.entityName + srcHint + ' — يمكنك التحرير الآن.', false);
    drawSiblingsLayer(state.drillParentId);
  }

  function installCurrentLayer(feature) {
    if (state.currentLayer) {
      try { state.currentLayer.pm.disable(); } catch (eRm) {}
      try { map.removeLayer(state.currentLayer); } catch (eRm2) {}
      state.currentLayer = null;
    }
    var props = feature.properties || {};
    var isGrid = !!props.is_grid;
    state.currentIsGrid = isGrid;
    var color = defaultColorForProps(props);
    if (colorIn) { colorIn.value = color; }
    var lyr = L.geoJSON(feature, {
      style: {
        color: color,
        weight: 2.5,
        opacity: 1,
        fillOpacity: isGrid ? 0.24 : 0.2,
        fillColor: color,
        dashArray: isGrid ? '6,4' : null
      }
    });
    var first = null;
    lyr.eachLayer(function (l) { if (!first) { first = l; } });
    if (!first) { return; }
    first.pm.enable({ allowSelfIntersection: false });
    first.addTo(map);
    state.currentLayer = first;
    state.geometryDirty = false;
    flyToLayer(first, state.level);
    first.on('pm:edit pm:cut pm:rotateend pm:dragend', function () {
      state.geometryDirty = true;
      refreshStats();
    });
    refreshStats();
    if (isGrid) {
      setStatus('شبكة مبدئية لـ "' + state.entityName + '" — عدّل المضلع ثم احفظ، أو احذف الشبكة لرسم جديد.', false);
    }
    syncLabelMarkerFromFeature(feature);
    syncActionButtons();
    updateSaveButton();
  }

  function removeCurrentLayer() {
    if (state.currentLayer) {
      try { state.currentLayer.pm.disable(); } catch (e) {}
      try { map.removeLayer(state.currentLayer); } catch (e) {}
      state.currentLayer = null;
    }
    removeLabelMarker();
    clearContextLabelPins();
    state.labelDirty = false;
    state.currentIsGrid = false;
    state.geometryDirty = false;
    refreshStats();
    syncActionButtons();
    updateSaveButton();
  }

  map.on('zoomend moveend', function () {
    if (state.labelMarker && state.labelMarker.bringToFront) {
      state.labelMarker.bringToFront();
    }
  });

  /* New polygons drawn by Geoman become the current layer if no current layer exists. */
  map.on('pm:create', function (e) {
    if (state.currentLayer && state.currentLayer !== e.layer) {
      try { map.removeLayer(state.currentLayer); } catch (er) {}
    }
    state.currentLayer = e.layer;
    state.currentIsGrid = false;
    state.geometryDirty = true;
    var color = colorIn.value || '#0ea5e9';
    if (e.layer.setStyle) {
      e.layer.setStyle({ color: color, fillColor: color, fillOpacity: 0.2, weight: 2.5 });
    }
    e.layer.pm.enable({ allowSelfIntersection: false });
    e.layer.on('pm:edit pm:cut pm:rotateend', refreshStats);
    refreshStats();
    if (labelPositionSupported()) {
      var pos = boundaryLayerCenter(e.layer);
      if (pos) {
        installLabelMarker(pos.lat, pos.lng, (nameIn && nameIn.value) || state.entityName);
        state.labelDirty = true;
      }
    }
    updateSaveButton();
    syncActionButtons();
    if (canCreateOnSave()) {
      setStatus('تم رسم المضلع — اضغط «حفظ» لإنشاء «' + (nameIn.value || '').trim() + '» وحفظ الحدود.', false);
    } else if (!state.entityId) {
      setStatus('أدخل الاسم واختر الكيان الأب، أو اختر كياناً من القائمة لربط الرسم.', true);
    } else {
      setStatus('تم رسم مضلع — اضغط حفظ لربطه بـ "' + state.entityName + '".', false);
    }
  });

  /* ============================================================
   *  Right panel: name / code / color
   * ============================================================ */
  function setEntityProps(props) {
    if (!props) {
      var allowNew = !!ADD_CHILD_LEVELS[state.level] && !!state.addNewMode;
      nameIn.value = '';
      nameIn.disabled = !allowNew;
      codeIn.value = '';
      codeIn.disabled = !allowNew;
      colorIn.disabled = !allowNew;
      updateSaveButton();
      syncDeleteButton();
      syncAddChildUi();
      state.entityId = 0;
      state.entityName = '';
      if (entitySel) { entitySel.value = ''; }
      removeLabelMarker();
      state.labelDirty = false;
      syncLabelUi();
      return;
    }
    nameIn.value = props.name || '';
    nameIn.disabled = false;
    codeIn.value = props.code || '';
    codeIn.disabled = false;
    colorIn.disabled = false;
    colorIn.value = defaultColorForProps(props);
    updateSaveButton();
  }

  function postBoundarySave(geom) {
    var metaOnly = (state.level === 'state' || state.level === 'region') && !state.geometryDirty;
    var fd = new FormData();
    fd.append('csrf_token', csrf);
    fd.append('level', state.level);
    fd.append('entity_id', String(state.entityId));
    fd.append('geojson', metaOnly ? '' : (geom ? JSON.stringify(geom) : ''));
    fd.append('name', nameIn.value || '');
    fd.append('code', codeIn.value || '');
    fd.append('color', colorIn.value || '');
    appendLabelCoordsToForm(fd);
    return fetch(apiUrl('boundary_save'), { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) {
        return parseJsonResponse(r).then(function (data) {
          if (!r.ok || !data || data.ok === false) {
            throw new Error((data && data.message) || 'فشل الحفظ.');
          }
          return data;
        });
      });
  }

  function createEntityThenSave(geom) {
    var nm = (nameIn && nameIn.value || '').trim();
    var fd = new FormData();
    fd.append('csrf_token', csrf);
    fd.append('level', state.level);
    fd.append('parent_id', String(state.drillParentId));
    fd.append('name', nm);
    fd.append('code', codeIn ? (codeIn.value || '') : '');
    return fetch(apiUrl('boundary_entity_create'), { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) {
        return parseJsonResponse(r).then(function (data) {
          if (!r.ok || !data || data.ok === false) {
            throw new Error((data && data.message) || 'فشل إنشاء الكيان.');
          }
          state.entityId = Number(data.id);
          state.entityName = nm;
          return postBoundarySave(geom);
        });
      });
  }

  function afterBoundarySaved(data) {
    setStatus((data && data.message) || 'حُفِظَ.', false);
    if (data && data.colors && window.ProvinceColors) {
      window.ProvinceColors.setColors(data.colors, false);
      syncProvinceColorsFromGlobal();
    }
    state.addNewMode = false;
    state.currentIsGrid = false;
    state.geometryDirty = false;
    state.labelDirty = false;
    undismissGrid(state.level, state.entityId);
    syncDeleteButton();
    loadOverview();
    loadCurrentBoundary();
    refreshEntityList().then(function () {
      if (state.entityId && entitySel) { entitySel.value = String(state.entityId); }
    });
    updateSaveButton();
  }

  if (colorIn) {
  colorIn.addEventListener('input', function () {
    if (state.currentLayer && state.currentLayer.setStyle) {
      state.currentLayer.setStyle({ color: colorIn.value, fillColor: colorIn.value });
    }
    updateSaveButton();
  });
  }

  if (nameIn) {
    nameIn.addEventListener('input', function () {
      refreshLabelMarkerText();
      updateSaveButton();
      syncAddChildUi();
      if (canCreateOnSave()) {
        setStatus('اضغط «حفظ» لإنشاء «' + (nameIn.value || '').trim() + '» وحفظ الحدود.', false);
      }
    });
  }

  if (labelResetBtn) {
    labelResetBtn.addEventListener('click', function () {
      centerLabelOnBoundary();
    });
  }

  if (saveBtn) {
  saveBtn.addEventListener('click', function () {
    if (!canSave()) {
      if (!state.entityId) {
        setStatus('اختر كياناً من القائمة أولاً.', true);
      } else if (!state.currentLayer && state.level !== 'state' && state.level !== 'region') {
        setStatus('ارسم مضلعاً على الخريطة قبل الحفظ.', true);
      } else {
        setStatus('اختر كياناً قبل الحفظ.', true);
      }
      return;
    }
    var geom = null;
    if (state.currentLayer) {
      var gj = state.currentLayer.toGeoJSON();
      geom = (gj && gj.geometry) ? gj.geometry : null;
    }
    if (!geom && state.level !== 'state' && state.level !== 'region') {
      setStatus('لا توجد هندسة صالحة للحفظ.', true);
      return;
    }

    saveBtn.disabled = true;
    var metaOnly = (state.level === 'state' || state.level === 'region') && !state.geometryDirty;
    setStatus(
      metaOnly
        ? 'جارٍ حفظ اللون…'
        : (state.entityId ? 'جارٍ الحفظ…' : 'جارٍ إنشاء الكيان وحفظ الحدود…'),
      false
    );
    var savePromise = state.entityId
      ? postBoundarySave(geom)
      : createEntityThenSave(geom);
    savePromise
      .then(function (data) {
        afterBoundarySaved(data);
      })
      .catch(function (err) {
        setStatus((err && err.message) || 'فشل الحفظ.', true);
        updateSaveButton();
      });
  });
  }

  if (deleteBtn) {
  deleteBtn.addEventListener('click', function () {
    if (!state.entityId || PROTECTED_LEVELS[state.level]) { return; }

    if (state.currentIsGrid) {
      if (!window.confirm('حذف الشبكة المبدئية؟ يمكنك رسم حدود جديدة ثم الحفظ، أو إعادة توليد الشبكة لاحقاً.')) {
        return;
      }
      dismissGrid(state.level, state.entityId);
      removeCurrentLayer();
      updateSaveButton();
      drawSiblingsLayer(state.drillParentId);
      if (state.drillParentId) {
        loadPickLayer(state.level, state.drillParentId);
      }
      setStatus('تم حذف الشبكة — ارسم مضلعاً جديداً ثم احفظ، أو اضغط «إعادة الشبكة».', false);
      syncActionButtons();
      return;
    }

    if (!state.currentLayer) { return; }
    if (!window.confirm('تأكيد حذف الحدود المحفوظة لهذا الكيان؟')) { return; }
    var fd = new FormData();
    fd.append('csrf_token', csrf);
    fd.append('level', state.level);
    fd.append('entity_id', String(state.entityId));
    fetch(apiUrl('boundary_delete'), { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          undismissGrid(state.level, state.entityId);
          setStatus('حُذِفت الحدود — يمكن إعادة الشبكة أو رسم حدود جديدة.', false);
          removeCurrentLayer();
          updateSaveButton();
          refreshEntityList().then(function () {
            if (state.entityId && entitySel) { entitySel.value = String(state.entityId); }
            return drawSiblingsLayer(state.drillParentId);
          }).then(function () {
            syncActionButtons();
          });
        } else {
          setStatus((data && data.message) || 'فشل الحذف.', true);
        }
      });
  });
  }

  if (regenGridBtn) {
    regenGridBtn.addEventListener('click', function () {
      if (!state.entityId || !GRID_LEVELS[state.level]) { return; }
      undismissGrid(state.level, state.entityId);
      setStatus('جارٍ إعادة توليد الشبكة…', false);
      loadCurrentBoundary().then(function (hadBoundary) {
        if (hadBoundary) {
          setStatus('أُعيدت الشبكة المبدئية لـ "' + state.entityName + '" — عدّلها ثم احفظ.', false);
        } else {
          setStatus('تعذّر توليد شبكة لهذا الكيان.', true);
        }
        syncActionButtons();
      });
    });
  }

  if (addChildBtn) {
    addChildBtn.addEventListener('click', function () {
      prepareNewChild();
    });
  }
  if (addChildCancel) {
    addChildCancel.addEventListener('click', function () {
      cancelChildSelection();
    });
  }

  map.on('click', function (e) {
    if (!state.placeMode) { return; }
    if (L.DomEvent) { L.DomEvent.stopPropagation(e); }
    submitPlaceMode(e.latlng.lat, e.latlng.lng);
  });

  } catch (bootErr) {
    reportEditorError(bootErr, 'تعذّر تشغيل المحرر');
  }
})();
