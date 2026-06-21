/**
 * Edit-mode wiring: full save via API, delete modal, QR/card view.
 */
(function () {
  'use strict';

  if (!window.AddressForm) {
    return;
  }
  var AF = window.AddressForm;
  var cfg = AF.cfg;
  if (!cfg || !cfg.isEdit) {
    return;
  }

  function showUpdateWarnings(warnings) {
    if (!Array.isArray(warnings) || !warnings.length) { return; }
    var text = warnings.map(function (w) { return String(w); }).join(' — ');
    AF.showMsg(text, false);
  }

  var btnSaveEdit = document.getElementById('btn-save-changes');
  if (btnSaveEdit) {
    btnSaveEdit.addEventListener('click', function () {
      AF.showMsg('', false);
      var body = AF.gatherNewPayload();
      if (!body.map_lat || !body.map_lng) {
        AF.showMsg('انقر على الخريطة لتحديد الموقع.', true);
        return;
      }
      btnSaveEdit.disabled = true;
      fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin'
      })
        .then(function (r) { return r.json().then(function (j) { return { j: j }; }); })
        .then(function (x) {
          if (x.j && x.j.ok) {
            AF.showMsg(x.j.message || 'تم الحفظ.', false);
            showUpdateWarnings(x.j.warnings);
            if (x.j.record && typeof AF.applySavedRecord === 'function') {
              AF.applySavedRecord(x.j.record, { skipShabiyaMapReload: true });
            }
            return;
          }
          AF.showMsg((x.j && x.j.message) || 'تعذّر الحفظ.', true);
        })
        .catch(function () { AF.showMsg('خطأ في الاتصال.', true); })
        .finally(function () { btnSaveEdit.disabled = false; });
    });
  }

  var btnDel = document.getElementById('btn-delete-record');
  if (btnDel) {
    btnDel.addEventListener('click', function () {
      var doDelete = function () {
        AF.showMsg('', false);
        var body = { action: 'delete', csrf_token: cfg.csrf, id: cfg.editId };
        btnDel.disabled = true;
        fetch(cfg.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
          credentials: 'same-origin'
        })
          .then(function (r) { return r.json().then(function (j) { return { j: j }; }); })
          .then(function (x) {
            if (x.j && x.j.ok) {
              window.location.href = 'index.php?r=addresses';
              return;
            }
            AF.showMsg((x.j && x.j.message) || 'تعذّر الحذف.', true);
          })
          .catch(function () { AF.showMsg('خطأ في الاتصال.', true); })
          .finally(function () { btnDel.disabled = false; });
      };
      if (window.AddrDeleteConfirm && typeof window.AddrDeleteConfirm.ask === 'function') {
        window.AddrDeleteConfirm.ask('حذف هذا السجل نهائياً؟', doDelete);
      } else if (window.confirm('حذف هذا السجل نهائياً؟')) {
        doDelete();
      }
    });
  }

  var btnQr = document.getElementById('btn-qr-placeholder');
  if (btnQr && cfg.editId) {
    btnQr.addEventListener('click', function () {
      fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action: 'get', csrf_token: cfg.csrf, id: cfg.editId }),
        credentials: 'same-origin'
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok || !j.record) {
            AF.showMsg((j && j.message) || 'تعذّر تحميل السجل.', true);
            return;
          }
          var rec = j.record;
          if (window.AddressSave && typeof window.AddressSave.openSaveSuccessOverlay === 'function') {
            window.AddressSave.openSaveSuccessOverlay(rec, rec.postal_code, rec.id);
          }
        })
        .catch(function () { AF.showMsg('خطأ في الاتصال.', true); });
    });
  }
})();
