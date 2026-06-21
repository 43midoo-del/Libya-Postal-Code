<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $csrf
 * @var array{m:string,t:string}|null $flash
 * @var array{south:float,west:float,north:float,east:float} $bounds
 * @var bool $available
 * @var array{tiles:int,zooms:array<int,int>,size_bytes:int} $stats
 * @var list<array<string,mixed>> $logs
 * @var int $hardLimit
 */
$flash = $flash ?? null;
$extraHead  = '<link rel="stylesheet" href="' . htmlspecialchars(\App\Assets::leafletCss(), ENT_QUOTES, 'UTF-8') . '">';
$extraHead .= '<link rel="stylesheet" href="css/tile_sync.css">';
$extraFooter  = '<script src="' . htmlspecialchars(\App\Assets::leafletJs(), ENT_QUOTES, 'UTF-8') . '"></script>';
$extraFooter .= '<script src="js/tile_sync.js" defer></script>';

require dirname(__DIR__, 2) . '/partials/head.php';
require dirname(__DIR__, 2) . '/partials/app_header.php';
?>
<main id="main-content" class="main-panel tile-sync" dir="rtl">
    <?php require dirname(__DIR__, 2) . '/partials/flash.php'; ?>

    <header class="tile-sync__head">
        <div>
            <h2 class="tile-sync__title">مزامنة بلاطات الخريطة (Offline)</h2>
            <p class="muted">حمّل البلاطات لمنطقة من ليبيا لاستخدامها لاحقاً بدون اتصال إنترنت. الملف يُحفظ في <code dir="ltr">data/tiles/libya.mbtiles</code>.</p>
        </div>
    </header>

    <?php if (!$available): ?>
    <div class="alert alert-err">إضافة <code>pdo_sqlite</code> غير مفعّلة في PHP. فعّلها أولاً من <code>php.ini</code>.</div>
    <?php endif; ?>

    <section class="tile-sync__grid">
        <div class="tile-sync__map-wrap">
            <div
                id="ts-map"
                class="map-canvas"
                data-sw-lat="<?= htmlspecialchars((string) $bounds['south'], ENT_QUOTES, 'UTF-8') ?>"
                data-sw-lng="<?= htmlspecialchars((string) $bounds['west'], ENT_QUOTES, 'UTF-8') ?>"
                data-ne-lat="<?= htmlspecialchars((string) $bounds['north'], ENT_QUOTES, 'UTF-8') ?>"
                data-ne-lng="<?= htmlspecialchars((string) $bounds['east'], ENT_QUOTES, 'UTF-8') ?>"
                aria-label="خريطة لاختيار النطاق"
            ></div>
            <p class="muted small">اسحب على الخريطة لتحديد المستطيل، أو اكتب الإحداثيات يدوياً جهة اليسار.</p>
        </div>

        <aside class="tile-sync__panel">
            <h4>نطاق التحميل</h4>
            <form id="ts-form" class="form-stack" autocomplete="off">
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                <div class="grid-2">
                    <label class="form-label">شمال (lat) <input class="form-input mono" dir="ltr" type="number" step="any" name="north" id="ts-north" value="<?= htmlspecialchars((string) $bounds['north'], ENT_QUOTES, 'UTF-8') ?>"></label>
                    <label class="form-label">جنوب (lat) <input class="form-input mono" dir="ltr" type="number" step="any" name="south" id="ts-south" value="<?= htmlspecialchars((string) $bounds['south'], ENT_QUOTES, 'UTF-8') ?>"></label>
                    <label class="form-label">شرق (lng) <input class="form-input mono" dir="ltr" type="number" step="any" name="east" id="ts-east" value="<?= htmlspecialchars((string) $bounds['east'], ENT_QUOTES, 'UTF-8') ?>"></label>
                    <label class="form-label">غرب (lng) <input class="form-input mono" dir="ltr" type="number" step="any" name="west" id="ts-west" value="<?= htmlspecialchars((string) $bounds['west'], ENT_QUOTES, 'UTF-8') ?>"></label>
                </div>
                <div class="grid-2">
                    <label class="form-label">أقل تكبير
                        <select name="zmin" id="ts-zmin" class="form-input">
                            <?php for ($i = 0; $i <= 16; $i++): ?>
                            <option value="<?= $i ?>" <?= $i === 5 ? 'selected' : '' ?>><?= $i ?></option>
                            <?php endfor; ?>
                        </select>
                    </label>
                    <label class="form-label">أعلى تكبير
                        <select name="zmax" id="ts-zmax" class="form-input">
                            <?php for ($i = 0; $i <= 18; $i++): ?>
                            <option value="<?= $i ?>" <?= $i === 10 ? 'selected' : '' ?>><?= $i ?></option>
                            <?php endfor; ?>
                        </select>
                    </label>
                </div>
                <label class="form-label">المصدر
                    <select name="source" id="ts-source" class="form-input">
                        <option value="osm">OpenStreetMap (افتراضي)</option>
                        <option value="osm-de">OSM.de</option>
                        <option value="esri-sat">Esri World Imagery (أقمار)</option>
                    </select>
                </label>
                <div class="ts-estimate" id="ts-estimate">عدد البلاطات المتوقع: —</div>
                <p class="muted small">الحد الأقصى لكل عملية: <strong dir="ltr"><?= (int) $hardLimit ?></strong> بلاطة. الكميات الأكبر قسّمها على عدة مزامنات صغيرة.</p>
                <div class="tile-sync__actions">
                    <button class="btn btn-primary" type="submit" id="ts-run">بدء التحميل</button>
                    <button class="btn btn-ghost" type="button" id="ts-cancel">إلغاء العملية الجارية</button>
                </div>
            </form>
        </aside>
    </section>

    <section class="tile-sync__stats">
        <h4>إحصائيات الذاكرة المحلية</h4>
        <dl>
            <dt>إجمالي البلاطات</dt><dd class="mono" id="ts-stat-total"><?= number_format((int) $stats['tiles']) ?></dd>
            <dt>حجم الملف</dt><dd class="mono" id="ts-stat-size"><?= number_format((int) $stats['size_bytes'] / 1024, 1) ?> KB</dd>
            <dt>التكبير</dt><dd class="mono" id="ts-stat-zooms"><?php
                if (!empty($stats['zooms'])) {
                    $parts = [];
                    foreach ($stats['zooms'] as $z => $c) { $parts[] = "z{$z}={$c}"; }
                    echo htmlspecialchars(implode(', ', $parts), ENT_QUOTES, 'UTF-8');
                } else {
                    echo '—';
                }
            ?></dd>
        </dl>
    </section>

    <section class="tile-sync__logs">
        <h4>سجل العمليات</h4>
        <div class="addresses-table-wrap">
            <table class="data-table">
                <thead>
                    <tr><th>#</th><th>الحالة</th><th>التكبير</th><th>المطلوب</th><th>تحميل</th><th>فشل</th><th>المصدر</th><th>البدء</th><th>الانتهاء</th></tr>
                </thead>
                <tbody id="ts-logs-body">
                    <?php foreach ($logs as $log): ?>
                    <tr>
                        <td class="mono"><?= (int) $log['id'] ?></td>
                        <td><?= htmlspecialchars((string) $log['status'], ENT_QUOTES, 'UTF-8') ?></td>
                        <td class="mono"><?= (int) $log['zmin'] ?>–<?= (int) $log['zmax'] ?></td>
                        <td class="mono"><?= (int) $log['tiles_requested'] ?></td>
                        <td class="mono"><?= (int) $log['tiles_downloaded'] ?></td>
                        <td class="mono"><?= (int) $log['tiles_failed'] ?></td>
                        <td><?= htmlspecialchars((string) $log['source'], ENT_QUOTES, 'UTF-8') ?></td>
                        <td class="mono"><?= htmlspecialchars((string) $log['started_at'], ENT_QUOTES, 'UTF-8') ?></td>
                        <td class="mono"><?= htmlspecialchars((string) ($log['finished_at'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </section>

    <div id="ts-status" class="tile-sync__status" role="status" aria-live="polite"></div>
</main>
<?php require dirname(__DIR__, 2) . '/partials/foot.php';
