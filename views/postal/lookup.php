<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $code
 * @var array<string,mixed>|null $match
 * @var array<string,string> $wilayah
 */
$bodyClass = 'postal-lookup-body';
$appShellClass = 'app-shell--auth app-shell--wide';
$extraHead = '<link rel="stylesheet" href="css/postal_lookup.css">';
require dirname(__DIR__) . '/partials/head.php';

$wilayahArByLetter = [
    'B' => 'برقة',
    'T' => 'طرابلس',
    'F' => 'فزان',
];
?>
<main id="main-content" class="postal-lookup" dir="rtl">
    <header class="postal-lookup__head">
        <h1>البحث بالرمز البريدي</h1>
        <p class="muted">أدخل الرمز البريدي الليبي بالصيغة <code class="mono">B 2-1-S-0001</code> أو <code class="mono">B2-1-S-0001</code> لعرض موقع العنوان وبطاقته للطباعة.</p>
    </header>

    <form class="postal-lookup__form" method="get" action="index.php" autocomplete="off">
        <input type="hidden" name="r" value="postal_lookup">
        <div class="row">
            <label class="form-label" for="pl-code">الرمز البريدي</label>
            <input
                class="form-input mono pl-code"
                type="text"
                id="pl-code"
                name="code"
                value="<?= htmlspecialchars($code, ENT_QUOTES, 'UTF-8') ?>"
                placeholder="B 2-1-S-0001"
                dir="ltr"
                maxlength="32"
                required
            >
        </div>
        <div class="actions">
            <button type="submit" class="btn btn-primary">بحث</button>
            <a class="btn btn-ghost" href="index.php?r=postal_lookup">مسح</a>
            <a class="btn btn-ghost" href="index.php?r=home">الرئيسية</a>
        </div>
    </form>

    <?php if ($code !== '' && $match === null): ?>
        <section class="postal-lookup__none">
            <h2>لم يُعثر على هذا الرمز.</h2>
            <p class="muted">تأكّد من كتابة الرمز بصيغة <code class="mono">B 2-1-S-0001</code>.</p>
        </section>
    <?php elseif (is_array($match)): ?>
        <?php
        $prov = (string) ($match['pc_province'] ?? '');
        $wilAr = $wilayahArByLetter[$prov] ?? (string) ($match['wilayah'] ?? '');
        $lat = isset($match['latitude']) ? (float) $match['latitude'] : null;
        $lng = isset($match['longitude']) ? (float) $match['longitude'] : null;
        $codeOut = (string) ($match['postal_code'] ?? '');
        ?>
        <section class="postal-card" id="postal-card">
            <header class="postal-card__head">
                <div>
                    <span class="postal-card__label">الرمز البريدي الليبي</span>
                    <strong class="postal-card__code mono"><?= htmlspecialchars($codeOut, ENT_QUOTES, 'UTF-8') ?></strong>
                </div>
                <div class="postal-card__actions">
                    <a class="btn btn-ghost" href="index.php?r=postal_lookup_card&code=<?= urlencode($codeOut) ?>" target="_blank" rel="noopener">بطاقة طباعة</a>
                </div>
            </header>

            <dl class="postal-card__grid">
                <dt>الولاية</dt><dd><?= htmlspecialchars($wilAr, ENT_QUOTES, 'UTF-8') ?></dd>
                <dt>الشعبية</dt><dd><?= htmlspecialchars((string) ($match['shabiya'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
                <dt>المنطقة / الحي</dt><dd><?= htmlspecialchars((string) ($match['locality'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
                <dt>رقم الشارع</dt><dd class="mono"><?= htmlspecialchars((string) ($match['street_number'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
                <dt>رقم الشقة</dt><dd class="mono"><?= htmlspecialchars((string) ($match['apartment_number'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
                <dt>القطاع</dt><dd class="mono"><?= htmlspecialchars((string) ($match['pc_sector'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
                <dt>الإحداثيات</dt>
                <dd class="mono">
                    <?php if ($lat !== null && $lng !== null): ?>
                        <?= htmlspecialchars(number_format($lat, 6, '.', ''), ENT_QUOTES, 'UTF-8') ?>،
                        <?= htmlspecialchars(number_format($lng, 6, '.', ''), ENT_QUOTES, 'UTF-8') ?>
                    <?php else: ?>
                        —
                    <?php endif; ?>
                </dd>
            </dl>

            <p class="postal-card__note muted small">لأسباب الخصوصية لا يتم إظهار اسم المالك في الواجهة العامة.</p>
        </section>
    <?php endif; ?>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
