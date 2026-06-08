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

$mapPoints = [];
foreach ($rows as $r) {
    $mapPoints[] = [
        'lat'   => (float) $r['latitude'],
        'lng'   => (float) $r['longitude'],
        'label' => (string) $r['postal_code'] . ' — ' . (string) ($r['owner_name'] ?? ''),
        'id'    => (int) $r['id'],
    ];
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
    ? '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="anonymous">'
    : '';
$extraFooter = '';
if ($hasResults) {
    $extraFooter .= '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="anonymous"></script>';
    $extraFooter .= '<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" crossorigin="anonymous"></script>';
}
$extraFooter .= '<script type="application/json" id="addresses-shabiyat-data">' . $shabiyatJson . '</script>';
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

    <header class="addresses-page__head">
        <div class="addresses-page__heading">
            <h2 class="addresses-page__title">قائمة العناوين</h2>
            <p class="muted addresses-page__lead">عرض وفلترة العناوين المسجّلة. النتائج مرتّبة من الأحدث.</p>
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
                                <th>الولاية / الشعبية</th>
                                <th>عرض/طول</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($rows as $row):
                            $wKey = (string) ($row['wilayah'] ?? '');
                            $wLbl = $wKey !== '' && isset($wLabels[$wKey]) ? $wLabels[$wKey] : '—';
                            $shLbl = (string) ($row['shabiya'] ?? '');
                            $place = $shLbl !== '' ? ($wLbl . ' / ' . $shLbl) : $wLbl;
                        ?>
                            <tr>
                                <td dir="ltr" class="mono"><?= htmlspecialchars($row['postal_code'], ENT_QUOTES, 'UTF-8') ?></td>
                                <td><?= htmlspecialchars((string) ($row['owner_name'] ?? ''), ENT_QUOTES, 'UTF-8') ?></td>
                                <td><?= htmlspecialchars(\App\Models\Address::typeLabelAr((string) $row['type']), ENT_QUOTES, 'UTF-8') ?></td>
                                <td><?= htmlspecialchars($place, ENT_QUOTES, 'UTF-8') ?></td>
                                <td dir="ltr" class="mono"><?= htmlspecialchars($row['latitude'] . ', ' . $row['longitude'], ENT_QUOTES, 'UTF-8') ?></td>
                                <td class="cell-actions">
                                    <a class="btn btn-ghost" href="index.php?r=address_show&amp;id=<?= (int) $row['id'] ?>">تفاصيل</a>
                                    <?php if ($isStaff): ?>
                                        <a class="btn btn-ghost" href="index.php?r=address_edit&amp;id=<?= (int) $row['id'] ?>">تعديل</a>
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
                <aside class="addresses-map-side" aria-label="خريطة النتائج">
                    <div class="addresses-map-side__head">
                        <p class="map-instructions muted">النقاط = نتائج هذه الصفحة.</p>
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
                         data-mask-url="data/libya-mask-inner-ring.geojson"
                         style="display:none" aria-hidden="true"></div>
                    <div class="addresses-map-wrap">
                        <div id="addresses-map" class="map-canvas map-canvas--search" role="application" aria-label="خريطة نتائج العناوين"></div>
                    </div>
                    <script type="application/json" id="addresses-map-data"><?= $jsonPoints ?></script>
                </aside>
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
        <?php endif; ?>
    </section>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
