/**
 * Dashboard charts: pie (wilayah), bar (top shabiyat), line (last 7 days), doughnut (types).
 * Reads data injected by views/dashboard/index.php as JSON in #dashboard-data.
 */
(function () {
  'use strict';

  if (typeof Chart === 'undefined') {
    return;
  }
  Chart.defaults.color = '#cbd5e1';
  Chart.defaults.borderColor = 'rgba(148,163,184,0.15)';
  Chart.defaults.font.family = '"Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif';

  var dataEl = document.getElementById('dashboard-data');
  if (!dataEl) { return; }
  var d;
  try { d = JSON.parse(dataEl.textContent || '{}'); } catch (e) { return; }

  var palette = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#eab308', '#ec4899', '#14b8a6', '#f43f5e', '#0ea5e9', '#84cc16'];

  function pick(i) { return palette[i % palette.length]; }

  function renderPie(byWilayah) {
    var el = document.getElementById('chart-wilayah');
    if (!el) { return; }
    var labels = byWilayah.map(function (r) { return r.label; });
    var values = byWilayah.map(function (r) { return r.count; });
    var colors = byWilayah.map(function (_, i) { return pick(i); });
    new Chart(el, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{ data: values, backgroundColor: colors, borderColor: '#0f172a', borderWidth: 1 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function renderTopShabiyat(rows) {
    var el = document.getElementById('chart-shabiyat');
    if (!el) { return; }
    new Chart(el, {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return r.name; }),
        datasets: [{
          label: 'عدد العناوين',
          data: rows.map(function (r) { return r.count; }),
          backgroundColor: 'rgba(59,130,246,0.65)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderLast7(series) {
    var el = document.getElementById('chart-last7');
    if (!el) { return; }
    new Chart(el, {
      type: 'line',
      data: {
        labels: series.map(function (r) { return r.date.slice(5); }),
        datasets: [{
          label: 'عناوين/يوم',
          data: series.map(function (r) { return r.count; }),
          fill: true,
          backgroundColor: 'rgba(34,197,94,0.15)',
          borderColor: '#22c55e',
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#22c55e'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderTypes(byType) {
    var el = document.getElementById('chart-type');
    if (!el) { return; }
    new Chart(el, {
      type: 'doughnut',
      data: {
        labels: byType.map(function (r) { return r.label; }),
        datasets: [{
          data: byType.map(function (r) { return r.count; }),
          backgroundColor: ['#3b82f6', '#a855f7', '#f97316', '#94a3b8'],
          borderColor: '#0f172a',
          borderWidth: 1
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  renderPie(d.byWilayah || []);
  renderTopShabiyat(d.topShabiyat || []);
  renderLast7(d.last7Days || []);
  renderTypes(d.byType || []);
})();
