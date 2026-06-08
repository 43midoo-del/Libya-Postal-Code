<?php
/**
 * @var string $appName
 * @var string $title
 * @var array  $row
 * @var array  $mapCfg
 * @var string $userName
 * @var string $userRole
 * @var string $navCurrent
 * @var string $csrf
 * @var array{m: string, t: string}|null $flash
 */
$flash = $flash ?? null;
$b = $mapCfg['libya_bounds'];
$center = [(float) $row['latitude'], (float) $row['longitude']];
$mapPoints = [[
    'lat'   => (float) $row['latitude'],
    'lng'   => (float) $row['longitude'],
    'label' => (string) $row['postal_code'],
    'id'    => (int) $row['id'],
]];
$jsonPoints = json_encode($mapPoints, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

$extraHead = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="anonymous">';
$extraFooter  = '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="anonymous"></script>';
$extraFooter .= '<script src="js/addresses_index.js" defer></script>';

require dirname(__DIR__) . '/partials/head.php';
require dirname(__DIR__) . '/partials/app_header.php';

$wAr = match ((string) ($row['wilayah'] ?? '')) {
    'barqa'        => 'برقة',
    'tripolitania' => 'طرابلس',
    'fezzan'       => 'فزان',
    default        => '—',
};
?>
<main id="main-content" class="content main-panel address-show-page">
    <?php require dirname(__DIR__) . '/partials/flash.php'; ?>
    <section class="address-show-card">
        <h2 style="margin:0 0 0.6rem">تفاصيل العنوان #<?= (int) $row['id'] ?></h2>
        <p style="margin:0 0 0.85rem"><span class="postal-pill"><?= htmlspecialchars($row['postal_code'], ENT_QUOTES, 'UTF-8') ?></span></p>
        <dl>
            <dt>اسم الحامل</dt><dd><?= $row['owner_name'] !== null ? htmlspecialchars($row['owner_name'], ENT_QUOTES, 'UTF-8') : '<span class="muted">—</span>' ?></dd>
            <dt>النوع</dt><dd><?= htmlspecialchars(\App\Models\Address::typeLabelAr((string) $row['type']), ENT_QUOTES, 'UTF-8') ?></dd>
            <dt>الولاية</dt><dd><?= htmlspecialchars($wAr, ENT_QUOTES, 'UTF-8') ?></dd>
            <dt>الشعبية</dt><dd><?= htmlspecialchars((string) ($row['shabiya'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
            <dt>المدينة / المنطقة</dt><dd><?= htmlspecialchars((string) ($row['locality'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
            <dt>رقم القطعة / الشارع</dt><dd><?= htmlspecialchars((string) ($row['street_number'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
            <dt>بيان إضافي / شقة</dt><dd><?= htmlspecialchars((string) ($row['apartment_number'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
            <dt>خط العرض</dt><dd dir="ltr" class="mono"><?= htmlspecialchars((string) $row['latitude'], ENT_QUOTES, 'UTF-8') ?></dd>
            <dt>خط الطول</dt><dd dir="ltr" class="mono"><?= htmlspecialchars((string) $row['longitude'], ENT_QUOTES, 'UTF-8') ?></dd>
        </dl>
        <div class="form-actions" style="margin-top:1rem">
            <a class="btn btn-ghost" href="index.php?r=addresses">رجوع للقائمة</a>
            <?php if (in_array($userRole, ['admin', 'employee'], true)): ?>
                <a class="btn btn-primary" href="index.php?r=address_edit&amp;id=<?= (int) $row['id'] ?>">تعديل كامل</a>
                <form method="post" action="index.php?r=address_delete" class="inline-form js-confirm-delete">
                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                    <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
                    <button class="btn btn-ghost" type="submit">حذف</button>
                </form>
            <?php endif; ?>
        </div>
    </section>

    <aside class="address-show-map-wrap">
        <div id="addresses-map-root" class="map-config"
             data-sw-lat="<?= htmlspecialchars((string) $b['south'], ENT_QUOTES, 'UTF-8') ?>"
             data-sw-lng="<?= htmlspecialchars((string) $b['west'], ENT_QUOTES, 'UTF-8') ?>"
             data-ne-lat="<?= htmlspecialchars((string) $b['north'], ENT_QUOTES, 'UTF-8') ?>"
             data-ne-lng="<?= htmlspecialchars((string) $b['east'], ENT_QUOTES, 'UTF-8') ?>"
             data-center-lat="<?= htmlspecialchars((string) $center[0], ENT_QUOTES, 'UTF-8') ?>"
             data-center-lng="<?= htmlspecialchars((string) $center[1], ENT_QUOTES, 'UTF-8') ?>"
             data-zoom="14"
             data-min-zoom="<?= (int) $mapCfg['min_zoom'] ?>"
             data-max-zoom="<?= (int) $mapCfg['max_zoom'] ?>"
             style="display:none" aria-hidden="true"></div>
        <div id="addresses-map" class="map-canvas address-show-map" role="application" aria-label="موقع العنوان"></div>
        <script type="application/json" id="addresses-map-data"><?= $jsonPoints ?></script>
    </aside>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
