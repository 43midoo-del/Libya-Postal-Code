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

  var map = L.map('be-map', {
    maxBounds: bounds,
    maxBoundsViscosity: 0.85,
    minZoom: minZ,
    maxZoom: maxZ
  });

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
  osm.addTo(map);
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

  var tabs = document.querySelectorAll('.be-tab');

  var PROVINCE_COLORS = { B: '#fcd34d', T: '#86efac', F: '#fda4af' };
  var PROTECTED_LEVELS = { state: true, region: true };
  var GRID_LEVELS = { city: true, area: true };
  var ADD_CHILD_LEVELS = { area: true, street: true };
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
    childView: { level: null, parentId: null },
    currentLayer: null,
    currentIsGrid: false,
    overviewLayer: L.layerGroup().addTo(map),
    pickLayer: L.layerGroup().addTo(map),
    siblingsLayer: L.layerGroup().addTo(map)
  };

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

  function provinceColor(prov) {
    return PROVINCE_COLORS[String(prov || '').toUpperCase()] || '#94a3b8';
  }

  function activateTab(level) {
    tabs.forEach(function (t) {
      t.classList.toggle('is-active', t.dataset.level === level);
    });
    state.level = level;
    updateEntityUi();
    syncDeleteButton();
    updateOverviewVisibility();
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
      cancelPlaceMode(false);
      return;
    }
    var parentLabel = level === 'area' ? 'المدينة' : 'الحي';
    var childLabel = level === 'area' ? 'حي' : 'شارع';
    if (addChildBtn) {
      addChildBtn.textContent = '+ إضافة ' + childLabel;
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
      addChildCancel.hidden = !state.placeMode;
    }
    if (show && (state.placeMode || !state.entityId)) {
      if (nameIn) { nameIn.disabled = false; }
      if (codeIn) { codeIn.disabled = false; }
      if (colorIn) { colorIn.disabled = false; }
    }
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
    fetch('index.php?r=boundary_entity_add_grid', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) {
          setStatus((data && data.message) || 'فشل الإضافة.', true);
          return;
        }
        state.entityId = Number(data.id);
        state.entityName = pm.name;
        state.currentIsGrid = false;
        if (nameIn) { nameIn.value = pm.name; }
        if (codeIn && pm.code) { codeIn.value = pm.code; }
        syncDeleteButton();
        refreshEntityList().then(function () {
          if (entitySel) { entitySel.value = String(data.id); }
          if (data.feature) {
            removeCurrentLayer();
            installCurrentLayer(data.feature);
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

  /** Hide country/shabiya overview when editing cities/areas inside a parent. */
  function updateOverviewVisibility() {
    var deep = (state.level === 'city' || state.level === 'area' || state.level === 'street')
      && !!state.drillParentId;
    if (deep) {
      if (map.hasLayer(state.overviewLayer)) {
        map.removeLayer(state.overviewLayer);
      }
    } else if (!map.hasLayer(state.overviewLayer)) {
      map.addLayer(state.overviewLayer);
    }
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

  function selectEntity(level, entityId, props, layer, fromDropdown) {
    activateTab(level);
    state.entityId = entityId;
    state.entityName = props && props.name ? String(props.name) : '';
    if (entitySel) {
      entitySel.value = String(entityId);
    }
    setEntityProps({
      name: state.entityName,
      code: props && props.code ? String(props.code) : '',
      color: (props && props.color) || colorIn.value || '#0ea5e9'
    });
    syncDeleteButton();
    loadCurrentBoundary();
    if (!fromDropdown && layer) {
      flyToLayer(layer);
    }
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
    updateOverviewVisibility();
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
      selectEntity('city', entityId, props, layer, false);
      revealChildren('area', entityId, layer);
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
        if (!map.hasLayer(state.overviewLayer)) {
          map.addLayer(state.overviewLayer);
        }

        if (data.states && data.states.features) {
          L.geoJSON(data.states, {
            style: function (f) {
              var p = (f.properties && f.properties.province) || '';
              var c = provinceColor(p);
              return {
                color: c,
                weight: 3,
                opacity: 0.85,
                fillColor: c,
                fillOpacity: 0.06,
                dashArray: '6,4',
                interactive: true
              };
            },
            onEachFeature: function (f, layer) {
              var p = f.properties || {};
              layer.bindTooltip((p.code || '') + ' — ' + (p.name || ''), { sticky: true, direction: 'center', className: 'shabiya-tooltip' });
              layer.on('click', function (ev) {
                if (L.DomEvent) { L.DomEvent.stopPropagation(ev); }
                selectEntity('state', Number(p.entity_id), p, layer, false);
              });
            }
          }).addTo(state.overviewLayer);
        }

        if (data.regions && data.regions.features) {
          L.geoJSON(data.regions, {
            style: function (f) {
              var p = (f.properties && f.properties.province) || '';
              var c = provinceColor(p);
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
              var tip = (p.code ? p.code + ' — ' : '') + (p.name || '');
              layer.bindTooltip(tip, { sticky: true, direction: 'top', className: 'shabiya-tooltip' });
              layer.on('click', function (ev) {
                if (L.DomEvent) { L.DomEvent.stopPropagation(ev); }
                onMapFeatureClick(p, layer);
              });
            }
          }).addTo(state.overviewLayer);
        }
      });
  }

  function loadPickLayer(level, parentId) {
    state.pickLayer.clearLayers();
    if (!parentId) { return Promise.resolve(); }
    var seq = ++pickSeq;
    var url = apiUrl('boundary_list', { level: level, parent_id: parentId });
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { features: [] }; })
      .then(function (fc) {
        if (seq !== pickSeq) { return; }
        var feats = (fc && fc.features) || [];
        feats.forEach(function (f) {
          var p = f.properties || {};
          if (shouldSkipGridFeature(level, p)) { return; }
          if (state.entityId && Number(p.entity_id) === Number(state.entityId)) { return; }
          addGeoFeatureToGroup(f, level, state.pickLayer, 0);
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
      op.dataset.has = r.has_boundary ? '1' : '0';
      op.dataset.level = state.level;
      if (r.parent_id) { op.dataset.parentId = String(r.parent_id); }
      selectEl.appendChild(op);
    });
    selectEl.disabled = rows.length === 0;
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
      cm.on('click', function (ev) {
        if (L.DomEvent) { L.DomEvent.stopPropagation(ev); }
        onMapFeatureClick(Object.assign({ level: level }, p), cm);
      });
      cm.addTo(group);
      return;
    }
    var lyr = L.geoJSON(f, {
      style: featureStyle(p, level, selectedId && Number(p.entity_id) === Number(selectedId))
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
      if (entitySel) { entitySel.disabled = rows.length === 0; }
      drawSiblingsLayer(parentId);
      syncDeleteButton();
      if (rows.length === 0 && !(resp && resp.ok === false && resp.message)) {
        if (parentId && (level === 'region' || level === 'city' || level === 'area' || level === 'street')) {
          setStatus('لا توجد كيانات تحت الأب المحدد — اختر أباً آخر أو انتقل لمستوى أعلى.', true);
        } else {
          setStatus('لا توجد كيانات في قاعدة البيانات لهذا المستوى.', true);
        }
      } else if (!state.entityId) {
        setStatus('اختر من القائمة أو انقر على الخريطة.', false);
      }
    });
  }

  function drawSiblingsLayer(parentId) {
    state.siblingsLayer.clearLayers();
    if (state.level === 'state' && !state.entityId) {
      return Promise.resolve(null);
    }
    var seq = ++siblingsSeq;
    var url = apiUrl('boundary_list', {
      level: state.level,
      parent_id: parentId || ''
    });
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
      var cv = state.childView;
      var parentId = null;

      if (cv && cv.level === nextLevel && cv.parentId) {
        parentId = cv.parentId;
      } else if (nextLevel === 'region' && prevLevel === 'state' && prevEntityId) {
        parentId = prevEntityId;
        setParentContext('state', prevEntityId, prevEntityName);
      } else if (nextLevel === 'city' && prevLevel === 'region' && prevEntityId) {
        parentId = prevEntityId;
        setParentContext('region', prevEntityId, prevEntityName);
      } else if (nextLevel === 'area' && prevLevel === 'city' && prevEntityId) {
        parentId = prevEntityId;
        setParentContext('city', prevEntityId, prevEntityName);
      } else if (nextLevel === 'street' && prevLevel === 'area' && prevEntityId) {
        parentId = prevEntityId;
        setParentContext('area', prevEntityId, prevEntityName);
      } else if (nextLevel !== 'state') {
        parentId = null;
      }

      if (nextLevel === 'state') {
        parentId = null;
        setParentContext(null, 0, '');
      }

      state.drillParentId = parentId;
      if (!state.drillParentId) {
        state.pickLayer.clearLayers();
      } else {
        loadPickLayer(nextLevel, state.drillParentId);
      }
      removeCurrentLayer();
      setEntityProps(null);
      state.entityId = 0;
      setStatus('جارٍ تحميل الكيانات…', false);
      refreshEntityList().then(function () {
        if (state.drillParentId && (nextLevel === 'city' || nextLevel === 'area' || nextLevel === 'street')) {
          return drawSiblingsLayer(state.drillParentId).then(function (fc) {
            if (fc) { flyToFeatureCollection(fc, nextLevel); }
          });
        }
        syncAddChildUi();
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
      setEntityProps(null);
      removeCurrentLayer();
      setStatus('اختر كياناً من القائمة لعرض حدوده وتحريرها.', false);
      return;
    }
    if (applyParentFromOption(op)) {
      loadPickLayer(state.level, state.drillParentId);
    }
    state.entityId = id;
    state.entityName = op
      ? op.textContent.replace(/^[●\s]+/, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
      : '';
    setEntityProps({
      name: state.entityName,
      code: op ? (op.dataset.code || '') : '',
      color: '#0ea5e9'
    });
    syncDeleteButton();
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
          installCurrentLayer(match);
          return;
        }
        if (fc && fc.features && fc.features.length) {
          flyToFeatureCollection(fc, level);
          return;
        }
        return zoomToEntityLocation(level, id);
      });
    });
    var childLevel = DRILL_CHILD[state.level];
    if (childLevel && id) {
      revealChildren(childLevel, id, null);
    }
  });
  }

  function loadCurrentBoundary() {
    var level = state.level;
    var entityId = state.entityId;
    var seq = ++boundarySeq;
    var listUrl = apiUrl('boundary_list', {
      level: level,
      parent_id: state.drillParentId || ''
    });
    return fetch(listUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { features: [] }; })
      .then(function (fc) {
        if (seq !== boundarySeq || level !== state.level || entityId !== state.entityId) {
          return false;
        }
        removeCurrentLayer();
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
          saveBtn.disabled = false;
          syncDeleteButton();
          drawSiblingsLayer(state.drillParentId);
          if (state.drillParentId) {
            loadPickLayer(state.level, state.drillParentId);
          }
          return false;
        }
        if (match.properties) {
          if (match.properties.code && codeIn) { codeIn.value = String(match.properties.code); }
          if (match.properties.color && colorIn) { colorIn.value = String(match.properties.color); }
        }
        installCurrentLayer(match);
        saveBtn.disabled = false;
        syncDeleteButton();
        setStatus('محمّل: ' + state.entityName + ' — يمكنك التحرير الآن.', false);
        drawSiblingsLayer(state.drillParentId);
        return true;
      })
      .catch(function () {
        setStatus('تعذّر تحميل الحدود.', true);
        return false;
      });
  }

  function installCurrentLayer(feature) {
    var props = feature.properties || {};
    var isGrid = !!props.is_grid;
    state.currentIsGrid = isGrid;
    var color = props.color || '#0ea5e9';
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
    flyToLayer(first, state.level);
    first.on('pm:edit pm:cut pm:rotateend', refreshStats);
    refreshStats();
    if (isGrid) {
      setStatus('شبكة مبدئية لـ "' + state.entityName + '" — عدّل المضلع ثم احفظ، أو احذف الشبكة لرسم جديد.', false);
    }
    syncActionButtons();
  }

  function removeCurrentLayer() {
    if (state.currentLayer) {
      try { state.currentLayer.pm.disable(); } catch (e) {}
      try { map.removeLayer(state.currentLayer); } catch (e) {}
      state.currentLayer = null;
    }
    state.currentIsGrid = false;
    refreshStats();
    syncActionButtons();
  }

  /* New polygons drawn by Geoman become the current layer if no current layer exists. */
  map.on('pm:create', function (e) {
    if (state.currentLayer && state.currentLayer !== e.layer) {
      try { map.removeLayer(state.currentLayer); } catch (er) {}
    }
    state.currentLayer = e.layer;
    state.currentIsGrid = false;
    var color = colorIn.value || '#0ea5e9';
    if (e.layer.setStyle) {
      e.layer.setStyle({ color: color, fillColor: color, fillOpacity: 0.2, weight: 2.5 });
    }
    e.layer.pm.enable({ allowSelfIntersection: false });
    e.layer.on('pm:edit pm:cut pm:rotateend', refreshStats);
    refreshStats();
    saveBtn.disabled = !state.entityId;
    syncActionButtons();
    if (!state.entityId) {
      setStatus('اختر كياناً أو أنشئ جديداً لربط الرسم.', true);
    } else {
      setStatus('تم رسم مضلع — اضغط حفظ لربطه بـ "' + state.entityName + '".', false);
    }
  });

  /* ============================================================
   *  Right panel: name / code / color
   * ============================================================ */
  function setEntityProps(props) {
    if (!props) {
      var allowNew = !!ADD_CHILD_LEVELS[state.level];
      nameIn.value = '';
      nameIn.disabled = !allowNew;
      codeIn.value = '';
      codeIn.disabled = !allowNew;
      colorIn.disabled = !allowNew;
      saveBtn.disabled = true;
      syncDeleteButton();
      syncAddChildUi();
      state.entityId = 0;
      state.entityName = '';
      if (entitySel) { entitySel.value = ''; }
      return;
    }
    nameIn.value = props.name || '';
    nameIn.disabled = false;
    codeIn.value = props.code || '';
    codeIn.disabled = false;
    colorIn.disabled = false;
    if (props.color) { colorIn.value = props.color; }
  }

  if (colorIn) {
  colorIn.addEventListener('input', function () {
    if (state.currentLayer && state.currentLayer.setStyle) {
      state.currentLayer.setStyle({ color: colorIn.value, fillColor: colorIn.value });
    }
  });
  }

  if (saveBtn) {
  saveBtn.addEventListener('click', function () {
    if (!state.entityId || !state.currentLayer) {
      setStatus('اختر كياناً وارسم مضلعاً قبل الحفظ.', true);
      return;
    }
    var gj = state.currentLayer.toGeoJSON();
    var geom = (gj && gj.geometry) ? gj.geometry : null;
    if (!geom) { setStatus('لا توجد هندسة صالحة للحفظ.', true); return; }

    var fd = new FormData();
    fd.append('csrf_token', csrf);
    fd.append('level', state.level);
    fd.append('entity_id', String(state.entityId));
    fd.append('geojson', JSON.stringify(geom));
    fd.append('name', nameIn.value || '');
    fd.append('code', codeIn.value || '');
    fd.append('color', colorIn.value || '');

    saveBtn.disabled = true;
    setStatus('جارٍ الحفظ…', false);
    fetch('index.php?r=boundary_save', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        saveBtn.disabled = false;
        if (data && data.ok) {
          setStatus(data.message || 'حُفِظَ.', false);
          state.currentIsGrid = false;
          undismissGrid(state.level, state.entityId);
          syncDeleteButton();
          loadOverview();
          loadCurrentBoundary();
          refreshEntityList().then(function () {
            if (state.entityId && entitySel) { entitySel.value = String(state.entityId); }
          });
        } else {
          setStatus((data && data.message) || 'فشل الحفظ.', true);
        }
      })
      .catch(function () {
        saveBtn.disabled = false;
        setStatus('فشل الاتصال بالخادم.', true);
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
      saveBtn.disabled = false;
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
    fetch('index.php?r=boundary_delete', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          undismissGrid(state.level, state.entityId);
          setStatus('حُذِفت الحدود — يمكن إعادة الشبكة أو رسم حدود جديدة.', false);
          removeCurrentLayer();
          saveBtn.disabled = false;
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
      startPlaceMode();
    });
  }
  if (addChildCancel) {
    addChildCancel.addEventListener('click', function () {
      cancelPlaceMode(true);
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
