<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $userName
 * @var string $userRole
 * @var string $csrf
 * @var array{m:string,t:string}|null $flash
 * @var array{south:float,west:float,north:float,east:float} $bounds
 * @var array{0:float,1:float} $center
 * @var int $zoom
 * @var int $minZoom
 * @var int $maxZoom
 * @var int $maxZoomSat
 */
$flash = $flash ?? null;
$bodyClass = 'boundary-editor-body';

$extraHead  = '<link rel="stylesheet" href="' . htmlspecialchars(\App\Assets::leafletCss(), ENT_QUOTES, 'UTF-8') . '">';
$extraHead .= '<link rel="stylesheet" href="' . htmlspecialchars(\App\Assets::geomanCss(), ENT_QUOTES, 'UTF-8') . '">';
$projectRoot = dirname(__DIR__, 3);
$beCss = 'css/boundary_editor.css';
$beCssVer = is_file($projectRoot . '/' . $beCss) ? (string) filemtime($projectRoot . '/' . $beCss) : (string) time();
$extraHead .= '<link rel="stylesheet" href="' . htmlspecialchars($beCss . '?v=' . $beCssVer, ENT_QUOTES, 'UTF-8') . '">';

$extraFooter  = '<script src="' . htmlspecialchars(\App\Assets::leafletJs(), ENT_QUOTES, 'UTF-8') . '"></script>';
$extraFooter .= '<script src="' . htmlspecialchars(\App\Assets::geomanJs(), ENT_QUOTES, 'UTF-8') . '"></script>';
$beJs = 'js/boundary/editor.js';
$beJsVer = is_file($projectRoot . '/' . $beJs) ? (string) filemtime($projectRoot . '/' . $beJs) : (string) time();
$scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
$lpApiBase = rtrim($scriptDir, '/') . '/index.php?r=';
$extraFooter .= '<script>window.LP_API_BASE=' . json_encode($lpApiBase, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) . ';</script>';
$provinceColors = $provinceColors ?? \App\Models\Boundary::provinceColors();
$pcJson = json_encode($provinceColors, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$extraFooter .= '<script type="application/json" id="province-colors-data">' . $pcJson . '</script>';
$mapRegions = $mapRegions ?? [];
$regionsJson = json_encode($mapRegions, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$extraFooter .= '<script type="application/json" id="postal-map-regions-data">' . $regionsJson . '</script>';
$pcJs = 'js/map/province_colors.js';
$pcJsVer = is_file($projectRoot . '/' . $pcJs) ? (string) filemtime($projectRoot . '/' . $pcJs) : (string) time();
$extraFooter .= '<script src="' . htmlspecialchars($pcJs . '?v=' . $pcJsVer, ENT_QUOTES, 'UTF-8') . '"></script>';
$extraFooter .= '<script src="' . htmlspecialchars($beJs . '?v=' . $beJsVer, ENT_QUOTES, 'UTF-8') . '" defer></script>';

require dirname(__DIR__, 2) . '/partials/head.php';

$isStaff = in_array($userRole, ['admin', 'employee'], true);
$isAdmin = $userRole === 'admin';
$roleAr = match ($userRole) {
    'admin'    => 'مدير',
    'employee' => 'موظف',
    'citizen'  => 'مواطن',
    default    => (string) $userRole,
};
?>
<header class="be-bar" role="banner">
    <span class="be-bar__title">محرر الحدود الجغرافية</span>
    <span class="be-bar__role"><?= htmlspecialchars($roleAr, ENT_QUOTES, 'UTF-8') ?></span>
    <nav class="be-bar__nav" aria-label="التنقل">
        <a class="be-bar__link" href="index.php?r=dashboard">اللوحة</a>
        <a class="be-bar__link be-bar__link--active" href="index.php?r=boundary_editor">محرر الحدود</a>
        <?php if ($isAdmin): ?>
        <a class="be-bar__link" href="index.php?r=admin_geo">التقسيم الإداري</a>
        <a class="be-bar__link" href="index.php?r=tile_sync">مزامنة</a>
        <?php endif; ?>
        <a class="be-bar__link" href="index.php?r=profile">حسابي</a>
        <a class="be-bar__link be-bar__link--out" href="index.php?r=logout">خروج</a>
    </nav>
</header>

<main id="main-content" class="boundary-editor" dir="rtl">
    <?php if ($flash !== null): ?>
        <?php require dirname(__DIR__, 2) . '/partials/flash.php'; ?>
    <?php endif; ?>

    <section class="be-grid">
        <aside class="be-panel be-panel--left" aria-label="مستكشف الهرمية">
            <nav class="be-tabs" role="tablist">
                <button class="be-tab is-active" type="button" data-level="state">ولاية</button>
                <button class="be-tab" type="button" data-level="region">شعبية</button>
                <button class="be-tab" type="button" data-level="city">مدينة</button>
                <button class="be-tab" type="button" data-level="area">حي</button>
                <button class="be-tab" type="button" data-level="street">شارع</button>
            </nav>

            <div class="be-panel__body">
                <div class="be-add-child" id="be-add-child-wrap" hidden>
                    <p class="be-add-child__ctx muted small" id="be-add-child-ctx" dir="rtl"></p>
                    <button class="btn btn-primary be-add-child__btn" type="button" id="be-add-child-btn" disabled>
                        + إضافة حي
                    </button>
                    <button class="btn btn-ghost be-add-child__btn" type="button" id="be-add-child-cancel" hidden>
                        إلغاء التحديد
                    </button>
                </div>

                <div class="be-entity-section">
                    <div class="be-scope-color" id="be-scope-color-wrap">
                        <label class="form-label" id="be-scope-color-label" for="be-scope-color">لون حدود النطاق</label>
                        <div class="be-scope-color__row">
                            <input class="form-input be-scope-color__input" type="color" id="be-scope-color" value="#0ea5e9" disabled>
                            <button class="btn btn-primary be-scope-color__apply" type="button" id="be-scope-color-apply" disabled>تطبيق على الكل</button>
                        </div>
                        <p class="be-scope-color__hint muted small" id="be-scope-color-hint">اختر الولاية لتلوين جميع الشعبيات داخلها.</p>
                    </div>
                    <label class="form-label" id="be-entity-label" for="be-entity">الولاية المراد تحريرها</label>
                    <select id="be-entity" class="form-input"><option value="">اختر ولاية</option></select>
                </div>

                <fieldset class="be-props">
                    <legend id="be-props-legend">خصائص الولاية</legend>

                    <label class="form-label" for="be-prop-name">الاسم</label>
                    <input class="form-input" type="text" id="be-prop-name" maxlength="120" disabled>

                    <label class="form-label" for="be-prop-code">الرمز <span class="muted small">(1–8 أبجدرقمي)</span></label>
                    <input class="form-input mono" dir="ltr" type="text" id="be-prop-code" maxlength="8" pattern="[A-Za-z0-9]{1,8}" placeholder="A / SA / B2 / 9" disabled>

                    <label class="form-label" for="be-prop-color">اللون</label>
                    <input class="form-input" type="color" id="be-prop-color" value="#0ea5e9" disabled>

                    <div class="be-label-pos" id="be-label-pos-wrap" hidden>
                        <span class="form-label">موقع اسم العنوان على الخريطة</span>
                        <p class="be-label-pos__hint muted small">اسحب الاسم إلى المكان المناسب ثم اضغط «حفظ».</p>
                        <button class="btn btn-ghost be-label-pos__reset" type="button" id="be-label-reset-btn">توسيط الاسم على الحد</button>
                    </div>

                    <div class="be-map-controls" aria-label="إعدادات الخريطة">
                        <div class="be-map-controls__block be-map-controls__block--base">
                            <span class="be-map-controls__label" id="be-map-controls-base-label">نوع الخريطة</span>
                            <div class="be-base-map-row__btns" role="group" aria-labelledby="be-map-controls-base-label">
                                <button type="button" class="be-base-map-btn" data-base="sat" aria-pressed="false">أقمار</button>
                                <button type="button" class="be-base-map-btn is-active" data-base="osm" aria-pressed="true">تفصيلية</button>
                            </div>
                        </div>
                        <div class="be-map-controls__block be-map-controls__block--overview" id="be-layer-overview-wrap">
                            <span class="be-map-controls__label" id="be-map-controls-overview-label">طبقات التقسيم</span>
                            <div class="be-layer-overview-list" role="group" aria-labelledby="be-map-controls-overview-label">
                                <label class="be-layer-check be-layer-check--states"><input type="checkbox" id="be-layer-states" checked> حدود الولايات</label>
                                <label class="be-layer-check be-layer-check--regions"><input type="checkbox" id="be-layer-regions" checked> حدود الشعبيات</label>
                                <label class="be-layer-check be-layer-check--labels"><input type="checkbox" id="be-layer-labels" checked> تسميات B1–F22</label>
                            </div>
                        </div>
                    </div>

                    <dl class="be-stats">
                        <dt>الرؤوس</dt><dd id="be-stat-vertices" class="mono">—</dd>
                        <dt>المساحة</dt><dd id="be-stat-area" class="mono">—</dd>
                        <dt>المحيط</dt><dd id="be-stat-perim" class="mono">—</dd>
                    </dl>

                    <div class="be-prop-actions">
                        <button class="btn btn-primary" type="button" id="be-save-btn" disabled>حفظ</button>
                        <button class="btn btn-ghost" type="button" id="be-delete-btn" disabled hidden>حذف</button>
                        <button class="btn btn-ghost" type="button" id="be-regen-grid-btn" disabled hidden title="إعادة توليد الشبكة المبدئية للكيان الحالي">إعادة الشبكة</button>
                    </div>
                </fieldset>
            </div>
        </aside>

        <div class="be-map-wrap">
            <div class="be-map-layer-switch" role="group" aria-label="نوع الخريطة">
                <button type="button" id="be-map-btn-sat" class="be-base-map-btn" data-base="sat" aria-pressed="false" title="أقمار صناعية">أقمار</button>
                <button type="button" id="be-map-btn-osm" class="be-base-map-btn is-active" data-base="osm" aria-pressed="true" title="خريطة تفصيلية">تفصيلية</button>
            </div>
            <div
                id="be-map"
                class="map-canvas"
                data-sw-lat="<?= htmlspecialchars((string) $bounds['south'], ENT_QUOTES, 'UTF-8') ?>"
                data-sw-lng="<?= htmlspecialchars((string) $bounds['west'], ENT_QUOTES, 'UTF-8') ?>"
                data-ne-lat="<?= htmlspecialchars((string) $bounds['north'], ENT_QUOTES, 'UTF-8') ?>"
                data-ne-lng="<?= htmlspecialchars((string) $bounds['east'], ENT_QUOTES, 'UTF-8') ?>"
                data-center-lat="<?= htmlspecialchars((string) $center[0], ENT_QUOTES, 'UTF-8') ?>"
                data-center-lng="<?= htmlspecialchars((string) $center[1], ENT_QUOTES, 'UTF-8') ?>"
                data-zoom="<?= (int) $zoom ?>"
                data-min-zoom="<?= (int) $minZoom ?>"
                data-max-zoom="<?= (int) $maxZoom ?>"
                data-max-zoom-sat="<?= (int) ($maxZoomSat ?? 17) ?>"
                role="application"
                aria-label="خريطة الرسم"
            ></div>

            <div class="be-status" id="be-status" role="status" aria-live="polite">جاهز. اختر مستوى وكيان.</div>
        </div>
    </section>

    <input type="hidden" id="be-csrf" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
</main>
<?php require dirname(__DIR__, 2) . '/partials/foot.php';
