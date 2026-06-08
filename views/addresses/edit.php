<?php
/**
 * Full edit page (Phase 4): editable map + all postal segments + metadata.
 *
 * @var string $appName
 * @var string $title
 * @var array  $row
 * @var array  $libya
 * @var array  $mapCfg
 * @var string $userName
 * @var string $userRole
 * @var string $navCurrent
 * @var string $csrf
 * @var array{m: string, t: string}|null $flash
 */
$flash = $flash ?? null;
$b = $mapCfg['libya_bounds'];
$swLat = $b['south'];
$swLng = $b['west'];
$neLat = $b['north'];
$neLng = $b['east'];
$initialLat = (string) $row['latitude'];
$initialLng = (string) $row['longitude'];

$shabiyatJson = json_encode($libya['shabiyat'], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$extraHead = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="anonymous">';
$extraFooter  = '<script type="application/json" id="libya-shabiyat-data">' . $shabiyatJson . '</script>';
$extraFooter .= '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="anonymous"></script>';
$extraFooter .= '<script src="js/map/core.js" defer></script>';
$extraFooter .= '<script src="js/map/labels.js" defer></script>';
$extraFooter .= '<script src="js/map/shabiyat.js" defer></script>';
$extraFooter .= '<script src="js/addresses/full_edit.js" defer></script>';

require dirname(__DIR__) . '/partials/head.php';
require dirname(__DIR__) . '/partials/app_header.php';

$curWilayah = (string) ($row['wilayah'] ?? 'tripolitania');
$curShabiya = (string) ($row['shabiya'] ?? '');
?>
<main id="main-content" class="map-page main-panel">
    <?php require dirname(__DIR__) . '/partials/flash.php'; ?>
    <header class="addresses-page__head">
        <div class="addresses-page__heading">
            <h2 class="addresses-page__title">تعديل عنوان كامل #<?= (int) $row['id'] ?></h2>
            <p class="muted">يمكنك تعديل الموقع على الخريطة (نقرة لتحديث الإحداثيات) وكل أجزاء الكود البريدي. الكود البريدي يُعاد توليده فقط إذا تغيّر (الولاية أو رقم الشعبية أو رقم المدينة أو حرف الحي).</p>
        </div>
    </header>

    <form method="post" action="index.php?r=address_full_update" class="addr-form addr-form--full-edit" id="addr-full-edit-form">
        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
        <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
        <input type="hidden" name="map_lat" id="map-lat" value="<?= htmlspecialchars($initialLat, ENT_QUOTES, 'UTF-8') ?>">
        <input type="hidden" name="map_lng" id="map-lng" value="<?= htmlspecialchars($initialLng, ENT_QUOTES, 'UTF-8') ?>">

        <div class="addresses-filters" style="margin-bottom:0.75rem">
            <div class="addresses-filters__row">
                <div class="addresses-filters__cell">
                    <label class="form-label" for="pc_province">رمز الولاية</label>
                    <select class="form-input mono" name="pc_province" id="pc_province" required>
                        <option value="B" <?= ($row['pc_province'] ?? '') === 'B' ? 'selected' : '' ?>>B — برقة</option>
                        <option value="T" <?= ($row['pc_province'] ?? '') === 'T' ? 'selected' : '' ?>>T — طرابلس</option>
                        <option value="F" <?= ($row['pc_province'] ?? '') === 'F' ? 'selected' : '' ?>>F — فزان</option>
                    </select>
                </div>
                <div class="addresses-filters__cell">
                    <label class="form-label" for="pc_area">رقم الشعبية</label>
                    <input class="form-input mono" type="number" name="pc_area" id="pc_area" min="1" max="999" required value="<?= htmlspecialchars((string) (int) ($row['pc_area'] ?? 0), ENT_QUOTES, 'UTF-8') ?>">
                </div>
                <div class="addresses-filters__cell">
                    <label class="form-label" for="pc_city">رقم المدينة</label>
                    <input class="form-input mono" type="number" name="pc_city" id="pc_city" min="1" max="999" required value="<?= htmlspecialchars((string) (int) ($row['pc_city'] ?? 0), ENT_QUOTES, 'UTF-8') ?>">
                </div>
                <div class="addresses-filters__cell">
                    <label class="form-label" for="pc_sector">رمز الحي</label>
                    <input class="form-input mono" type="text" name="pc_sector" id="pc_sector" required maxlength="2" pattern="[A-Za-z0-9]{1,2}" dir="ltr" title="1–2 خانة أبجدرقمية (مثل: S، SA، A1، 9)" value="<?= htmlspecialchars((string) ($row['pc_sector'] ?? 'S'), ENT_QUOTES, 'UTF-8') ?>">
                </div>
            </div>

            <div class="addresses-filters__row">
                <div class="addresses-filters__cell">
                    <label class="form-label" for="addr-wilayah">الولاية</label>
                    <select class="form-input" id="addr-wilayah">
                        <option value="barqa" <?= $curWilayah === 'barqa' ? 'selected' : '' ?>>برقة</option>
                        <option value="tripolitania" <?= $curWilayah === 'tripolitania' ? 'selected' : '' ?>>طرابلس</option>
                        <option value="fezzan" <?= $curWilayah === 'fezzan' ? 'selected' : '' ?>>فزان</option>
                    </select>
                </div>
                <div class="addresses-filters__cell">
                    <label class="form-label" for="shabiya">الشعبية</label>
                    <select class="form-input" name="shabiya" id="shabiya">
                        <option value="">— بدون —</option>
                        <?php foreach ($libya['shabiyat'] as $sh):
                            $nm = (string) ($sh['name'] ?? '');
                            $wk = (string) ($sh['wilayah'] ?? '');
                            if ($nm === '') { continue; }
                            $sel = $nm === $curShabiya ? 'selected' : '';
                            $hide = $wk !== $curWilayah;
                        ?>
                            <option value="<?= htmlspecialchars($nm, ENT_QUOTES, 'UTF-8') ?>"
                                    data-wilayah="<?= htmlspecialchars($wk, ENT_QUOTES, 'UTF-8') ?>"
                                    <?= $sel ?> <?= $hide ? 'hidden' : '' ?>>
                                <?= htmlspecialchars($nm, ENT_QUOTES, 'UTF-8') ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="addresses-filters__cell">
                    <label class="form-label" for="locality">المدينة / المنطقة</label>
                    <input class="form-input" type="text" name="locality" id="locality" maxlength="200"
                           value="<?= htmlspecialchars((string) ($row['locality'] ?? ''), ENT_QUOTES, 'UTF-8') ?>">
                </div>
                <div class="addresses-filters__cell">
                    <label class="form-label" for="street_number">رقم القطعة / الشارع</label>
                    <input class="form-input" type="text" name="street_number" id="street_number" maxlength="32"
                           value="<?= htmlspecialchars((string) ($row['street_number'] ?? ''), ENT_QUOTES, 'UTF-8') ?>">
                </div>
            </div>

            <div class="addresses-filters__row">
                <div class="addresses-filters__cell addresses-filters__cell--grow">
                    <label class="form-label" for="owner_name">اسم الحامل</label>
                    <input class="form-input" type="text" name="owner_name" id="owner_name" maxlength="200"
                           value="<?= htmlspecialchars((string) ($row['owner_name'] ?? ''), ENT_QUOTES, 'UTF-8') ?>">
                </div>
                <div class="addresses-filters__cell">
                    <label class="form-label" for="type">النوع</label>
                    <select class="form-input" name="type" id="type" required>
                        <option value="residential" <?= ((string)$row['type']) === 'residential' ? 'selected' : '' ?>>سكني</option>
                        <option value="government" <?= ((string)$row['type']) === 'government' ? 'selected' : '' ?>>حكومي</option>
                        <option value="commercial" <?= ((string)$row['type']) === 'commercial' ? 'selected' : '' ?>>تجاري</option>
                    </select>
                </div>
                <div class="addresses-filters__cell">
                    <label class="form-label" for="apartment_number">بيان إضافي / شقة</label>
                    <input class="form-input" type="text" name="apartment_number" id="apartment_number" maxlength="32"
                           value="<?= htmlspecialchars((string) ($row['apartment_number'] ?? ''), ENT_QUOTES, 'UTF-8') ?>">
                </div>
            </div>
        </div>

        <div
            id="map-root"
            class="map-config"
            data-sw-lat="<?= htmlspecialchars((string) $swLat, ENT_QUOTES, 'UTF-8') ?>"
            data-sw-lng="<?= htmlspecialchars((string) $swLng, ENT_QUOTES, 'UTF-8') ?>"
            data-ne-lat="<?= htmlspecialchars((string) $neLat, ENT_QUOTES, 'UTF-8') ?>"
            data-ne-lng="<?= htmlspecialchars((string) $neLng, ENT_QUOTES, 'UTF-8') ?>"
            data-center-lat="<?= htmlspecialchars($initialLat, ENT_QUOTES, 'UTF-8') ?>"
            data-center-lng="<?= htmlspecialchars($initialLng, ENT_QUOTES, 'UTF-8') ?>"
            data-zoom="14"
            data-min-zoom="<?= (int) $mapCfg['min_zoom'] ?>"
            data-max-zoom="<?= (int) $mapCfg['max_zoom'] ?>"
            data-mask-url="data/libya-mask-inner-ring.geojson"
            data-shabiyat-url="data/libya-shabiyat.geojson"
            data-skip-neighbor-boundaries="1"
            data-satellite="0"
            data-read-only="0"
            data-initial-lat="<?= htmlspecialchars($initialLat, ENT_QUOTES, 'UTF-8') ?>"
            data-initial-lng="<?= htmlspecialchars($initialLng, ENT_QUOTES, 'UTF-8') ?>"
            style="display:none"
            aria-hidden="true"
        ></div>

        <div class="map-base-layer-bar" dir="rtl">
            <span class="map-base-layer-bar__label">الخلفية:</span>
            <div class="map-base-layer-switch" role="group" aria-label="نوع الخريطة">
                <button type="button" id="addr-map-btn-sat" class="map-base-btn"><span class="map-base-btn__label">أقمار</span></button>
                <button type="button" id="addr-map-btn-osm" class="map-base-btn is-active"><span class="map-base-btn__label">خريطة</span></button>
                <button type="button" id="addr-map-btn-fit" class="map-base-btn map-base-btn--ghost"><span class="map-base-btn__label">ليبيا</span></button>
            </div>
        </div>

        <div id="map" class="map-canvas" role="application" aria-label="خريطة تعديل الموقع" style="min-height:420px;height:55vh"></div>

        <p class="muted" style="margin:0.6rem 0">انقر على الخريطة لتحريك علامة الموقع وتحديث الإحداثيات.</p>

        <div class="form-actions" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.8rem">
            <button type="submit" class="btn btn-primary">حفظ التعديلات</button>
            <a class="btn btn-ghost" href="index.php?r=address_show&id=<?= (int) $row['id'] ?>">إلغاء</a>
        </div>
    </form>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
