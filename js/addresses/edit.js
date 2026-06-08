/**
 * Edit-mode wiring: "save changes" + delete + QR view for an existing address record.
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

  var btnSaveEdit = document.getElementById('btn-save-changes');
  if (btnSaveEdit) {
    btnSaveEdit.addEventListener('click', function () {
      AF.showMsg('', false);
      var id = cfg.editId;
      var body = {
        action: 'update',
        csrf_token: cfg.csrf,
        id: id,
        holder_name: (document.getElementById('edit_holder_name') || {}).value || '',
        type: (document.getElementById('edit_type') || {}).value || 'residential',
        apartment_number: (document.getElementById('edit_apartment_number') || {}).value || ''
      };
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
      if (!window.confirm('حذف هذا السجل نهائياً؟')) { return; }
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
    });
  }

  /* QR / card display on the edit form (uses the same overlay as save flow). */
  var btnQr = document.getElementById('btn-qr-placeholder');
  if (btnQr) {
    if (cfg.editId) {
      btnQr.textContent = 'عرض بطاقة / QR';
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
    } else {
      btnQr.addEventListener('click', function () {
        AF.showMsg('عرض بطاقة وQR متاح بعد حفظ عنوان جديد من لوحة الإضافة.', false);
      });
    }
  }
})();
