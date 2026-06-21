/**
 * Read-only parcel boundary renderer for list/show maps (Leaflet).
 */
(function () {
  'use strict';

  var DEFAULT_STYLE = {
    color: '#22c55e',
    weight: 2,
    fillColor: '#22c55e',
    fillOpacity: 0.14
  };

  function parseGeoJson(raw) {
    if (!raw) {
      return null;
    }
    if (typeof raw === 'object') {
      return raw;
    }
    try {
      return JSON.parse(String(raw));
    } catch (e0) {
      return null;
    }
  }

  function renderOnMap(map, geojson, opts) {
    if (!map || typeof L === 'undefined') {
      return null;
    }
    var gj = parseGeoJson(geojson);
    if (!gj) {
      return null;
    }
    opts = opts || {};
    var style = Object.assign({}, DEFAULT_STYLE, opts.style || {});
    var desc = opts.desc ? String(opts.desc) : '';
    return L.geoJSON(gj, {
      style: function () {
        return style;
      },
      onEachFeature: function (feature, layer) {
        var tip = desc;
        if (!tip && feature && feature.properties && feature.properties.desc) {
          tip = String(feature.properties.desc);
        }
        if (tip) {
          layer.bindTooltip(tip, { sticky: true });
        }
      }
    }).addTo(map);
  }

  function boundsOfGeoJson(raw) {
    var gj = parseGeoJson(raw);
    if (!gj || typeof L === 'undefined') {
      return null;
    }
    try {
      var layer = L.geoJSON(gj);
      var b = layer.getBounds();
      layer.remove();
      return b && b.isValid && b.isValid() ? b : null;
    } catch (e1) {
      return null;
    }
  }

  window.ParcelDisplay = {
    parse: parseGeoJson,
    render: renderOnMap,
    bounds: boundsOfGeoJson
  };
})();
