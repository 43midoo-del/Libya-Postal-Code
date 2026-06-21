<?php
/**
 * Unified addresses list: filters + table + map + pagination.
 *
 * @var string $appName
 * @var string $title
 * @var list<array<string, mixed>> $rows
 * @var int $total
 * @var int $page
 * @var int $perPage
 * @var int $pages
 * @var array{q: string, wilayah: string, shabiya: string, type: string} $filters
 * @var array{wilayah: array<string, string>, shabiyat: list<array{name: string, wilayah: string, code?: string}>} $libya
 * @var array $mapCfg
 * @var string $userName
 * @var string $userRole
 * @var string $navCurrent
 * @var string $csrf
 * @var array{m: string, t: string}|null $flash
 */
$flash = $flash ?? null;
$isStaff = in_array($userRole, ['admin', 'employee'], true);
$b = $mapCfg['libya_bounds'];
$center = $mapCfg['default_center'];
$offlineCfg = \App\Assets::offlineConfig();
$offlineSatAvailable = \App\Assets::offlineSatAvailable();
$allowRemoteTiles = !empty($offlineCfg['allow_remote_tiles']);
$offlineMaxZoom = (int) ($offlineCfg['offline_max_zoom'] ?? 17);
$offlineSatMaxZoom = (int) ($offlineCfg['offline_sat_max_zoom'] ?? 16);
$maxZoomSat = (int) ($mapCfg['max_zoom_satellite'] ?? 17);
$satToggleAvailable = $offlineSatAvailable || $allowRemoteTiles;

$mapPoints = [];
foreach ($rows as $r) {
    $pt = [
        'lat'   => (float) $r['latitude'],
        'lng'   => (float) $r['longitude'],
        'label' => (string) $r['postal_code'] . ' — ' . (string) ($r['owner_name'] ?? ''),
        'id'    => (int) $r['id'],
    ];
    if (!empty($r['parcel_geojson'])) {
        $pt['parcel_geojson'] = (string) $r['parcel_geojson'];
        if (!empty($r['parcel_desc'])) {
            $pt['parcel_desc'] = (string) $r['parcel_desc'];
        }
    }
    $mapPoints[] = $pt;
}
$jsonPoints = json_encode($mapPoints, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

$shabiyaPayload = [];
foreach ($libya['shabiyat'] as $sh) {
    $shabiyaPayload[] = [
        'name'    => (string) ($sh['name'] ?? ''),
        'wilayah' => (string) ($sh['wilayah'] ?? ''),
        'code'    => (string) ($sh['code'] ?? ''),
    ];
}
$shabiyatJson = json_encode($shabiyaPayload, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

$hasResults = count($rows) > 0;
$extraHead = $hasResults
    ? '<link rel="stylesheet" href="' . htmlspecialchars(\App\Assets::leafletCss(), ENT_QUOTES, 'UTF-8') . '">'
    : '';
$extraFooter = '';
if ($hasResults) {
    $extraFooter .= '<script src="' . htmlspecialchars(\App\Assets::leafletJs(), ENT_QUOTES, 'UTF-8') . '"></script>';
    $extraFooter .= '<script src="' . htmlspecialchars(\App\Assets::html2canvasJs(), ENT_QUOTES, 'UTF-8') . '"></script>';
    $parcelDisplayJs = 'js/map/parcel_display.js';
    $parcelDisplayVer = is_file(dirname(__DIR__, 2) . '/' . $parcelDisplayJs)
        ? (string) filemtime(dirname(__DIR__, 2) . '/' . $parcelDisplayJs)
        : '1';
    $extraFooter .= '<script src="' . htmlspecialchars($parcelDisplayJs . '?v=' . $parcelDisplayVer, ENT_QUOTES, 'UTF-8') . '" defer></script>';
}
$extraFooter .= '<script type="application/json" id="addresses-shabiyat-data">' . $shabiyatJson . '</script>';
$delJs = 'js/addresses/delete_confirm.js';
$delJsVer = is_file(dirname(__DIR__, 2) . '/' . $delJs) ? (string) filemtime(dirname(__DIR__, 2) . '/' . $delJs) : '1';
$extraFooter .= '<script src="' . htmlspecialchars($delJs . '?v=' . $delJsVer, ENT_QUOTES, 'UTF-8') . '" defer></script>';
$addrJs = 'js/addresses_index.js';
$addrJsVer = is_file(dirname(__DIR__, 2) . '/' . $addrJs) ? (string) filemtime(dirname(__DIR__, 2) . '/' . $addrJs) : '1';
$extraFooter .= '<script src="' . htmlspecialchars($addrJs . '?v=' . $addrJsVer, ENT_QUOTES, 'UTF-8') . '" defer></script>';
$topbarExtraClass = 'topbar--addresses';

require dirname(__DIR__) . '/partials/head.php';
require dirname(__DIR__) . '/partials/app_header.php';

$wLabels = $libya['wilayah'];

$pageQuery = static function (array $overrides) use ($filters): string {
    $params = [
        'r'       => 'addresses',
        'q'       => $filters['q'],
        'wilayah' => $filters['wilayah'],
        'shabiya' => $filters['shabiya'],
        'type'    => $filters['type'],
    ];
    foreach ($overrides as $k => $v) {
        $params[$k] = $v;
    }
    $params = array_filter($params, static fn ($v) => $v !== '' && $v !== null);
    return 'index.php?' . http_build_query($params);
};
?>
<main id="main-content" class="addresses-page main-panel">
    <?php require dirname(__DIR__) . '/partials/flash.php'; ?>
    <?php require dirname(__DIR__) . '/partials/addr_delete_confirm.php'; ?>

    <header class="addresses-page__head">
        <div class="addresses-page__heading">
            <h2 class="addresses-page__title">قائمة العناوين</h2>
        </div>
        <?php if ($isStaff): ?>
        <a class="btn btn-primary addresses-page__add" href="index.php?r=address_new">إضافة عنوان</a>
        <?php endif; ?>
    </header>

    <form class="addresses-filters" method="get" action="index.php" role="search">
        <input type="hidden" name="r" value="addresses">
        <div class="addresses-filters__row">
            <div class="addresses-filters__cell addresses-filters__cell--grow">
                <label class="form-label" for="addr-q">بحث</label>
                <input class="form-input" type="search" name="q" id="addr-q"
                       value="<?= htmlspecialchars($filters['q'], ENT_QUOTES, 'UTF-8') ?>"
                       placeholder="كود بريدي، اسم المالك، أو إحداثيات (عرض، طول)" maxlength="200" autocomplete="off"
                       dir="auto">
            </div>
            <div class="addresses-filters__cell">
                <label class="form-label" for="addr-wilayah">الولاية</label>
                <select class="form-input" name="wilayah" id="addr-wilayah">
                    <option value="">الكل</option>
                    <?php foreach ($wLabels as $key => $lbl): ?>
                        <option value="<?= htmlspecialchars($key, ENT_QUOTES, 'UTF-8') ?>" <?= $filters['wilayah'] === $key ? 'selected' : '' ?>>
                            <?= htmlspecialchars($lbl, ENT_QUOTES, 'UTF-8') ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="addresses-filters__cell">
                <label class="form-label" for="addr-shabiya">الشعبية</label>
                <select class="form-input" name="shabiya" id="addr-shabiya">
                    <option value="">الكل</option>
                    <?php foreach ($libya['shabiyat'] as $sh):
                        $nm = (string) ($sh['name'] ?? '');
                        if ($nm === '') {
                            continue;
                        }
                        $wKey = (string) ($sh['wilayah'] ?? '');
                        $hide = $filters['wilayah'] !== '' && $filters['wilayah'] !== $wKey;
                    ?>
                        <option value="<?= htmlspecialchars($nm, ENT_QUOTES, 'UTF-8') ?>"
                                data-wilayah="<?= htmlspecialchars($wKey, ENT_QUOTES, 'UTF-8') ?>"
                                <?= $filters['shabiya'] === $nm ? 'selected' : '' ?>
                                <?= $hide ? 'hidden' : '' ?>>
                            <?= htmlspecialchars($nm, ENT_QUOTES, 'UTF-8') ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="addresses-filters__cell">
                <label class="form-label" for="addr-type">النوع</label>
                <select class="form-input" name="type" id="addr-type">
                    <option value="">الكل</option>
                    <option value="residential" <?= $filters['type'] === 'residential' ? 'selected' : '' ?>>سكني</option>
                    <option value="government" <?= $filters['type'] === 'government' ? 'selected' : '' ?>>حكومي</option>
                    <option value="commercial" <?= $filters['type'] === 'commercial' ? 'selected' : '' ?>>تجاري</option>
                </select>
            </div>
        </div>
        <div class="addresses-filters__actions">
            <button class="btn btn-primary" type="submit">تطبيق</button>
            <a class="btn btn-ghost" href="index.php?r=addresses">مسح الفلاتر</a>
            <button class="btn btn-ghost addresses-filters__print" type="button" id="addr-print-btn" title="طباعة كشف بكل العناوين المطابقة للفلتر">طباعة</button>
        </div>
    </form>

    <section class="addresses-results" aria-live="polite">
        <div class="addresses-results__meta">
            <span class="addresses-results__count"><strong><?= (int) $total ?></strong> سجل</span>
            <?php if ($total > 0): ?>
                <span class="muted">صفحة <?= (int) $page ?> من <?= (int) $pages ?></span>
            <?php endif; ?>
        </div>

        <?php if (!$hasResults): ?>
            <p class="alert empty-result" role="status">لا توجد عناوين مطابقة للفلاتر المختارة.</p>
        <?php else: ?>
            <div class="addresses-grid">
                <div class="addresses-table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>الكود</th>
                                <th>المالك</th>
                                <th>النوع</th>
                                <th>العنوان</th>
                                <th>عرض/طول</th>
                                <th>تاريخ الإضافة</th>
                                <th>بواسطة</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($rows as $row):
                            $place = \App\Models\Address::formatPlaceSequence($row);
                        ?>
                            <tr>
                                <td dir="ltr" class="mono"><?= htmlspecialchars($row['postal_code'], ENT_QUOTES, 'UTF-8') ?></td>
                                <td><?= htmlspecialchars((string) ($row['owner_name'] ?? ''), ENT_QUOTES, 'UTF-8') ?></td>
                                <td><?= htmlspecialchars(\App\Models\Address::typeLabelAr((string) $row['type']), ENT_QUOTES, 'UTF-8') ?></td>
                                <td><?= htmlspecialchars($place, ENT_QUOTES, 'UTF-8') ?></td>
                                <td dir="ltr" class="mono"><?= htmlspecialchars($row['latitude'] . ', ' . $row['longitude'], ENT_QUOTES, 'UTF-8') ?></td>
                                <?php
                                    $createdAt = (string) ($row['created_at'] ?? '');
                                    if ($createdAt !== '') {
                                        $ts = strtotime($createdAt);
                                        if ($ts !== false) {
                                            $createdAt = date('Y-m-d H:i', $ts);
                                        }
                                    }
                                    $createdBy = trim((string) ($row['created_by_name'] ?? ''));
                                ?>
                                <td dir="ltr" class="mono"><?php if ($createdAt !== ''): ?><?= htmlspecialchars($createdAt, ENT_QUOTES, 'UTF-8') ?><?php else: ?><span class="muted">—</span><?php endif; ?></td>
                                <td><?php if ($createdBy !== ''): ?><?= htmlspecialchars($createdBy, ENT_QUOTES, 'UTF-8') ?><?php else: ?><span class="muted">—</span><?php endif; ?></td>
                                <td class="cell-actions">
                                    <a class="btn btn-ghost" href="index.php?r=address_show&amp;id=<?= (int) $row['id'] ?>">تفاصيل</a>
                                    <?php if ($isStaff): ?>
                                        <a class="btn btn-ghost" href="index.php?r=address_new&amp;id=<?= (int) $row['id'] ?>">تعديل</a>
                                        <form method="post" action="index.php?r=address_delete" class="inline-form js-confirm-delete">
                                            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                                            <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
                                            <button class="btn btn-ghost" type="submit">حذف</button>
                                        </form>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>

            <?php if ($pages > 1):
                $prev = max(1, $page - 1);
                $next = min($pages, $page + 1);
                $start = max(1, $page - 2);
                $end = min($pages, $page + 2);
            ?>
            <nav class="addresses-pagination" aria-label="ترقيم الصفحات">
                <a class="btn btn-ghost addresses-pagination__nav<?= $page <= 1 ? ' is-disabled' : '' ?>"
                   <?= $page <= 1 ? 'aria-disabled="true" tabindex="-1"' : 'href="' . htmlspecialchars($pageQuery(['page' => $prev]), ENT_QUOTES, 'UTF-8') . '"' ?>>السابق</a>
                <?php if ($start > 1): ?>
                    <a class="addresses-pagination__num" href="<?= htmlspecialchars($pageQuery(['page' => 1]), ENT_QUOTES, 'UTF-8') ?>">1</a>
                    <?php if ($start > 2): ?><span class="addresses-pagination__dots">…</span><?php endif; ?>
                <?php endif; ?>
                <?php for ($p = $start; $p <= $end; $p++): ?>
                    <?php if ($p === $page): ?>
                        <span class="addresses-pagination__num is-current" aria-current="page"><?= (int) $p ?></span>
                    <?php else: ?>
                        <a class="addresses-pagination__num" href="<?= htmlspecialchars($pageQuery(['page' => $p]), ENT_QUOTES, 'UTF-8') ?>"><?= (int) $p ?></a>
                    <?php endif; ?>
                <?php endfor; ?>
                <?php if ($end < $pages): ?>
                    <?php if ($end < $pages - 1): ?><span class="addresses-pagination__dots">…</span><?php endif; ?>
                    <a class="addresses-pagination__num" href="<?= htmlspecialchars($pageQuery(['page' => $pages]), ENT_QUOTES, 'UTF-8') ?>"><?= (int) $pages ?></a>
                <?php endif; ?>
                <a class="btn btn-ghost addresses-pagination__nav<?= $page >= $pages ? ' is-disabled' : '' ?>"
                   <?= $page >= $pages ? 'aria-disabled="true" tabindex="-1"' : 'href="' . htmlspecialchars($pageQuery(['page' => $next]), ENT_QUOTES, 'UTF-8') . '"' ?>>التالي</a>
            </nav>
            <?php endif; ?>

                <aside class="addresses-map-side" aria-label="خريطة النتائج">
                    <div class="addresses-map-side__head">
                        <button type="button" class="btn btn-ghost addresses-map-side__export" id="addr-map-export" title="تصدير صورة الخريطة مع علامات العناوين للطباعة">تصدير صورة الخريطة</button>
                    </div>
                    <div id="addresses-map-root" class="map-config"
                         data-sw-lat="<?= htmlspecialchars((string) $b['south'], ENT_QUOTES, 'UTF-8') ?>"
                         data-sw-lng="<?= htmlspecialchars((string) $b['west'], ENT_QUOTES, 'UTF-8') ?>"
                         data-ne-lat="<?= htmlspecialchars((string) $b['north'], ENT_QUOTES, 'UTF-8') ?>"
                         data-ne-lng="<?= htmlspecialchars((string) $b['east'], ENT_QUOTES, 'UTF-8') ?>"
                         data-center-lat="<?= htmlspecialchars((string) $center[0], ENT_QUOTES, 'UTF-8') ?>"
                         data-center-lng="<?= htmlspecialchars((string) $center[1], ENT_QUOTES, 'UTF-8') ?>"
                         data-zoom="7"
                         data-min-zoom="<?= (int) $mapCfg['min_zoom'] ?>"
                         data-max-zoom="<?= (int) $mapCfg['max_zoom'] ?>"
                         data-max-zoom-sat="<?= (int) $maxZoomSat ?>"
                         data-offline-max-zoom="<?= (int) $offlineMaxZoom ?>"
                         data-offline-sat-max-zoom="<?= (int) $offlineSatMaxZoom ?>"
                         data-offline-sat="<?= $offlineSatAvailable ? '1' : '0' ?>"
                         data-allow-remote-tiles="<?= $allowRemoteTiles ? '1' : '0' ?>"
                         data-mask-url="data/libya-mask-inner-ring.geojson"
                         data-visible-mask-url="data/libya-visible-mask-ring.geojson"
                         style="display:none" aria-hidden="true"></div>
                    <div class="addresses-map-wrap">
                        <div class="addresses-map-layer-switch map-base-layer-switch" role="group" aria-label="نوع الخريطة">
                            <button type="button" id="addresses-map-btn-schematic" class="map-base-btn is-active" data-base="offline" aria-pressed="true" title="خريطة مخططية">مخطط</button>
                            <button type="button" id="addresses-map-btn-satellite" class="map-base-btn map-base-btn--toggle" data-base="sat" aria-pressed="false" title="صور أقمار صناعية"<?= $satToggleAvailable ? '' : ' disabled' ?>>ستالايت</button>
                        </div>
                        <div id="addresses-map" class="map-canvas map-canvas--search" role="application" aria-label="خريطة نتائج العناوين"></div>
                    </div>
                    <script type="application/json" id="addresses-map-data"><?= $jsonPoints ?></script>
                </aside>
            </div>
        <?php endif; ?>
    </section>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
