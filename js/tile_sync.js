/**
 * Tile sync admin UI:
 *   - Draggable selection rectangle on a Leaflet map.
 *   - Live estimate of tile count (haversine formula on tile pyramid).
 *   - POSTs to ?r=tile_sync_run and refreshes stats/logs from ?r=tile_sync_status.
 */
(function () {
  'use strict';
  var mapEl = document.getElementById('ts-map');
  if (!mapEl || typeof L === 'undefined') { return; }

  var swLat = parseFloat(mapEl.dataset.swLat);
  var swLng = parseFloat(mapEl.dataset.swLng);
  var neLat = parseFloat(mapEl.dataset.neLat);
  var neLng = parseFloat(mapEl.dataset.neLng);

  var map = L.map('ts-map').fitBounds([[swLat, swLng], [neLat, neLng]]);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);

  var northIn = document.getElementById('ts-north');
  var southIn = document.getElementById('ts-south');
  var eastIn  = document.getElementById('ts-east');
  var westIn  = document.getElementById('ts-west');
  var zminIn  = document.getElementById('ts-zmin');
  var zmaxIn  = document.getElementById('ts-zmax');
  var estEl   = document.getElementById('ts-estimate');
  var statusEl = document.getElementById('ts-status');
  var form = document.getElementById('ts-form');
  var cancelBtn = document.getElementById('ts-cancel');

  var rect = null;

  function readBbox() {
    return {
      south: parseFloat(southIn.value),
      north: parseFloat(northIn.value),
      west:  parseFloat(westIn.value),
      east:  parseFloat(eastIn.value)
    };
  }

  function drawRect() {
    var b = readBbox();
    if ([b.south, b.north, b.west, b.east].some(function (v) { return isNaN(v); })) { return; }
    if (rect) { map.removeLayer(rect); }
    rect = L.rectangle([[b.south, b.west], [b.north, b.east]], {
      color: '#0ea5e9', weight: 2, fillOpacity: 0.12
    }).addTo(map);
    updateEstimate();
  }

  function tileCount(zmin, zmax, south, west, north, east) {
    var total = 0;
    for (var z = zmin; z <= zmax; z++) {
      var n = Math.pow(2, z);
      var xMin = Math.floor((west + 180) / 360 * n);
      var xMax = Math.floor((east + 180) / 360 * n);
      var latNorthRad = north * Math.PI / 180;
      var latSouthRad = south * Math.PI / 180;
      var yMin = Math.floor((1 - Math.log(Math.tan(latNorthRad) + 1 / Math.cos(latNorthRad)) / Math.PI) / 2 * n);
      var yMax = Math.floor((1 - Math.log(Math.tan(latSouthRad) + 1 / Math.cos(latSouthRad)) / Math.PI) / 2 * n);
      total += (Math.max(0, xMax - xMin + 1)) * (Math.max(0, yMax - yMin + 1));
    }
    return total;
  }

  function updateEstimate() {
    var b = readBbox();
    var zmin = parseInt(zminIn.value, 10);
    var zmax = parseInt(zmaxIn.value, 10);
    if (isNaN(zmin) || isNaN(zmax) || zmax < zmin) { estEl.textContent = 'عدد البلاطات: —'; return; }
    var c = tileCount(zmin, zmax, b.south, b.west, b.north, b.east);
    estEl.textContent = 'عدد البلاطات المتوقع: ' + c.toLocaleString('ar-EG');
    estEl.classList.toggle('is-over', c > 1500);
  }

  ['input', 'change'].forEach(function (ev) {
    [northIn, southIn, eastIn, westIn, zminIn, zmaxIn].forEach(function (e) { e.addEventListener(ev, drawRect); });
  });
  drawRect();

  /* Click-drag a new rectangle on the map. */
  var drawStart = null;
  var dragRect = null;
  map.on('mousedown', function (e) {
    if (!e.originalEvent.shiftKey) { return; }
    drawStart = e.latlng;
    map.dragging.disable();
  });
  map.on('mousemove', function (e) {
    if (!drawStart) { return; }
    if (dragRect) { map.removeLayer(dragRect); }
    dragRect = L.rectangle([drawStart, e.latlng], { color: '#22d3ee', weight: 1, dashArray: '5,4', fillOpacity: 0.06 }).addTo(map);
  });
  map.on('mouseup', function (e) {
    if (!drawStart) { return; }
    var a = drawStart;
    var b = e.latlng;
    drawStart = null;
    if (dragRect) { map.removeLayer(dragRect); dragRect = null; }
    map.dragging.enable();
    var s = Math.min(a.lat, b.lat);
    var n = Math.max(a.lat, b.lat);
    var w = Math.min(a.lng, b.lng);
    var ee = Math.max(a.lng, b.lng);
    southIn.value = s.toFixed(6);
    northIn.value = n.toFixed(6);
    westIn.value = w.toFixed(6);
    eastIn.value = ee.toFixed(6);
    drawRect();
  });

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || '';
    statusEl.className = 'tile-sync__status' + (isErr ? ' is-err' : '');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    setStatus('جارٍ التحميل… قد تستغرق العملية حتى دقيقتين.', false);
    fetch('index.php?r=tile_sync_run', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          setStatus('انتهت العملية: ' + data.tiles_downloaded + ' حُمّلت، ' +
            (data.tiles_skipped || 0) + ' متاحة مسبقاً، ' + (data.tiles_failed || 0) + ' فشل.', false);
        } else {
          setStatus((data && data.message) || 'فشل التحميل.', true);
        }
        refreshStats();
      })
      .catch(function () { setStatus('فشل الاتصال بالخادم.', true); });
  });

  cancelBtn.addEventListener('click', function () {
    var fd = new FormData();
    fd.append('csrf_token', form.querySelector('input[name="csrf_token"]').value);
    fetch('index.php?r=tile_sync_cancel', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function () { setStatus('طُلبت الإلغاء.', false); });
  });

  function refreshStats() {
    fetch('index.php?r=tile_sync_status', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) { return; }
        var t = document.getElementById('ts-stat-total');
        var s = document.getElementById('ts-stat-size');
        var z = document.getElementById('ts-stat-zooms');
        if (t) { t.textContent = Number(data.stats.tiles).toLocaleString('ar-EG'); }
        if (s) { s.textContent = (data.stats.size_bytes / 1024).toFixed(1) + ' KB'; }
        if (z) {
          var keys = Object.keys(data.stats.zooms || {});
          z.textContent = keys.length ? keys.map(function (k) { return 'z' + k + '=' + data.stats.zooms[k]; }).join(', ') : '—';
        }
        var tb = document.getElementById('ts-logs-body');
        if (tb) {
          tb.innerHTML = '';
          (data.logs || []).forEach(function (log) {
            var tr = document.createElement('tr');
            tr.innerHTML =
              '<td class="mono">' + log.id + '</td>' +
              '<td>' + log.status + '</td>' +
              '<td class="mono">' + log.zmin + '–' + log.zmax + '</td>' +
              '<td class="mono">' + log.tiles_requested + '</td>' +
              '<td class="mono">' + log.tiles_downloaded + '</td>' +
              '<td class="mono">' + log.tiles_failed + '</td>' +
              '<td>' + log.source + '</td>' +
              '<td class="mono">' + log.started_at + '</td>' +
              '<td class="mono">' + (log.finished_at || '—') + '</td>';
            tb.appendChild(tr);
          });
        }
      });
  }
})();
