/**
 * Save flow: AJAX create, success overlay with QR + print card, "new scene" buttons,
 * "save settings" persistence, PNG export.
 */
(function () {
  'use strict';

  if (!window.AddressForm) {
    return;
  }
  var AF = window.AddressForm;
  var cfg = AF.cfg;

  var TYPE_LABEL_AR = { residential: 'سكني', government: 'حكومي', commercial: 'تجاري' };

  var overlayEl = document.getElementById('addr-save-success-overlay');
  var overlaySummaryEl = document.getElementById('addr-save-success-summary');
  var overlayQrEl = document.getElementById('addr-save-qrcode');
  var lastSavedForPrint = null;

  function dismissMapStatusMessages() {
    if (window.MapCore && typeof window.MapCore.cancelPlacesLoadMessage === 'function') {
      window.MapCore.cancelPlacesLoadMessage();
    } else if (window.AddrMap && typeof window.AddrMap.cancelAddrApiMsgAutoHide === 'function') {
      window.AddrMap.cancelAddrApiMsgAutoHide();
    }
    AF.showMsg('', false);
  }

  function openSaveSuccessOverlay(record, postalCode, idNum) {
    if (!overlayEl || !overlaySummaryEl) { return; }
    dismissMapStatusMessages();
    lastSavedForPrint = { record: record, postalCode: postalCode, id: idNum };
    overlayEl.hidden = false;
    overlaySummaryEl.textContent = '';

    function addLine(prefix, text) {
      var p = document.createElement('p');
      p.className = 'addr-save-success__line';
      var s = prefix + ': ' + (text !== undefined && text !== null && text !== '' ? text : '—');
      p.textContent = s;
      overlaySummaryEl.appendChild(p);
    }

    var pcFlat = postalCode ? String(postalCode) : String((record && record.postal_code) || '');
    addLine('المعرف في النظام', String(idNum));
    addLine('الكود البريدي', pcFlat);
    var r = record || {};
    var pcs =
      r.pc_province && r.pc_area != null && r.pc_city != null && r.pc_sector != null && r.pc_property != null
        ? String(r.pc_province) + ' ' + String(r.pc_area) + '-' + String(r.pc_city) + '-' + String(r.pc_sector) + ' ' + String(r.pc_property)
        : '';
    if (pcs) { addLine('المكوّن التفصيلي', pcs); }
    addLine('الشعبية', r.shabiya || '');
    addLine('المنطقة / الحيّ', r.locality || '');
    var tAr = TYPE_LABEL_AR[String(r.type || '')] || (r.type ? String(r.type) : '');
    addLine('نوع العقار', tAr);
    addLine('صاحب العقار', r.owner_name || '');
    var latLon = '';
    if (r.latitude || r.longitude) {
      latLon = String(r.latitude || '—') + ' ، ' + String(r.longitude || '—');
    }
    addLine('العرض ، الطول (WGS84)', latLon || '');

    if (overlayQrEl && typeof QRCode !== 'undefined') {
      overlayQrEl.innerHTML = '';
      try {
        var link = new URL('index.php?r=address_new&id=' + encodeURIComponent(String(idNum)), window.location.href).href;
        /* global QRCode — qrcodejs */
        /* eslint-disable new-cap */
        var qrSize = Math.min(window.innerWidth < 460 ? 160 : 200, Math.floor(window.innerWidth * 0.42));
        new QRCode(overlayQrEl, {
          text: link + '\n' + pcFlat,
          width: qrSize,
          height: qrSize,
          correctLevel: QRCode.CorrectLevel.M
        });
        /* eslint-enable new-cap */
      } catch (eQr) {
        overlayQrEl.textContent = '(تعذّر إنشاء رمز QR)';
      }
    }

    document.body.style.overflow = 'hidden';
  }

  function closeSaveSuccessOverlay() {
    if (!overlayEl) { return; }
    overlayEl.hidden = true;
    document.body.style.overflow = '';
    if (overlayQrEl) { overlayQrEl.innerHTML = ''; }
  }

  function printSaveSuccessCard(record, postalCode, idNum) {
    var r = record || {};
    var pcFlat = postalCode ? String(postalCode) : String(r.postal_code || '');
    var lines = [];
    lines.push('المعرف: ' + idNum);
    lines.push('الكود البريدي: ' + pcFlat);
    var pcs =
      r.pc_province && r.pc_area != null && r.pc_city != null && r.pc_sector != null && r.pc_property != null
        ? String(r.pc_province) + ' ' + r.pc_area + '-' + r.pc_city + '-' + r.pc_sector + ' ' + r.pc_property
        : '';
    if (pcs) { lines.push('التفاصيل: ' + pcs); }
    lines.push('الشعبية: ' + (r.shabiya || '—'));
    lines.push('المنطقة: ' + (r.locality || '—'));
    lines.push('نوع العقار: ' + (TYPE_LABEL_AR[String(r.type || '')] || r.type || '—'));
    lines.push('صاحب العقار: ' + (r.owner_name || '—'));
    lines.push('العرض والطول: ' + (r.latitude || '—') + ' ، ' + (r.longitude || '—'));

    var w = window.open('', '_blank');
    if (!w) {
      AF.showMsg('تعذّر فتح نافذة الطباعة (منع النوافذ المنبثقة).', true);
      return;
    }
    try {
      var titleSafe =
        typeof idNum === 'number' ? idNum : String(idNum || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 16);
      w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>');
      w.document.write('عنوان بريدي #' + titleSafe);
      w.document.write('</title><style>');
      w.document.write(
        'body{font-family:Tahoma,sans-serif;line-height:1.75;padding:1.75rem;color:#111}' +
          'h1{font-size:1.2rem;margin:0 0 .75rem;text-align:right}' +
          'pre{font-size:13px;text-align:right;white-space:pre-wrap;word-break:break-word;margin:0}'
      );
      w.document.write('</style></head><body>');
      w.document.write('<h1>البريد الليبي — عنوان مسجّل</h1>');
      w.document.write('<pre>');
      function escRow(t) {
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      lines.forEach(function (ln, i) {
        var txt = escRow(ln);
        w.document.write(txt);
        if (i < lines.length - 1) { w.document.write('\n'); }
      });
      w.document.write('</pre></body></html>');
      w.document.close();
      w.onload = function () {
        try { w.focus(); w.print(); w.close(); } catch (eP) {}
      };
    } catch (eWin) {
      try { w.close(); } catch (_eClose) {}
      AF.showMsg('تعذّر إعداد مستند الطباعة.', true);
    }
  }

  /* Bind save button — create flow (skipped in edit mode). */
  var btnAdd = document.getElementById('btn-add-save');
  if (btnAdd) {
    btnAdd.addEventListener('click', function () {
      AF.showMsg('', false);
      var body = AF.gatherNewPayload();
      btnAdd.disabled = true;
      fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin'
      })
        .then(function (r) {
          return r.json().then(function (j) { return { okHttp: r.ok, j: j }; });
        })
        .then(function (x) {
          if (x.j && x.j.ok) {
            openSaveSuccessOverlay(x.j.record, x.j.postalCode, x.j.id);
            AF.resetAfterSaveToShabiya();
            return;
          }
          AF.showMsg((x.j && x.j.message) || 'تعذّر الحفظ.', true);
        })
        .catch(function () {
          AF.showMsg('خطأ في الاتصال.', true);
        })
        .finally(function () {
          btnAdd.disabled = false;
        });
    });
  }

  /* Success-overlay action buttons */
  var btnSaveOverlayClose = document.getElementById('addr-save-success-close');
  if (btnSaveOverlayClose) {
    btnSaveOverlayClose.addEventListener('click', closeSaveSuccessOverlay);
  }
  var btnSaveBackdrop = document.getElementById('addr-save-success-backdrop');
  if (btnSaveBackdrop) {
    btnSaveBackdrop.addEventListener('click', closeSaveSuccessOverlay);
  }
  var btnSavePrint = document.getElementById('addr-save-success-print');
  if (btnSavePrint) {
    btnSavePrint.addEventListener('click', function () {
      if (!lastSavedForPrint) {
        AF.showMsg('لا توجد بطاقة جاهزة.', true);
        return;
      }
      printSaveSuccessCard(lastSavedForPrint.record, lastSavedForPrint.postalCode, lastSavedForPrint.id);
    });
  }
  var btnSaveNewSceneOverlay = document.getElementById('addr-save-success-new-scene');
  if (btnSaveNewSceneOverlay) {
    btnSaveNewSceneOverlay.addEventListener('click', function () {
      closeSaveSuccessOverlay();
      if (!cfg.isEdit) {
        AF.resetAddFormParcelOnly();
        AF.dispatchNewSceneWithinCurrentShubiya();
        AF.showMsg('مشهد جديد داخل الشعبية الحالية.', false);
      } else {
        window.dispatchEvent(new CustomEvent('addr-map-new-scene', { detail: {} }));
        AF.showMsg('أُعيدت الخريطة والطبقات.', false);
      }
    });
  }

  /* Footer-level "new scene" button (outside the overlay) */
  var btnNewScene = document.getElementById('btn-new-scene');
  if (btnNewScene) {
    btnNewScene.addEventListener('click', function () {
      closeSaveSuccessOverlay();
      if (cfg.isEdit) {
        window.dispatchEvent(new CustomEvent('addr-map-new-scene', { detail: {} }));
        AF.showMsg('مشهد جديد: أُعيدت الخريطة والطبقات.', false);
        return;
      }
      AF.resetAddFormParcelOnly();
      AF.dispatchNewSceneWithinCurrentShubiya();
      AF.showMsg('مشهد جديد داخل الشعبية الحالية.', false);
    });
  }

  /* PNG export of the map workbench */
  var btnExport = document.getElementById('btn-export-png');
  if (btnExport) {
    btnExport.addEventListener('click', function () {
      if (!window.AddrMap || typeof window.AddrMap.exportPng !== 'function') {
        AF.showMsg('المصدّر غير جاهز.', true);
        return;
      }
      window.AddrMap.exportPng().catch(function () {
        AF.showMsg('تعذّر تصدير الصورة. حدّث الصفحة (F5) ثم أعد المحاولة.', true);
      });
    });
  }

  /* Make overlay helpers reachable from edit.js (e.g. for "QR" button on edit). */
  window.AddressSave = {
    openSaveSuccessOverlay: openSaveSuccessOverlay,
    closeSaveSuccessOverlay: closeSaveSuccessOverlay,
    printSaveSuccessCard: printSaveSuccessCard
  };
})();
