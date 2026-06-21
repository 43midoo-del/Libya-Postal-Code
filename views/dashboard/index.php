<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $userName
 * @var string $userRole
 * @var string $navCurrent
 * @var int $countUsers
 * @var int $countAddresses
 * @var int $countStates
 * @var int $countActiveShabiyat
 * @var list<array{key:string,label:string,count:int}> $byWilayah
 * @var list<array{name:string,count:int}> $topShabiyat
 * @var list<array{key:string,label:string,count:int}> $byType
 * @var list<array{date:string,count:int}> $last7Days
 * @var list<array<string,mixed>> $recent
 */
$isAdmin = $userRole === 'admin';
$isStaff = in_array($userRole, ['admin', 'employee'], true);

$dashData = [
    'byWilayah'   => $byWilayah,
    'topShabiyat' => $topShabiyat,
    'byType'      => $byType,
    'last7Days'   => $last7Days,
];
$extraFooter  = '<script src="' . htmlspecialchars(\App\Assets::chartJs(), ENT_QUOTES, 'UTF-8') . '"></script>';
$extraFooter .= '<script type="application/json" id="dashboard-data">'
    . json_encode($dashData, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
    . '</script>';
$extraFooter .= '<script src="js/dashboard_charts.js" defer></script>';

require dirname(__DIR__) . '/partials/head.php';
require dirname(__DIR__) . '/partials/app_header.php';
?>
<main id="main-content" class="content main-panel dashboard-page">
    <p class="intro">مرحباً، <strong><?= htmlspecialchars($userName, ENT_QUOTES, 'UTF-8') ?></strong>.</p>

    <section class="dash-grid" aria-label="بطاقات الأرقام الرئيسية">
        <div class="dash-card">
            <div class="dash-card__value"><?= (int) $countAddresses ?></div>
            <div class="dash-card__label">عناوين مسجّلة</div>
        </div>
        <div class="dash-card">
            <div class="dash-card__value"><?= (int) $countUsers ?></div>
            <div class="dash-card__label">مستخدمو النظام</div>
        </div>
        <div class="dash-card">
            <div class="dash-card__value"><?= (int) $countStates ?></div>
            <div class="dash-card__label">الولايات</div>
        </div>
        <div class="dash-card">
            <div class="dash-card__value"><?= (int) $countActiveShabiyat ?></div>
            <div class="dash-card__label">شعبيات نشطة</div>
        </div>
    </section>

    <section class="dash-charts" aria-label="مخططات بيانية">
        <div class="dash-chart-card">
            <h3 class="dash-chart-card__title">توزيع العناوين حسب الولاية</h3>
            <div class="dash-chart-card__body">
                <canvas id="chart-wilayah" role="img" aria-label="توزيع العناوين حسب الولاية"></canvas>
            </div>
        </div>
        <div class="dash-chart-card">
            <h3 class="dash-chart-card__title">أكثر 10 شعبيات بالعناوين</h3>
            <div class="dash-chart-card__body">
                <canvas id="chart-shabiyat" role="img" aria-label="أكثر الشعبيات"></canvas>
            </div>
        </div>
        <div class="dash-chart-card">
            <h3 class="dash-chart-card__title">عناوين آخر 7 أيام</h3>
            <div class="dash-chart-card__body">
                <canvas id="chart-last7" role="img" aria-label="آخر سبعة أيام"></canvas>
            </div>
        </div>
        <div class="dash-chart-card">
            <h3 class="dash-chart-card__title">توزيع العناوين حسب النوع</h3>
            <div class="dash-chart-card__body">
                <canvas id="chart-type" role="img" aria-label="توزيع الأنواع"></canvas>
            </div>
        </div>
    </section>

    <section class="dash-recent">
        <h3 class="dash-recent__title">آخر 5 عناوين مضافة</h3>
        <?php if (empty($recent)): ?>
            <p class="muted">لا توجد عناوين بعد.</p>
        <?php else: ?>
        <div class="addresses-table-wrap">
            <table class="data-table">
                <thead><tr><th>#</th><th>الكود</th><th>المالك</th><th>العنوان</th><th>التاريخ</th><th>بواسطة من</th><th></th></tr></thead>
                <tbody>
                <?php foreach ($recent as $r):
                    $place = \App\Models\Address::formatPlaceSequence($r);
                    $createdBy = trim((string) ($r['created_by_name'] ?? ''));
                ?>
                    <tr>
                        <td class="mono"><?= (int) $r['id'] ?></td>
                        <td dir="ltr" class="mono"><?= htmlspecialchars($r['postal_code'], ENT_QUOTES, 'UTF-8') ?></td>
                        <td><?= htmlspecialchars((string) ($r['owner_name'] ?? ''), ENT_QUOTES, 'UTF-8') ?></td>
                        <td><?= htmlspecialchars($place, ENT_QUOTES, 'UTF-8') ?></td>
                        <td dir="ltr" class="mono"><?= htmlspecialchars((string) ($r['created_at'] ?? ''), ENT_QUOTES, 'UTF-8') ?></td>
                        <td><?php if ($createdBy !== ''): ?><?= htmlspecialchars($createdBy, ENT_QUOTES, 'UTF-8') ?><?php else: ?><span class="muted">—</span><?php endif; ?></td>
                        <td><a class="btn btn-ghost" href="index.php?r=address_show&amp;id=<?= (int) $r['id'] ?>">تفاصيل</a></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </section>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
