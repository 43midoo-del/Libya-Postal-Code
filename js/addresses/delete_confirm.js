/**
 * Unified delete confirmation modal for address pages.
 * Exposes window.AddrDeleteConfirm.ask(message, onConfirm).
 */
(function () {
  'use strict';

  var overlay = document.getElementById('addr-delete-confirm-overlay');
  var messageEl = document.getElementById('addr-delete-confirm-message');
  var btnYes = document.getElementById('addr-delete-confirm-yes');
  var btnNo = document.getElementById('addr-delete-confirm-no');
  var backdrop = document.getElementById('addr-delete-confirm-backdrop');
  var pendingConfirm = null;

  function closeModal() {
    if (!overlay) { return; }
    overlay.hidden = true;
    document.body.style.overflow = '';
    pendingConfirm = null;
  }

  function openModal(message, onConfirm) {
    if (!overlay) {
      if (typeof onConfirm === 'function' && window.confirm(message || 'تأكيد الحذف؟')) {
        onConfirm();
      }
      return;
    }
    if (messageEl) {
      messageEl.textContent = message || 'حذف هذا السجل نهائياً؟';
    }
    pendingConfirm = typeof onConfirm === 'function' ? onConfirm : null;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (btnYes) { try { btnYes.focus(); } catch (eF) {} }
  }

  if (btnYes) {
    btnYes.addEventListener('click', function () {
      var fn = pendingConfirm;
      closeModal();
      if (fn) { fn(); }
    });
  }
  if (btnNo) {
    btnNo.addEventListener('click', closeModal);
  }
  if (backdrop) {
    backdrop.addEventListener('click', closeModal);
  }

  function bindDeleteForms() {
    var forms = document.querySelectorAll('form.js-confirm-delete');
    for (var i = 0; i < forms.length; i++) {
      forms[i].addEventListener('submit', function (e) {
        e.preventDefault();
        var form = e.currentTarget;
        openModal('حذف هذا العنوان؟', function () {
          form.submit();
        });
      });
    }
  }

  window.AddrDeleteConfirm = {
    ask: openModal,
    close: closeModal
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDeleteForms);
  } else {
    bindDeleteForms();
  }
})();
