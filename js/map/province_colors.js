/**
 * Shared province (wilayah) colors — single source loaded from DB via page embed or API.
 * Dispatches `province-colors-changed` when updated (e.g. after boundary editor save).
 */
(function (global) {
  'use strict';

  var DEFAULTS = { B: '#ef4444', T: '#22c55e', F: '#cbd5e1' };
  var colors = {};

  function copyDefaults() {
    colors = { B: DEFAULTS.B, T: DEFAULTS.T, F: DEFAULTS.F };
  }

  function normalizeLetter(prov) {
    var s = String(prov || '').trim().toUpperCase();
    if (!s) { return ''; }
    if (s.length === 1 && (s === 'B' || s === 'T' || s === 'F')) { return s; }
    if (s.charAt(0) === 'B' || s.charAt(0) === 'T' || s.charAt(0) === 'F') { return s.charAt(0); }
    return s.charAt(0);
  }

  function ensureHash(c) {
    var v = String(c || '').trim();
    if (!v) { return ''; }
    return v.charAt(0) === '#' ? v : '#' + v;
  }

  function readEmbedded() {
    var el = document.getElementById('province-colors-data');
    if (!el) { return null; }
    try {
      var parsed = JSON.parse(el.textContent || '{}');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function applyMap(map) {
    if (!map || typeof map !== 'object') { return; }
    ['B', 'T', 'F'].forEach(function (k) {
      if (map[k]) {
        colors[k] = ensureHash(map[k]);
      }
    });
  }

  function notifyChange() {
    var payload = getAll();
    try {
      global.dispatchEvent(
        new CustomEvent('province-colors-changed', {
          detail: { colors: payload }
        })
      );
    } catch (e) {}
    try {
      global.localStorage.setItem(
        'lp_province_colors',
        JSON.stringify({ ts: Date.now(), colors: payload })
      );
    } catch (eLs) {}
  }

  function getColor(prov) {
    var k = normalizeLetter(prov);
    return (k && colors[k]) || DEFAULTS[k] || '#94a3b8';
  }

  function palette(prov) {
    var stroke = getColor(prov);
    return {
      stroke: stroke,
      fill: stroke,
      strokeHover: stroke,
      fillHover: stroke
    };
  }

  function hoverFill(prov) {
    return getColor(prov);
  }

  function getAll() {
    return { B: colors.B, T: colors.T, F: colors.F };
  }

  function setColors(map, silent) {
    applyMap(map);
    if (!silent) { notifyChange(); }
  }

  function loadFromApi(url) {
    if (!url) { return Promise.resolve(getAll()); }
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.ok && data.colors) {
          setColors(data.colors, false);
        }
        return getAll();
      })
      .catch(function () { return getAll(); });
  }

  copyDefaults();
  applyMap(readEmbedded());

  try {
    global.addEventListener('storage', function (ev) {
      if (ev.key !== 'lp_province_colors' || !ev.newValue) { return; }
      try {
        var parsed = JSON.parse(ev.newValue);
        if (parsed && parsed.colors) {
          setColors(parsed.colors, false);
        }
      } catch (eSt) {}
    });
  } catch (eEv) {}

  global.ProvinceColors = {
    getColor: getColor,
    palette: palette,
    hoverFill: hoverFill,
    getAll: getAll,
    setColors: setColors,
    loadFromApi: loadFromApi,
    normalizeLetter: normalizeLetter
  };
})(typeof window !== 'undefined' ? window : globalThis);
