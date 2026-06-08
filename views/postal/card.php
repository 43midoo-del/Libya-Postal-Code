<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $code
 * @var array<string,mixed>|null $match
 *
 * Print-friendly single-card view (A6/credit-card sized). Auto-opens print
 * dialog on load when ?print=1 is passed.
 */
$bodyClass = 'postal-print-body';
$appShellClass = '';
$extraHead = '<link rel="stylesheet" href="css/postal_lookup.css">';
require dirname(__DIR__) . '/partials/head.php';

$wilAr = ['B' => 'برقة', 'T' => 'طرابلس', 'F' => 'فزان'];
$prov = is_array($match) ? (string) ($match['pc_province'] ?? '') : '';
$lat = is_array($match) && $match['latitude'] !== null ? (float) $match['latitude'] : null;
$lng = is_array($match) && $match['longitude'] !== null ? (float) $match['longitude'] : null;
$autoPrint = (string) ($_GET['print'] ?? '') === '1';
?>
<main id="main-content" class="postal-print" dir="rtl">
    <?php if (!is_array($match)): ?>
        <p class="postal-print__none">لم يُعثر على عنوان يطابق الرمز <code class="mono"><?= htmlspecialchars($code, ENT_QUOTES, 'UTF-8') ?></code>.</p>
        <p><a class="btn btn-ghost" href="index.php?r=postal_lookup">رجوع للبحث</a></p>
    <?php else: ?>
        <article class="postal-card postal-card--print">
            <header class="postal-card__head">
                <div>
                    <span class="postal-card__label">الرمز البريدي الليبي</span>
                    <strong class="postal-card__code mono"><?= htmlspecialchars((string) ($match['postal_code'] ?? ''), ENT_QUOTES, 'UTF-8') ?></strong>
                </div>
                <div class="postal-card__brand">Libya Smart Postal</div>
            </header>

            <dl class="postal-card__grid">
                <dt>الولاية</dt><dd><?= htmlspecialchars($wilAr[$prov] ?? (string) ($match['wilayah'] ?? ''), ENT_QUOTES, 'UTF-8') ?></dd>
                <dt>الشعبية</dt><dd><?= htmlspecialchars((string) ($match['shabiya'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
                <dt>المنطقة</dt><dd><?= htmlspecialchars((string) ($match['locality'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
                <dt>رقم الشارع</dt><dd class="mono"><?= htmlspecialchars((string) ($match['street_number'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
                <dt>رقم الشقة</dt><dd class="mono"><?= htmlspecialchars((string) ($match['apartment_number'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
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

            <footer class="postal-card__foot">
                <span class="mono">libya-postal.gov</span>
                <span>تم الإنشاء بنظام Libya Smart Postal</span>
            </footer>
        </article>

        <div class="postal-print__actions no-print">
            <button type="button" class="btn btn-primary" onclick="window.print()">طباعة</button>
            <a class="btn btn-ghost" href="index.php?r=postal_lookup&code=<?= urlencode((string) ($match['postal_code'] ?? '')) ?>">رجوع</a>
        </div>
        <?php if ($autoPrint): ?>
            <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });</script>
        <?php endif; ?>
    <?php endif; ?>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
