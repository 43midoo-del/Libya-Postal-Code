/**
 * Addresses list page: wilayah→shabiya filter linkage, results map, delete confirm.
 */
(function () {
  'use strict';

  function syncShabiyaOptions() {
    var w = document.getElementById('addr-wilayah');
    var s = document.getElementById('addr-shabiya');
    if (!w || !s) {
      return;
    }
    var apply = function () {
      var key = w.value;
      var current = s.value;
      var stillVisible = false;
      for (var i = 0; i < s.options.length; i++) {
        var opt = s.options[i];
        if (!opt.value) {
          opt.hidden = false;
          continue;
        }
        var owner = opt.getAttribute('data-wilayah') || '';
        var show = key === '' || owner === key;
        opt.hidden = !show;
        if (show && opt.value === current) {
          stillVisible = true;
        }
      }
      if (!stillVisible) {
        s.value = '';
      }
    };
    w.addEventListener('change', apply);
  }

  function bindDeleteConfirm() {
    var forms = document.querySelectorAll('form.js-confirm-delete');
    for (var i = 0; i < forms.length; i++) {
      forms[i].addEventListener('submit', function (e) {
        if (!window.confirm('حذف هذا العنوان؟')) {
          e.preventDefault();
        }
      });
    }
  }

  var resultsMapState = {
    map: null,
    libyaBounds: null,
    markerBounds: null,
    libyaRing: null,
    maskLayer: null,
    outlineLayer: null
  };

  var EXPORT_CANVAS_SCALE = 2;

  function ringLngLatToLatLng(ring) {
    var out = [];
    for (var i = 0; i < ring.length; i++) {
      out.push([ring[i][1], ring[i][0]]);
    }
    return out;
  }

  function addSkyVignette(wrap) {
    if (!wrap || wrap.querySelector('.libya-sky-vignette')) {
      return;
    }
    var vig = document.createElement('div');
    vig.className = 'libya-sky-vignette';
    vig.setAttribute('aria-hidden', 'true');
    wrap.appendChild(vig);
  }

  function setMaskVisible(visible) {
    var opacity = visible ? 0.9 : 0;
    if (resultsMapState.maskLayer && resultsMapState.maskLayer.setStyle) {
      resultsMapState.maskLayer.setStyle({ fillOpacity: opacity });
    }
    if (resultsMapState.outlineLayer && resultsMapState.outlineLayer.setStyle) {
      resultsMapState.outlineLayer.setStyle({ opacity: visible ? 0.85 : 0 });
    }
  }

  function applyLibyaMask(map, innerRing) {
    if (!map || !innerRing || innerRing.length < 4) {
      return;
    }
    map.createPane('maskPane');
    map.getPane('maskPane').style.zIndex = 430;
    map.getPane('maskPane').style.pointerEvents = 'none';

    if (resultsMapState.maskLayer) {
      try { map.removeLayer(resultsMapState.maskLayer); } catch (eRm) {}
      resultsMapState.maskLayer = null;
    }
    if (resultsMapState.outlineLayer) {
      try { map.removeLayer(resultsMapState.outlineLayer); } catch (eRo) {}
      resultsMapState.outlineLayer = null;
    }

    var outer = [[85, -180], [85, 180], [-85, 180], [-85, -180]];
    resultsMapState.maskLayer = L.polygon([outer, innerRing], {
      stroke: false,
      fillColor: '#02060f',
      fillOpacity: 0.9,
      fillRule: 'evenodd',
      interactive: false,
      pane: 'maskPane'
    }).addTo(map);

    resultsMapState.outlineLayer = L.polyline(innerRing, {
      color: '#fbbf24',
      weight: 1.6,
      opacity: 0.85,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
      pane: 'maskPane'
    }).addTo(map);
  }

  function loadLibyaMask(map, root) {
    var maskUrl = root.dataset.maskUrl || 'data/libya-mask-inner-ring.geojson';
    var url = maskUrl;
    try {
      url = new URL(maskUrl, window.location.href).toString();
    } catch (eUrl) {}

    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) {
          throw new Error('mask');
        }
        return r.json();
      })
      .then(function (geo) {
        var coords = geo.geometry && geo.geometry.coordinates;
        if (!coords || !coords[0]) {
          return;
        }
        var inner = ringLngLatToLatLng(coords[0]);
        resultsMapState.libyaRing = inner;
        applyLibyaMask(map, inner);
      })
      .catch(function () {});
  }

  function enhanceExportCanvas(canvas, map, innerRing, scale) {
    if (!innerRing || innerRing.length < 4) {
      return canvas;
    }
    scale = scale || EXPORT_CANVAS_SCALE;
    var w = canvas.width;
    var h = canvas.height;

    var blurCanvas = document.createElement('canvas');
    blurCanvas.width = w;
    blurCanvas.height = h;
    var bctx = blurCanvas.getContext('2d');
    bctx.filter = 'blur(10px) brightness(0.32) saturate(0.55)';
    bctx.drawImage(canvas, 0, 0);

    var outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    var octx = outCanvas.getContext('2d');
    octx.drawImage(blurCanvas, 0, 0);

    octx.save();
    octx.beginPath();
    for (var i = 0; i < innerRing.length; i++) {
      var pt = map.latLngToContainerPoint(L.latLng(innerRing[i][0], innerRing[i][1]));
      var x = pt.x * scale;
      var y = pt.y * scale;
      if (i === 0) {
        octx.moveTo(x, y);
      } else {
        octx.lineTo(x, y);
      }
    }
    octx.closePath();
    octx.clip();
    octx.drawImage(canvas, 0, 0);
    octx.restore();

    octx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
    octx.lineWidth = 2.5 * scale;
    octx.beginPath();
    for (var j = 0; j < innerRing.length; j++) {
      var pt2 = map.latLngToContainerPoint(L.latLng(innerRing[j][0], innerRing[j][1]));
      var x2 = pt2.x * scale;
      var y2 = pt2.y * scale;
      if (j === 0) {
        octx.moveTo(x2, y2);
      } else {
        octx.lineTo(x2, y2);
      }
    }
    octx.closePath();
    octx.stroke();

    return outCanvas;
  }

  function initResultsMap() {
    if (typeof L === 'undefined') {
      return null;
    }
    var root = document.getElementById('addresses-map-root');
    var el = document.getElementById('addresses-map');
    var dataEl = document.getElementById('addresses-map-data');
    if (!root || !el || !dataEl) {
      return null;
    }
    var points;
    try {
      points = JSON.parse(dataEl.textContent || '[]');
    } catch (e) {
      return null;
    }
    if (!Array.isArray(points) || points.length < 1) {
      return null;
    }
    var sw = L.latLng(parseFloat(root.dataset.swLat), parseFloat(root.dataset.swLng));
    var ne = L.latLng(parseFloat(root.dataset.neLat), parseFloat(root.dataset.neLng));
    var bounds = L.latLngBounds(sw, ne);
    var minZ = parseInt(root.dataset.minZoom, 10) || 5;
    var maxZ = parseInt(root.dataset.maxZoom, 10) || 14;

    var map = L.map('addresses-map', {
      maxBounds: bounds,
      maxBoundsViscosity: 1.0,
      minZoom: minZ,
      maxZoom: maxZ
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: 'anonymous',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
    }).addTo(map);

    var g = L.layerGroup().addTo(map);
    var latlngs = [];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var ll = L.latLng(p.lat, p.lng);
      if (!bounds.contains(ll)) {
        continue;
      }
      latlngs.push(ll);
      L.marker(ll).bindPopup(String(p.label || '')).addTo(g);
    }
    if (latlngs.length < 1) {
      return null;
    }
    var markerBounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [18, 18], animate: false });

    var wrap = el.parentNode;
    if (wrap) {
      addSkyVignette(wrap);
    }

    resultsMapState.map = map;
    resultsMapState.libyaBounds = bounds;
    resultsMapState.markerBounds = markerBounds;

    loadLibyaMask(map, root);

    return map;
  }

  function bindMapExport() {
    var btn = document.getElementById('addr-map-export');
    var mapEl = document.getElementById('addresses-map');
    if (!btn || !mapEl) {
      return;
    }

    var defaultLabel = btn.textContent;

    btn.addEventListener('click', function () {
      var map = resultsMapState.map;
      if (!map || typeof html2canvas === 'undefined') {
        window.alert('تعذّر تصدير الخريطة — تأكد من تحميل الصفحة بالكامل.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'جاري التصدير...';

      var savedCenter = map.getCenter();
      var savedZoom = map.getZoom();

      function restoreView() {
        setMaskVisible(true);
        map.setView(savedCenter, savedZoom, { animate: false });
        btn.disabled = false;
        btn.textContent = defaultLabel;
      }

      setMaskVisible(false);

      if (resultsMapState.libyaBounds) {
        map.fitBounds(resultsMapState.libyaBounds, { padding: [10, 10], animate: false });
      } else if (resultsMapState.markerBounds) {
        map.fitBounds(resultsMapState.markerBounds, { padding: [40, 40], maxZoom: 8, animate: false });
      }

      map.invalidateSize();

      setTimeout(function () {
        html2canvas(mapEl, {
          useCORS: true,
          allowTaint: false,
          scale: EXPORT_CANVAS_SCALE,
          logging: false,
          backgroundColor: '#0a0e12'
        })
          .then(function (canvas) {
            var finalCanvas = enhanceExportCanvas(
              canvas,
              map,
              resultsMapState.libyaRing,
              EXPORT_CANVAS_SCALE
            );
            var dataUrl = finalCanvas.toDataURL('image/png');
            var stamp = new Date().toISOString().slice(0, 10);
            var fileName = 'libya-addresses-map-' + stamp + '.png';

            var link = document.createElement('a');
            link.download = fileName;
            link.href = dataUrl;
            link.click();

            var printWin = window.open('', '_blank', 'noopener,noreferrer');
            if (printWin) {
              printWin.document.write(
                '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
                  '<title>خريطة العناوين — ليبيا</title>' +
                  '<style>body{margin:0;padding:12px;text-align:center;background:#fff;font-family:Tahoma,sans-serif}' +
                  'h1{font-size:1rem;margin:0 0 8px;color:#1e3a8a}img{max-width:100%;height:auto;border:1px solid #cbd5e1}</style></head><body>' +
                  '<h1>خريطة العناوين البريدية — ليبيا</h1>' +
                  '<img src="' + dataUrl + '" alt="خريطة ليبيا مع علامات العناوين"></body></html>'
              );
              printWin.document.close();
              printWin.onload = function () {
                try {
                  printWin.focus();
                  printWin.print();
                } catch (ePrint) {}
              };
            }

            restoreView();
          })
          .catch(function () {
            restoreView();
            window.alert('تعذّر تصدير صورة الخريطة. أعد المحاولة بعد اكتمال تحميل البلاطات.');
          });
      }, 1100);
    });
  }

  function buildReportParams(form, output) {
    var params = new URLSearchParams();
    params.set('r', 'addresses_report');
    params.set('output', output || 'pdf');
    var q = form.querySelector('[name="q"]');
    var w = form.querySelector('[name="wilayah"]');
    var s = form.querySelector('[name="shabiya"]');
    var t = form.querySelector('[name="type"]');
    if (q && q.value.trim() !== '') {
      params.set('q', q.value.trim());
    }
    if (w && w.value !== '') {
      params.set('wilayah', w.value);
    }
    if (s && s.value !== '') {
      params.set('shabiya', s.value);
    }
    if (t && t.value !== '') {
      params.set('type', t.value);
    }
    return params;
  }

  function bindPrintReport() {
    var btn = document.getElementById('addr-print-btn');
    var form = document.querySelector('form.addresses-filters');
    if (!btn || !form) {
      return;
    }

    var defaultLabel = btn.textContent;
    var busy = false;
    var resetTimer = null;

    function setBusy(on) {
      busy = on;
      btn.disabled = on;
      btn.textContent = on ? 'جاري التحضير...' : defaultLabel;
    }

    function resetBusy() {
      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
      setBusy(false);
    }

    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.type !== 'addresses-report-done') {
        return;
      }
      resetBusy();
    });

    btn.addEventListener('click', function () {
      if (busy) {
        return;
      }
      setBusy(true);
      resetTimer = setTimeout(resetBusy, 20000);

      var params = buildReportParams(form, 'print');
      var url = 'index.php?' + params.toString();
      var win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        resetBusy();
        window.alert('يُرجى السماح بالنوافذ المنبثقة لطباعة كشف العناوين.');
        return;
      }
      win.focus();
    });
  }

  function init() {
    syncShabiyaOptions();
    bindDeleteConfirm();
    bindPrintReport();
    initResultsMap();
    bindMapExport();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
