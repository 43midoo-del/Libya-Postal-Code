/**
 * Map labels: postal region tags (B1–F22) overlay + visibility toggle.
 */
(function () {
  'use strict';

  if (!window.MapCore || !window.MapCore.map) {
    return;
  }
  var MC = window.MapCore;
  var map = MC.map;
  var regions = MC.regions || [];

  var labelLayer = L.layerGroup().addTo(map);
  var labelMarkers = [];

  function addLabels() {
    labelLayer.clearLayers();
    labelMarkers = [];
    for (var j = 0; j < regions.length; j++) {
      var lb = regions[j];
      var code = lb.code || (lb.province && lb.n ? lb.province + lb.n : '');
      if (typeof lb.lat !== 'number' || typeof lb.lng !== 'number' || !code) {
        continue;
      }
      var m = L.marker([lb.lat, lb.lng], {
        pane: 'postalLabels',
        interactive: false,
        icon: L.divIcon({
          className: 'postal-map-label',
          html: '<span>' + String(code).replace(/</g, '') + '</span>',
          iconSize: [44, 24],
          iconAnchor: [22, 12]
        })
      });
      m.addTo(labelLayer);
      labelMarkers.push(m);
    }
  }
  addLabels();

  var layerLabelsCb = document.getElementById('layer-labels');
  if (layerLabelsCb) {
    layerLabelsCb.addEventListener('change', function () {
      if (layerLabelsCb.checked) {
        map.addLayer(labelLayer);
      } else {
        map.removeLayer(labelLayer);
      }
    });
  }

  MC.labels = { layer: labelLayer, markers: labelMarkers, refresh: addLabels };
})();
