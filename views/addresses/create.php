<?php
/**
 * Unified address dashboard (3-column GIS layout).
 *
 * @var list<array<string, mixed>> $mapRegions
 * @var list<array{code: string, lat: float, lng: float}> $mapLabels
 * @var array|null $editRow
 * @var int $editId
 * @var string $appShellClass
 */
$appShellClass = $appShellClass ?? '';
$userName = $userName ?? '';
$userRole = $userRole ?? 'citizen';
$flash = $flash ?? null;
$editRow = $editRow ?? null;
$editId = (int) ($editId ?? 0);
$mapRegions = $mapRegions ?? [];
$mapLabels = $mapLabels ?? [];
$shabiyaCityPlaces = $shabiyaCityPlaces ?? ['byCode' => [], 'byName' => []];
$libya = $libya ?? ['wilayah' => [], 'shabiyat' => []];
/* pc_area = الرقم 1–22 من لاحقة `code` (B2→2 … F22→22)، بغضّ النظر عن ترتيب المصفوفة. */
$shabiyaToN = [];
foreach ($libya['shabiyat'] as $shRow) {
    $code = trim((string) ($shRow['code'] ?? ''));
    $name = (string) ($shRow['name'] ?? '');
    if ($name === '' || $code === '' || !preg_match('/(\d+)$/', $code, $m)) {
        continue;
    }
    $shabiyaToN[$name] = (int) $m[1];
}
$sortedShabiyatRows = $libya['shabiyat'];
usort($sortedShabiyatRows, static function (array $a, array $b): int {
    $ca = trim((string) ($a['code'] ?? ''));
    $cb = trim((string) ($b['code'] ?? ''));
    $na = 99999;
    $nb = 99999;
    if (preg_match('/(\d+)$/', $ca, $ma)) {
        $na = (int) $ma[1];
    }
    if (preg_match('/(\d+)$/', $cb, $mb)) {
        $nb = (int) $mb[1];
    }
    return $na <=> $nb;
});
$initialShabiyatTrip = [];
foreach ($sortedShabiyatRows as $row) {
    if (($row['wilayah'] ?? '') === 'tripolitania') {
        $initialShabiyatTrip[] = $row;
    }
}
$b = $mapCfg['libya_bounds'];
$center = $mapCfg['default_center'];
$swLat = $b['south'];
$swLng = $b['west'];
$neLat = $b['north'];
$neLng = $b['east'];
$centerLat = $center[0];
$centerLng = $center[1];
$zoom = (int) $mapCfg['default_zoom'];
$minZoom = (int) $mapCfg['min_zoom'];
$maxZoom = (int) $mapCfg['max_zoom'];
$maxZoomSat = (int) ($mapCfg['max_zoom_satellite'] ?? 17);
$mapSatelliteDefault = true;
$initialLat = $editRow !== null ? (string) $editRow['latitude'] : '';
$initialLng = $editRow !== null ? (string) $editRow['longitude'] : '';

/* إضافة: شريط السياق فارغ من SSR؛ التعديل: يُعبّأ من السجل (لا تعتمد على JS). */
if ($editRow === null) {
    $ctxShabiyaChip = '';
    $ctxPlace = '';
    $ctxWilayah = '';
    $ctxProv = '';
} else {
    $ctxShabiyaChip = '—';
    $ctxPlace = '—';
    $ctxWilayah = '—';
    $ctxProv = '—';
}

if ($editRow !== null) {
    $sh = trim((string) ($editRow['shabiya'] ?? ''));
    $loc = trim((string) ($editRow['locality'] ?? ''));
    $ctxPlace = $sh !== '' ? $sh : ($loc !== '' ? $loc : '—');
    $codeForChip = '';
    foreach ($libya['shabiyat'] as $shRow) {
        if (($shRow['name'] ?? '') === $sh && ($sh !== '')) {
            $codeForChip = trim((string) ($shRow['code'] ?? ''));
            break;
        }
    }
    if ($codeForChip !== '' && $sh !== '') {
        $ctxShabiyaChip = $codeForChip . ' ' . $sh;
    } elseif ($codeForChip !== '') {
        $ctxShabiyaChip = $codeForChip;
    } elseif ($sh !== '') {
        $ctxShabiyaChip = $sh;
    } else {
        $ctxShabiyaChip = '—';
    }
    $p = isset($editRow['pc_province']) && $editRow['pc_province'] !== null ? (string) $editRow['pc_province'] : '';
    if ($p === 'B') {
        $ctxWilayah = 'برقة';
        $ctxProv = 'B';
    } elseif ($p === 'T') {
        $ctxWilayah = 'طرابلس';
        $ctxProv = 'T';
    } elseif ($p === 'F') {
        $ctxWilayah = 'فزان';
        $ctxProv = 'F';
    }
}

$bodyClass = 'addr-dashboard-one-screen';

$assetUrl = static function (string $rel): string {
    $abs = dirname(__DIR__, 2) . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    return $rel . '?v=' . (is_file($abs) ? (string) filemtime($abs) : '0');
};

$extraHead = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="anonymous">';
$regionsJson = json_encode($mapRegions, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$extraFooter = '<script type="application/json" id="postal-map-regions-data">' . $regionsJson . '</script>';
$shabiyatJson = json_encode($libya['shabiyat'], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$extraFooter .= '<script type="application/json" id="libya-shabiyat-data">' . $shabiyatJson . '</script>';
$shabiyaPlacesJson = json_encode($shabiyaCityPlaces, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$extraFooter .= '<script type="application/json" id="shabiya-city-places-data">' . $shabiyaPlacesJson . '</script>';
$provinceColors = $provinceColors ?? ['B' => '#ef4444', 'T' => '#22c55e', 'F' => '#cbd5e1'];
$pcJson = json_encode($provinceColors, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$extraFooter .= '<script type="application/json" id="province-colors-data">' . $pcJson . '</script>';
$extraFooter .= '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="anonymous"></script>';
$extraFooter .= '<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" crossorigin="anonymous"></script>';
$extraFooter .= '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>';
$extraFooter .= '<script src="' . htmlspecialchars($assetUrl('js/map/province_colors.js'), ENT_QUOTES, 'UTF-8') . '"></script>';
$extraFooter .= '<script src="' . htmlspecialchars($assetUrl('js/map/core.js'), ENT_QUOTES, 'UTF-8') . '" defer></script>';
$extraFooter .= '<script src="' . htmlspecialchars($assetUrl('js/map/labels.js'), ENT_QUOTES, 'UTF-8') . '" defer></script>';
$extraFooter .= '<script src="' . htmlspecialchars($assetUrl('js/map/shabiyat.js'), ENT_QUOTES, 'UTF-8') . '" defer></script>';
$extraFooter .= '<script src="' . htmlspecialchars($assetUrl('js/map/zoom-nav.js'), ENT_QUOTES, 'UTF-8') . '" defer></script>';
$extraFooter .= '<script src="' . htmlspecialchars($assetUrl('js/map/parcel.js'), ENT_QUOTES, 'UTF-8') . '" defer></script>';
$extraFooter .= '<script src="' . htmlspecialchars($assetUrl('js/addresses/form.js'), ENT_QUOTES, 'UTF-8') . '" defer></script>';
$extraFooter .= '<script src="' . htmlspecialchars($assetUrl('js/addresses/save.js'), ENT_QUOTES, 'UTF-8') . '" defer></script>';
$extraFooter .= '<script src="' . htmlspecialchars($assetUrl('js/addresses/edit.js'), ENT_QUOTES, 'UTF-8') . '" defer></script>';

require dirname(__DIR__) . '/partials/head.php';
$csrf = \App\Csrf::getToken();
?>
<main id="main-content" class="map-page main-panel add-address-page page--addr-dashboard">
    <?php require dirname(__DIR__) . '/partials/flash.php'; ?>

    <div id="addr-api-msg" class="addr-api-msg" role="status" aria-live="polite" hidden></div>

    <div id="addr-save-success-overlay" class="addr-save-success" hidden>
        <div class="addr-save-success__backdrop" id="addr-save-success-backdrop" aria-hidden="true"></div>
        <div class="addr-save-success__dialog" role="dialog" aria-modal="true" aria-labelledby="addr-save-success-title" dir="rtl">
            <h2 id="addr-save-success-title" class="addr-save-success__title">تم حفظ العنوان</h2>
            <p class="addr-save-success__lead muted">يمكن طباعة البطاقة أو بدء قطعة جديدة داخل نفس الشعبية.</p>
            <div id="addr-save-success-summary" class="addr-save-success__summary mono"></div>
            <div class="addr-save-success__qr-wrap">
                <span class="form-label addr-save-success__qr-label">رمز QR</span>
                <div id="addr-save-qrcode" class="addr-save-success__qr" aria-hidden="true"></div>
            </div>
            <div class="addr-save-success__actions">
                <button type="button" class="btn btn--scene btn--pill-footer" id="addr-save-success-print">طباعة</button>
                <button type="button" class="btn btn--scene btn--pill-footer btn--primary-glow" id="addr-save-success-new-scene">مشهد جديد</button>
                <button type="button" class="btn btn--scene btn--pill-footer btn--footer-soft" id="addr-save-success-close">إغلاق</button>
            </div>
        </div>
    </div>

    <div class="addr-page-mgr">
        <header class="addr-dash-top" dir="rtl">
            <div class="addr-context-bar addr-context-bar--modern" aria-label="سياق الموقع الحالي">
                <div class="addr-context-bar__item">
                    <span class="addr-context-bar__label">رمز الولاية</span>
                    <strong class="addr-context-bar__value mono" id="ctx-province"><?= htmlspecialchars($ctxProv, ENT_QUOTES, 'UTF-8') ?></strong>
                </div>
                <div class="addr-context-bar__item">
                    <span class="addr-context-bar__label">الولاية</span>
                    <strong class="addr-context-bar__value" id="ctx-wilayah"><?= htmlspecialchars($ctxWilayah, ENT_QUOTES, 'UTF-8') ?></strong>
                </div>
                <div class="addr-context-bar__item">
                    <span class="addr-context-bar__label">رمز الشعبية واسمها</span>
                    <strong class="addr-context-bar__value" id="ctx-area"><?= htmlspecialchars($ctxShabiyaChip, ENT_QUOTES, 'UTF-8') ?></strong>
                </div>
                <div class="addr-context-bar__item">
                    <span class="addr-context-bar__label">المدينة أو المنطقة التابعة للشعبية</span>
                    <strong class="addr-context-bar__value" id="ctx-place"><?= htmlspecialchars($ctxPlace, ENT_QUOTES, 'UTF-8') ?></strong>
                </div>
            </div>
        </header>

        <div class="add-address-workbench add-address-workbench--modern add-address-workbench--rtl-layout" dir="rtl">
            <button type="button" id="btn-addr-sidebar-show" class="addr-sidebar-toggle addr-sidebar-toggle--show" aria-label="إظهار إدارة العنوان" title="إظهار إدارة العنوان" aria-hidden="true" tabindex="-1">
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
            </button>

            <div class="add-address__sidebar-shell" id="addr-sidebar-shell">
            <aside class="add-address__sidebar panel--mgr panel--mgr--compact" dir="rtl" aria-labelledby="postal-form-title">
                <div class="addr-sidebar__masthead">
                    <div class="addr-sidebar__header">
                        <h2 id="postal-form-title" class="panel--mgr__title">إدارة العنوان</h2>
                        <button type="button" id="btn-addr-sidebar-hide" class="addr-sidebar-toggle addr-sidebar-toggle--hide" aria-label="إخفاء اللوحة" title="إخفاء">
                            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                        </button>
                    </div>
                    <p class="panel--mgr__hint muted" dir="ltr"><span class="mono postal-format-hint">B 2-1-S 9</span></p>
                </div>

                <?php if ($editRow !== null): ?>
                <div class="add-address__badge">تعديل سجل موجود</div>
                <?php endif; ?>

                <div class="addr-form-card" <?= $editRow !== null ? ' hidden' : '' ?>>
                <form id="addr-new-form" class="addr-form addr-form--mgr addr-form--compact addr-form--grid" action="index.php?r=address_store" method="post" novalidate>
                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                    <input type="hidden" name="pc_province" id="pc_province" value="">
                    <input type="hidden" name="pc_area" id="pc_area" value="">
                    <input type="hidden" name="pc_city" id="pc_city" value="1">
                    <input type="hidden" name="street_number" id="street_number" value="">
                    <input type="hidden" name="apartment_number" id="apartment_number" value="">

                    <div class="addr-form__row addr-form__row--3">
                        <div class="addr-form__cell">
                            <label class="form-label" for="addr-wilayah">الولاية</label>
                            <select class="form-input form-input--mgr form-input--mgr-tight" id="addr-wilayah" required autocomplete="off">
                                <option value="" selected>—</option>
                                <option value="barqa"><?= htmlspecialchars(\App\Models\LibyaAdmin::wilayahSelectLabel('barqa'), ENT_QUOTES, 'UTF-8') ?></option>
                                <option value="tripolitania"><?= htmlspecialchars(\App\Models\LibyaAdmin::wilayahSelectLabel('tripolitania'), ENT_QUOTES, 'UTF-8') ?></option>
                                <option value="fezzan"><?= htmlspecialchars(\App\Models\LibyaAdmin::wilayahSelectLabel('fezzan'), ENT_QUOTES, 'UTF-8') ?></option>
                            </select>
                        </div>
                        <div class="addr-form__cell">
                            <label class="form-label" for="shabiya">الشعبية</label>
                            <select class="form-input form-input--mgr form-input--mgr-tight" name="shabiya" id="shabiya" required autocomplete="off">
                                <option value="" selected>—</option>
                            </select>
                        </div>
                        <div class="addr-form__cell">
                            <label class="form-label" for="addr-city-area">المدينة / المنطقة</label>
                            <input class="form-input form-input--mgr form-input--mgr-tight" type="text" id="addr-city-area" maxlength="200" placeholder="داخل الشعبية" list="addr-city-area-list" autocomplete="off" aria-autocomplete="list">
                            <datalist id="addr-city-area-list"></datalist>
                        </div>
                    </div>
                    <div class="addr-form__row">
                        <label class="form-label" for="addr-neighborhood">الحي / الشارع</label>
                        <select class="form-input form-input--mgr form-input--mgr-tight" id="addr-neighborhood" autocomplete="off">
                            <option value="">— اختر الحي أو الشارع —</option>
                        </select>
                    </div>
                    <input type="hidden" name="pc_sector" id="pc_sector" value="S">
                    <div class="addr-form__row">
                        <label class="form-label" for="pc_property_display">رقم العقار</label>
                        <div class="postal-property-row">
                            <input class="form-input form-input--mgr form-input--mgr-tight postal-property-row__input" type="text" id="pc_property_display" readonly dir="ltr" value="" aria-describedby="pc_property_help">
                            <span class="postal-auto-badge postal-auto-badge--sm">تلقائي</span>
                        </div>
                        <span id="pc_property_help" class="field-help">يُولَّد عند الحفظ</span>
                    </div>
                    <div class="addr-form__row addr-form__row--type-owner">
                        <div class="addr-form__cell addr-form__cell--type">
                            <label class="form-label" for="type">نوع العقار</label>
                            <select class="form-input form-input--mgr form-input--mgr-tight" name="type" id="type" required>
                                <option value="residential">سكني</option>
                                <option value="government">حكومي</option>
                                <option value="commercial">تجاري</option>
                            </select>
                        </div>
                        <div class="addr-form__cell addr-form__cell--grow">
                            <label class="form-label" for="holder_name">اسم صاحب العقار</label>
                            <input class="form-input form-input--mgr form-input--mgr-tight" type="text" name="holder_name" id="holder_name" maxlength="200" placeholder="اختياري">
                        </div>
                    </div>
                </form>
                </div>

                <?php if ($editRow === null): ?>
                <div class="addr-sidebar__form-actions addr-form__actions addr-form__actions--mgr addr-form__actions--compact addr-form__actions--split">
                    <button class="btn btn--reset btn--compact btn--pill" type="button" id="btn-reset-entries">إعادة</button>
                    <button class="btn btn--save-new btn--compact btn--pill btn--primary-glow" type="button" id="btn-add-save">حفظ العنوان</button>
                </div>
                <?php endif; ?>

                <input type="hidden" name="map_lat" id="map-lat" value="" form="addr-new-form">
                <input type="hidden" name="map_lng" id="map-lng" value="" form="addr-new-form">

                <?php if ($editRow !== null):
                    $addrType = (string) $editRow['type'];
                    $typeLegacy = !in_array($addrType, \App\Models\Address::TYPES, true);
                    $pcProv = $editRow['pc_province'] ?? '';
                    $pcPreview = $editRow['postal_code'];
                    $hasSeg = $pcProv !== '' && $editRow['pc_area'] !== null && $editRow['pc_city'] !== null && $editRow['pc_sector'] !== null && $editRow['pc_property'] !== null;
                    if ($hasSeg) {
                        $pcPreview = $pcProv . ' ' . (string) $editRow['pc_area'] . '-' . (string) $editRow['pc_city'] . '-' . (string) $editRow['pc_sector'] . ' ' . (string) $editRow['pc_property'];
                    }
                ?>
                <form id="addr-edit-form" class="addr-form addr-form--mgr addr-form--edit-block" method="post" action="index.php?r=address_update" novalidate>
                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                    <input type="hidden" name="id" value="<?= (int) $editRow['id'] ?>">
                    <h3 class="addr-form--edit-block__title">تعديل السجل</h3>
                    <?php if ($hasSeg): ?>
                    <div class="addr-form__row">
                        <span class="form-label">الرمز المكوّن</span>
                        <div class="postal-segments" dir="ltr" aria-label="الرمز البريدي">
                            <span class="postal-segments__cell"><?= htmlspecialchars($pcProv, ENT_QUOTES, 'UTF-8') ?></span>
                            <span class="postal-segments__cell"><?= (int) $editRow['pc_area'] ?></span>
                            <span class="postal-segments__sep">-</span>
                            <span class="postal-segments__cell"><?= (int) $editRow['pc_city'] ?></span>
                            <span class="postal-segments__sep">-</span>
                            <span class="postal-segments__cell"><?= htmlspecialchars((string) $editRow['pc_sector'], ENT_QUOTES, 'UTF-8') ?></span>
                            <span class="postal-segments__cell postal-segments__cell--prop"><?= (int) $editRow['pc_property'] ?></span>
                        </div>
                    </div>
                    <?php else: ?>
                    <div class="addr-form__row">
                        <span class="form-label">الرمز البريدي</span>
                        <div class="form-static mono form-static--mgr" dir="ltr"><?= htmlspecialchars($pcPreview, ENT_QUOTES, 'UTF-8') ?></div>
                    </div>
                    <?php endif; ?>
                    <div class="addr-form__row">
                        <label class="form-label" for="edit_holder_name">اسم الحامل (اختياري)</label>
                        <input class="form-input form-input--mgr" type="text" name="holder_name" id="edit_holder_name" maxlength="200" value="<?= $editRow['owner_name'] !== null ? htmlspecialchars($editRow['owner_name'], ENT_QUOTES, 'UTF-8') : '' ?>">
                    </div>
                    <div class="addr-form__row">
                        <label class="form-label" for="edit_type">نوع العنوان</label>
                        <select class="form-input form-input--mgr" name="type" id="edit_type" required>
                            <?php if ($typeLegacy): ?>
                            <option value="" selected disabled>— اختر النوع —</option>
                            <?php endif; ?>
                            <option value="residential" <?= !$typeLegacy && $addrType === 'residential' ? 'selected' : '' ?>>سكني</option>
                            <option value="government" <?= !$typeLegacy && $addrType === 'government' ? 'selected' : '' ?>>حكومي</option>
                            <option value="commercial" <?= !$typeLegacy && $addrType === 'commercial' ? 'selected' : '' ?>>تجاري</option>
                        </select>
                    </div>
                    <div class="addr-form__row">
                        <label class="form-label" for="edit_apartment_number">بيان إضافي / شقة</label>
                        <input class="form-input form-input--mgr" type="text" name="apartment_number" id="edit_apartment_number" maxlength="32" value="<?= $editRow['apartment_number'] !== null ? htmlspecialchars($editRow['apartment_number'], ENT_QUOTES, 'UTF-8') : '' ?>">
                    </div>
                    <div class="addr-form__actions addr-form__actions--mgr">
                        <button class="btn btn--save-edit" type="button" id="btn-save-changes">حفظ التغييرات</button>
                        <button class="btn btn--delete" type="button" id="btn-delete-record">حذف السجل</button>
                        <button class="btn btn--qr" type="button" id="btn-qr-placeholder">توليد QR (قريباً)</button>
                    </div>
                </form>
                <p class="muted panel--mgr__footnote">الموقع والكود البريدي ثابتان لهذا السجل.</p>
                <?php endif; ?>
            </aside>
            </div>

            <section class="add-address__map-stack add-address__map-stack--modern" dir="ltr" aria-label="خريطة ليبيا">
                <div
                    id="map-root"
                    class="map-config"
                    data-sw-lat="<?= htmlspecialchars((string) $swLat, ENT_QUOTES, 'UTF-8') ?>"
                    data-sw-lng="<?= htmlspecialchars((string) $swLng, ENT_QUOTES, 'UTF-8') ?>"
                    data-ne-lat="<?= htmlspecialchars((string) $neLat, ENT_QUOTES, 'UTF-8') ?>"
                    data-ne-lng="<?= htmlspecialchars((string) $neLng, ENT_QUOTES, 'UTF-8') ?>"
                    data-center-lat="<?= htmlspecialchars((string) $centerLat, ENT_QUOTES, 'UTF-8') ?>"
                    data-center-lng="<?= htmlspecialchars((string) $centerLng, ENT_QUOTES, 'UTF-8') ?>"
                    data-zoom="<?= (int) $zoom ?>"
                    data-min-zoom="<?= (int) $minZoom ?>"
                    data-max-zoom="<?= (int) $maxZoom ?>"
                    data-max-zoom-sat="<?= (int) $maxZoomSat ?>"
                    data-mask-url="data/libya-mask-inner-ring.geojson"
                    data-shabiyat-url="data/libya-shabiyat.geojson"
                    data-skip-neighbor-boundaries="1"
                    data-satellite="<?= $mapSatelliteDefault ? '1' : '0' ?>"
                    data-read-only="<?= $editRow !== null ? '1' : '0' ?>"
                    <?php if ($editRow !== null): ?>
                    data-initial-lat="<?= htmlspecialchars($initialLat, ENT_QUOTES, 'UTF-8') ?>"
                    data-initial-lng="<?= htmlspecialchars($initialLng, ENT_QUOTES, 'UTF-8') ?>"
                    <?php endif; ?>
                    style="display:none"
                    aria-hidden="true"
                ></div>
                <div class="map-canvas-wrap map-canvas-wrap--mgr">
                    <div class="map-layer-controls-float map-base-layer-switch map-base-layer-switch--modern" role="group" aria-label="نوع الخريطة وعرض ليبيا">
                        <button type="button" id="addr-map-btn-sat" class="map-base-btn map-base-btn--icon-only<?= $mapSatelliteDefault ? ' is-active' : '' ?>" aria-pressed="<?= $mapSatelliteDefault ? 'true' : 'false' ?>" aria-label="عرض صور الأقمار الصناعية" title="أقمار صناعية">
                            <svg class="map-base-btn__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.4"/><path d="M12 5.5V7M12 17v1.5M5.5 12H7M17 12h1.5"/><path d="m8 8 1.1 1.1M14.9 14.9 16 16M16 8l-1.1 1.1M8 15.9 6.9 14"/><path d="M5 5c5.1-4 11.9-2.9 15.9 2.1"/><path d="M8 8c2.9-1.9 6.7-.8 8.6 2.1"/></svg>
                        </button>
                        <button type="button" id="addr-map-btn-osm" class="map-base-btn map-base-btn--icon-only<?= !$mapSatelliteDefault ? ' is-active' : '' ?>" aria-pressed="<?= !$mapSatelliteDefault ? 'true' : 'false' ?>" aria-label="عرض الخريطة التفصيلية" title="خريطة تفصيلية">
                            <svg class="map-base-btn__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5 12 6l8 3.5V17l-8 3.5L4 17z"/><path d="M4 9.5 12 13l8-3.5"/><path d="M12 6v14"/></svg>
                        </button>
                        <button type="button" id="addr-map-btn-fit" class="map-base-btn map-base-btn--ghost map-base-btn--fit-libya" title="عرض كامل ليبيا" aria-label="ملء الإطار بحدود ليبيا">
                            <span class="map-base-btn__label">ليبيا</span>
                        </button>
                    </div>
                    <?php if ($editRow === null): ?>
                    <div id="map-marker-cta-slot" class="map-marker-cta-float" hidden aria-hidden="true">
                        <button type="button" id="btn-place-marker-toggle" class="map-base-btn map-base-btn--marker map-base-btn--marker-cta" aria-pressed="false" title="فعّل ثم انقر على الخريطة لوضع العلامة والإحداثيات">
                            <span class="map-base-btn__label">تثبيت علامة الموقع</span>
                        </button>
                    </div>
                    <?php endif; ?>
                    <div id="map" class="map-canvas map-canvas--add" role="application" aria-label="خريطة ليبيا"></div>
                    <div id="map-coords-readout" class="map-coords-readout map-coords-readout--mgr map-coords-readout--chip" dir="ltr" aria-live="polite">
                        <span class="map-coords-readout__ar">الإحداثيات</span>
                        <span id="map-coords-values" class="map-coords-readout__vals mono">— ، —</span>
                    </div>
                </div>
            </section>

            <button type="button" id="btn-gis-toolbox-show" class="gis-toolbox-toggle gis-toolbox-toggle--show" aria-label="إظهار أدوات رسم حدود القطعة" title="إظهار حدود القطعة" aria-hidden="true" tabindex="-1">
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>

            <div class="gis-toolbox-shell" id="gis-toolbox-shell">
            <aside class="gis-toolbox gis-toolbox--modern gis-toolbox--compact gis-toolbox--parcel<?= $editRow !== null ? ' gis-toolbox--readonly' : '' ?>" dir="rtl" aria-label="رسم حدود القطعة">
                <div class="gis-toolbox__header">
                    <h3 class="gis-toolbox__title">إدارة الحدود</h3>
                    <button type="button" id="btn-gis-toolbox-hide" class="gis-toolbox-toggle gis-toolbox-toggle--hide" aria-label="إخفاء اللوحة" title="إخفاء">
                        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
                    </button>
                </div>
                <fieldset class="gis-fieldset gis-fieldset--minimal">
                    <legend class="gis-legend-sm">لون</legend>
                    <div class="gis-palette gis-palette--mini" id="gis-palette">
                        <button type="button" data-color="#22c55e" aria-label="أخضر"></button>
                        <button type="button" data-color="#eab308" aria-label="أصفر"></button>
                        <button type="button" data-color="#f97316" aria-label="برتقالي"></button>
                        <button type="button" data-color="#ef4444" aria-label="أحمر"></button>
                        <button type="button" data-color="#3b82f6" aria-label="أزرق"></button>
                        <button type="button" data-color="#a855f7" aria-label="بنفسجي"></button>
                        <button type="button" data-color="#ec4899" aria-label="وردي"></button>
                        <button type="button" data-color="#e2e8f0" aria-label="فاتح"></button>
                    </div>
                </fieldset>
                <div class="gis-parcel-actions">
                    <button type="button" class="gis-tool-btn" data-map-tool="parcel">رسم الحدود</button>
                    <button type="button" class="gis-tool-btn gis-tool-btn--secondary" id="btn-parcel-finish" disabled>إنهاء الشكل</button>
                    <button type="button" class="gis-tool-btn gis-tool-btn--ghost" id="btn-parcel-cancel" disabled>إلغاء</button>
                </div>
                <fieldset class="gis-fieldset gis-fieldset--minimal">
                    <legend class="gis-legend-sm">وصف القطعة</legend>
                    <textarea id="map-parcel-desc" rows="2" maxlength="500" placeholder="يُعرض عند مرور المؤشر على الحد"></textarea>
                </fieldset>
                <div class="gis-layer-toggles gis-layer-toggles--tight">
                    <label><input type="checkbox" id="layer-labels" checked> تسميات B1–F22</label>
                    <label><input type="checkbox" id="layer-entity-labels" checked> تسميات الكيانات</label>
                    <label><input type="checkbox" id="layer-boundaries" checked> الحدود والشبكات</label>
                </div>
            </aside>
            </div>

            
            </div>

        <footer class="addr-dashboard-footer addr-dashboard-footer--modern" dir="rtl">
            <a class="btn btn--exit btn--pill-footer" href="index.php?r=dashboard">لوحة التحكم</a>
            <a class="btn btn--scene btn--pill-footer btn--footer-soft" href="index.php?r=logout">تسجيل خروج</a>
            <button type="button" class="btn btn--scene btn--pill-footer" id="btn-new-scene">مشهد جديد</button>
            <button type="button" class="btn btn--scene btn--pill-footer btn--footer-soft" id="btn-export-png">تصدير PNG</button>
        </footer>
    </div>
</main>
<script type="application/json" id="addr-page-config"><?= json_encode([
    'csrf' => $csrf,
    'apiUrl' => 'index.php?r=address_api',
    'editId' => $editId,
    'isEdit' => $editRow !== null,
    'shabiyaToN' => $shabiyaToN,
    'wilayahSelectLabels' => [
        'barqa'        => \App\Models\LibyaAdmin::wilayahSelectLabel('barqa'),
        'tripolitania' => \App\Models\LibyaAdmin::wilayahSelectLabel('tripolitania'),
        'fezzan'       => \App\Models\LibyaAdmin::wilayahSelectLabel('fezzan'),
    ],
    'wilayahToStateId' => [
        'barqa'        => 2,
        'tripolitania' => 1,
        'fezzan'       => 3,
    ],
], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?></script>
<?php require dirname(__DIR__) . '/partials/foot.php';
