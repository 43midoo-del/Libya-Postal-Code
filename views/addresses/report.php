<?php
/**
 * Printable addresses report (filter-based). Opens browser print dialog for PDF save.
 *
 * @var string $appName
 * @var string $title
 * @var list<array<string, mixed>> $rows
 * @var int $total
 * @var bool $truncated
 * @var array{q: string, wilayah: string, shabiya: string, type: string} $filters
 * @var array{wilayah: array<string, string>, shabiyat: list<array{name: string, wilayah: string, code?: string}>} $libya
 * @var string $userName
 * @var string $generatedAt
 * @var string $output
 * @var string $pdfFilename
 */
$reportCss = 'css/addresses_report.css';
$reportCssVer = is_file(dirname(__DIR__, 2) . '/' . $reportCss) ? (string) filemtime(dirname(__DIR__, 2) . '/' . $reportCss) : '1';
$extraHead = '<link rel="stylesheet" href="' . htmlspecialchars($reportCss . '?v=' . $reportCssVer, ENT_QUOTES, 'UTF-8') . '">';
require dirname(__DIR__) . '/partials/head.php';

$wLabels = $libya['wilayah'];
$typeLabels = [
    'residential' => 'سكني',
    'government'  => 'حكومي',
    'commercial'  => 'تجاري',
];

$filterLines = [];
if ($filters['q'] !== '') {
    $filterLines[] = 'بحث: ' . $filters['q'];
}
if ($filters['wilayah'] !== '') {
    $filterLines[] = 'الولاية: ' . ($wLabels[$filters['wilayah']] ?? $filters['wilayah']);
}
if ($filters['shabiya'] !== '') {
    $filterLines[] = 'الشعبية: ' . $filters['shabiya'];
}
if ($filters['type'] !== '') {
    $filterLines[] = 'النوع: ' . ($typeLabels[$filters['type']] ?? $filters['type']);
}
if ($filterLines === []) {
    $filterLines[] = 'الكل (بدون فلاتر)';
}
?>
<main id="main-content" class="addresses-report" dir="rtl">
    <div class="addresses-report__intro">
        <header class="addresses-report__head">
            <div>
                <h1 class="addresses-report__title">كشف العناوين البريدية</h1>
                <p class="addresses-report__meta"><?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?></p>
            </div>
            <div class="addresses-report__stamp">
                <span>تاريخ الإصدار: <?= htmlspecialchars($generatedAt, ENT_QUOTES, 'UTF-8') ?></span>
                <span>أُعدّ بواسطة: <?= htmlspecialchars($userName, ENT_QUOTES, 'UTF-8') ?></span>
            </div>
        </header>

        <section class="addresses-report__filters" aria-label="معايير الفلترة">
            <h2 class="addresses-report__section-title">الفلاتر:</h2>
            <p class="addresses-report__filter-text"><?= htmlspecialchars(implode(' · ', $filterLines), ENT_QUOTES, 'UTF-8') ?></p>
            <p class="addresses-report__count">
                <strong><?= (int) $total ?></strong> سجل
                <?php if ($truncated): ?>
                    <span class="addresses-report__trunc">(أول <?= count($rows) ?>)</span>
                <?php endif; ?>
            </p>
        </section>
    </div>

    <?php if (count($rows) < 1): ?>
        <p class="addresses-report__empty">لا توجد عناوين مطابقة للفلاتر المختارة.</p>
    <?php else: ?>
        <div class="addresses-report__table-wrap">
            <table class="addresses-report__table">
                <colgroup>
                    <col class="col-num">
                    <col class="col-code">
                    <col class="col-owner">
                    <col class="col-type">
                    <col class="col-place">
                    <col class="col-coords">
                </colgroup>
                <thead>
                    <tr>
                        <th class="col-num">#</th>
                        <th class="col-code">الكود</th>
                        <th class="col-owner">المالك</th>
                        <th class="col-type">النوع</th>
                        <th class="col-place">العنوان</th>
                        <th class="col-coords">الإحداثيات</th>
                    </tr>
                </thead>
                <tbody>
                <?php foreach ($rows as $i => $row):
                    $place = \App\Models\Address::formatPlaceSequence($row);
                    $owner = trim((string) ($row['owner_name'] ?? ''));
                    $coords = number_format((float) $row['latitude'], 5, '.', '')
                        . ', '
                        . number_format((float) $row['longitude'], 5, '.', '');
                ?>
                    <tr>
                        <td class="col-num"><?= (int) ($i + 1) ?></td>
                        <td class="col-code mono"><?= htmlspecialchars($row['postal_code'], ENT_QUOTES, 'UTF-8') ?></td>
                        <td class="col-owner<?= $owner === '' ? ' is-empty' : '' ?>"><?= $owner !== '' ? htmlspecialchars($owner, ENT_QUOTES, 'UTF-8') : '—' ?></td>
                        <td class="col-type"><?= htmlspecialchars(\App\Models\Address::typeLabelAr((string) $row['type']), ENT_QUOTES, 'UTF-8') ?></td>
                        <td class="col-place"><?= htmlspecialchars($place, ENT_QUOTES, 'UTF-8') ?></td>
                        <td class="col-coords mono" dir="ltr"><?= htmlspecialchars($coords, ENT_QUOTES, 'UTF-8') ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>

    <footer class="addresses-report__foot">
        <span>Libya Smart Postal — نظام العناوين البريدية الذكي</span>
    </footer>

    <div class="addresses-report__actions no-print">
        <button type="button" class="btn btn-report btn-report--print" id="addresses-report-print">طباعة</button>
        <button type="button" class="btn btn-report btn-report--pdf" id="addresses-report-download">تحميل PDF</button>
        <button type="button" class="btn btn-report btn-report--close" onclick="window.close()">إغلاق</button>
        <a class="btn btn-report btn-report--back" href="index.php?r=addresses">رجوع للقائمة</a>
    </div>
    <script src="<?= htmlspecialchars(\App\Assets::html2pdfJs(), ENT_QUOTES, 'UTF-8') ?>"></script>
    <script>
    (function () {
      'use strict';
      var output = <?= json_encode($output, JSON_UNESCAPED_UNICODE) ?>;
      var pdfName = <?= json_encode($pdfFilename, JSON_UNESCAPED_UNICODE) ?>;

      function notifyParent(ok) {
        if (window.parent === window) { return; }
        try {
          window.parent.postMessage({ type: 'addresses-report-done', ok: ok, output: output }, '*');
        } catch (e) {}
      }

      function runPrint() {
        try {
          window.focus();
          window.print();
          notifyParent(true);
        } catch (e) {
          notifyParent(false);
        }
      }

      function runPdfDownload() {
        var el = document.querySelector('.addresses-report');
        if (!el || typeof html2pdf === 'undefined') {
          runPrint();
          return;
        }
        html2pdf().set({
          margin: [8, 6, 8, 6],
          filename: pdfName,
          pagebreak: {
            mode: ['css', 'legacy'],
            avoid: ['.addresses-report__intro', 'tr']
          },
          html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            scrollY: 0,
            windowWidth: el.scrollWidth
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }
        }).from(el).save().then(function () {
          notifyParent(true);
        }).catch(function () {
          runPrint();
        });
      }

      document.getElementById('addresses-report-print')?.addEventListener('click', runPrint);
      document.getElementById('addresses-report-download')?.addEventListener('click', runPdfDownload);

      window.addEventListener('load', function () {
        setTimeout(function () {
          if (output === 'print') {
            runPrint();
          } else {
            runPdfDownload();
          }
        }, 350);
      });
    })();
    </script>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
