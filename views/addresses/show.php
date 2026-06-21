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
$offlineCfg = \App\Assets::offlineConfig();
$offlineSatAvailable = \App\Assets::offlineSatAvailable();
$allowRemoteTiles = !empty($offlineCfg['allow_remote_tiles']);
$offlineMaxZoom = (int) ($offlineCfg['offline_max_zoom'] ?? 17);
$offlineSatMaxZoom = (int) ($offlineCfg['offline_sat_max_zoom'] ?? 16);
$maxZoomSat = (int) ($mapCfg['max_zoom_satellite'] ?? 17);
$satToggleAvailable = $offlineSatAvailable || $allowRemoteTiles;
$mapPoints = [[
    'lat'   => (float) $row['latitude'],
    'lng'   => (float) $row['longitude'],
    'label' => (string) $row['postal_code'],
    'id'    => (int) $row['id'],
]];
if (!empty($row['parcel_geojson'])) {
    $mapPoints[0]['parcel_geojson'] = (string) $row['parcel_geojson'];
    if (!empty($row['parcel_desc'])) {
        $mapPoints[0]['parcel_desc'] = (string) $row['parcel_desc'];
    }
}
$jsonPoints = json_encode($mapPoints, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

$extraHead = '<link rel="stylesheet" href="' . htmlspecialchars(\App\Assets::leafletCss(), ENT_QUOTES, 'UTF-8') . '">';
$extraFooter  = '<script src="' . htmlspecialchars(\App\Assets::leafletJs(), ENT_QUOTES, 'UTF-8') . '"></script>';
$parcelDisplayJs = 'js/map/parcel_display.js';
$parcelDisplayVer = is_file(dirname(__DIR__, 2) . '/' . $parcelDisplayJs)
    ? (string) filemtime(dirname(__DIR__, 2) . '/' . $parcelDisplayJs)
    : '1';
$extraFooter .= '<script src="' . htmlspecialchars($parcelDisplayJs . '?v=' . $parcelDisplayVer, ENT_QUOTES, 'UTF-8') . '" defer></script>';
$delJs = 'js/addresses/delete_confirm.js';
$delJsVer = is_file(dirname(__DIR__, 2) . '/' . $delJs) ? (string) filemtime(dirname(__DIR__, 2) . '/' . $delJs) : '1';
$extraFooter .= '<script src="' . htmlspecialchars($delJs . '?v=' . $delJsVer, ENT_QUOTES, 'UTF-8') . '" defer></script>';
$addrJs = 'js/addresses_index.js';
$addrJsVer = is_file(dirname(__DIR__, 2) . '/' . $addrJs) ? (string) filemtime(dirname(__DIR__, 2) . '/' . $addrJs) : '1';
$extraFooter .= '<script src="' . htmlspecialchars($addrJs . '?v=' . $addrJsVer, ENT_QUOTES, 'UTF-8') . '" defer></script>';

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
    <?php require dirname(__DIR__) . '/partials/addr_delete_confirm.php'; ?>
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
            <dt>حدود الأرض</dt><dd><?= !empty($row['parcel_geojson']) ? 'مسجّلة على الخريطة' : '<span class="muted">—</span>' ?></dd>
            <?php if (!empty($row['parcel_desc'])): ?>
            <dt>وصف الحدود</dt><dd><?= htmlspecialchars((string) $row['parcel_desc'], ENT_QUOTES, 'UTF-8') ?></dd>
            <?php endif; ?>
        </dl>
        <div class="form-actions" style="margin-top:1rem">
            <a class="btn btn-ghost" href="index.php?r=addresses">رجوع للقائمة</a>
            <?php if (in_array($userRole, ['admin', 'employee'], true)): ?>
                <a class="btn btn-primary" href="index.php?r=address_new&amp;id=<?= (int) $row['id'] ?>">تعديل كامل</a>
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
             data-max-zoom-sat="<?= (int) $maxZoomSat ?>"
             data-offline-max-zoom="<?= (int) $offlineMaxZoom ?>"
             data-offline-sat-max-zoom="<?= (int) $offlineSatMaxZoom ?>"
             data-offline-sat="<?= $offlineSatAvailable ? '1' : '0' ?>"
             data-allow-remote-tiles="<?= $allowRemoteTiles ? '1' : '0' ?>"
             data-mask-url="data/libya-mask-inner-ring.geojson"
             data-visible-mask-url="data/libya-visible-mask-ring.geojson"
             style="display:none" aria-hidden="true"></div>
        <div class="addresses-map-wrap address-show-map-wrap__canvas">
            <div class="addresses-map-layer-switch map-base-layer-switch" role="group" aria-label="نوع الخريطة">
                <button type="button" id="addresses-map-btn-schematic" class="map-base-btn is-active" data-base="offline" aria-pressed="true" title="خريطة مخططية">مخطط</button>
                <button type="button" id="addresses-map-btn-satellite" class="map-base-btn map-base-btn--toggle" data-base="sat" aria-pressed="false" title="صور أقمار صناعية"<?= $satToggleAvailable ? '' : ' disabled' ?>>ستالايت</button>
            </div>
            <div id="addresses-map" class="map-canvas address-show-map" role="application" aria-label="موقع العنوان"></div>
        </div>
        <script type="application/json" id="addresses-map-data"><?= $jsonPoints ?></script>
    </aside>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
