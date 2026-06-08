/**
 * Cascading wilayah → shabiya (22) on add-address form.
 */
(function () {
  'use strict';

  var wSel = document.getElementById('wilayah');
  var sSel = document.getElementById('shabiya');
  var dataEl = document.getElementById('libya-shabiyat-data');
  if (!wSel || !sSel || !dataEl) {
    return;
  }

  var all;
  try {
    all = JSON.parse(dataEl.textContent || '[]');
  } catch (e) {
    return;
  }
  if (!Array.isArray(all)) {
    return;
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

  function refill() {
    var w = wSel.value;
    sSel.innerHTML = '';
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = w ? '— اختر الشعبية —' : '— اختر الولاية أولاً —';
    sSel.appendChild(opt0);
    sSel.disabled = !w;
    sSel.required = !!w;
    if (!w) {
      return;
    }
    var forWil = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].wilayah !== w) {
        continue;
      }
      forWil.push(all[i]);
    }
    forWil.sort(function (a, b) {
      return shabiyaCodeOrderNum(a) - shabiyaCodeOrderNum(b);
    });
    for (var j = 0; j < forWil.length; j++) {
      var row = forWil[j];
      var o = document.createElement('option');
      o.value = row.name;
      o.textContent = shabiyaOptionLabel(row);
      sSel.appendChild(o);
    }
  }

  wSel.addEventListener('change', refill);
  refill();
})();
