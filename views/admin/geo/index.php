<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $tab
 * @var list<\App\Models\State>  $states
 * @var list<\App\Models\Region> $regions
 * @var list<\App\Models\City>   $cities
 * @var list<\App\Models\Area>   $areas
 * @var int $stateFilter
 * @var int $regionFilter
 * @var int $cityFilter
 * @var string $userName
 * @var string $userRole
 * @var string $navCurrent
 * @var string $csrf
 * @var array{m: string, t: string}|null $flash
 */
$flash = $flash ?? null;
require dirname(__DIR__, 2) . '/partials/head.php';
require dirname(__DIR__, 2) . '/partials/app_header.php';
$tabs = [
    'states'  => 'الولايات',
    'regions' => 'الشعبيات',
    'cities'  => 'المدن',
    'areas'   => 'المناطق',
];
?>
<main id="main-content" class="content main-panel admin-geo-page">
    <?php require dirname(__DIR__, 2) . '/partials/flash.php'; ?>

    <header class="addresses-page__head">
        <div class="addresses-page__heading">
            <h2 class="addresses-page__title">إدارة التقسيم الإداري</h2>
            <p class="muted addresses-page__lead">تعديل الولايات والشعبيات والمدن والمناطق المرتبطة بالعناوين البريدية.</p>
        </div>
    </header>

    <nav class="admin-geo-tabs" aria-label="أقسام التقسيم الإداري">
        <?php foreach ($tabs as $key => $label): ?>
            <a class="admin-geo-tab<?= $tab === $key ? ' is-active' : '' ?>"
               href="index.php?r=admin_geo&amp;tab=<?= htmlspecialchars($key, ENT_QUOTES, 'UTF-8') ?>">
                <?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?>
            </a>
        <?php endforeach; ?>
    </nav>

    <?php if ($tab === 'states'): ?>
        <div class="admin-geo-grid">
            <section class="admin-geo-card">
                <h3 class="admin-geo-card__title">الولايات</h3>
                <?php if ($states === []): ?>
                    <p class="muted">لا توجد ولايات بعد.</p>
                <?php else: ?>
                <div class="addresses-table-wrap">
                    <table class="data-table">
                        <thead><tr><th>#</th><th>الاسم</th><th>الرمز</th><th>إجراءات</th></tr></thead>
                        <tbody>
                        <?php foreach ($states as $s): ?>
                            <tr>
                                <td class="mono"><?= (int) $s->id ?></td>
                                <td><?= htmlspecialchars($s->name, ENT_QUOTES, 'UTF-8') ?></td>
                                <td dir="ltr" class="mono"><?= htmlspecialchars($s->code, ENT_QUOTES, 'UTF-8') ?></td>
                                <td class="cell-actions">
                                    <form method="post" action="index.php?r=admin_geo_state_save" class="inline-form admin-geo-inline-edit">
                                        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                                        <input type="hidden" name="id" value="<?= (int) $s->id ?>">
                                        <input class="form-input form-input--inline" type="text" name="name" value="<?= htmlspecialchars($s->name, ENT_QUOTES, 'UTF-8') ?>" required maxlength="120">
                                        <input class="form-input form-input--inline mono" dir="ltr" type="text" name="code" value="<?= htmlspecialchars($s->code, ENT_QUOTES, 'UTF-8') ?>" required maxlength="5" style="max-width:5rem">
                                        <button class="btn btn-ghost" type="submit">حفظ</button>
                                    </form>
                                    <form method="post" action="index.php?r=admin_geo_state_delete" class="inline-form js-confirm-delete">
                                        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                                        <input type="hidden" name="id" value="<?= (int) $s->id ?>">
                                        <button class="btn btn-ghost" type="submit">حذف</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <?php endif; ?>
            </section>
            <aside class="admin-geo-card">
                <h3 class="admin-geo-card__title">إضافة ولاية جديدة</h3>
                <form method="post" action="index.php?r=admin_geo_state_save" class="form-stack">
                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                    <label class="form-label" for="state-name">الاسم</label>
                    <input class="form-input" type="text" name="name" id="state-name" required maxlength="120">
                    <label class="form-label" for="state-code">الرمز اللاتيني (1–5 خانات)</label>
                    <input class="form-input mono" dir="ltr" type="text" name="code" id="state-code" required maxlength="5" placeholder="B / T / F">
                    <button type="submit" class="btn btn-primary">إضافة</button>
                </form>
            </aside>
        </div>

    <?php elseif ($tab === 'regions'): ?>
        <form method="get" action="index.php" class="admin-geo-tabs" style="border:none">
            <input type="hidden" name="r" value="admin_geo">
            <input type="hidden" name="tab" value="regions">
            <label class="form-label">عرض الشعبيات حسب الولاية:</label>
            <select class="form-input" name="state_id" onchange="this.form.submit()">
                <option value="0">— كل الولايات —</option>
                <?php foreach ($states as $s): ?>
                    <option value="<?= (int) $s->id ?>" <?= $stateFilter === (int) $s->id ? 'selected' : '' ?>>
                        <?= htmlspecialchars($s->name . ' (' . $s->code . ')', ENT_QUOTES, 'UTF-8') ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </form>
        <div class="admin-geo-grid">
            <section class="admin-geo-card">
                <h3 class="admin-geo-card__title">الشعبيات</h3>
                <?php if ($regions === []): ?>
                    <p class="muted">لا توجد شعبيات.</p>
                <?php else: ?>
                <div class="addresses-table-wrap">
                    <table class="data-table">
                        <thead><tr><th>#</th><th>الاسم</th><th>الولاية</th><th>إجراءات</th></tr></thead>
                        <tbody>
                        <?php foreach ($regions as $r): ?>
                            <tr>
                                <td class="mono"><?= (int) $r->id ?></td>
                                <td><?= htmlspecialchars($r->name, ENT_QUOTES, 'UTF-8') ?></td>
                                <td><?= htmlspecialchars((string) $r->stateName, ENT_QUOTES, 'UTF-8') ?></td>
                                <td class="cell-actions">
                                    <form method="post" action="index.php?r=admin_geo_region_save" class="inline-form admin-geo-inline-edit">
                                        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                                        <input type="hidden" name="id" value="<?= (int) $r->id ?>">
                                        <input class="form-input form-input--inline" type="text" name="name" value="<?= htmlspecialchars($r->name, ENT_QUOTES, 'UTF-8') ?>" required maxlength="120">
                                        <select class="form-input form-input--inline" name="state_id" required>
                                            <?php foreach ($states as $s): ?>
                                                <option value="<?= (int) $s->id ?>" <?= $r->stateId === (int) $s->id ? 'selected' : '' ?>>
                                                    <?= htmlspecialchars($s->name, ENT_QUOTES, 'UTF-8') ?>
                                                </option>
                                            <?php endforeach; ?>
                                        </select>
                                        <button class="btn btn-ghost" type="submit">حفظ</button>
                                    </form>
                                    <form method="post" action="index.php?r=admin_geo_region_delete" class="inline-form js-confirm-delete">
                                        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                                        <input type="hidden" name="id" value="<?= (int) $r->id ?>">
                                        <button class="btn btn-ghost" type="submit">حذف</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <?php endif; ?>
            </section>
            <aside class="admin-geo-card">
                <h3 class="admin-geo-card__title">إضافة شعبية</h3>
                <?php if ($states === []): ?>
                    <p class="muted">أضف ولاية أولاً.</p>
                <?php else: ?>
                <form method="post" action="index.php?r=admin_geo_region_save" class="form-stack">
                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                    <label class="form-label" for="region-name">اسم الشعبية</label>
                    <input class="form-input" type="text" name="name" id="region-name" required maxlength="120">
                    <label class="form-label" for="region-state">تتبع للولاية</label>
                    <select class="form-input" name="state_id" id="region-state" required>
                        <?php foreach ($states as $s): ?>
                            <option value="<?= (int) $s->id ?>"><?= htmlspecialchars($s->name . ' (' . $s->code . ')', ENT_QUOTES, 'UTF-8') ?></option>
                        <?php endforeach; ?>
                    </select>
                    <button type="submit" class="btn btn-primary">إضافة</button>
                </form>
                <?php endif; ?>
            </aside>
        </div>

    <?php elseif ($tab === 'cities'): ?>
        <form method="get" action="index.php" class="admin-geo-tabs" style="border:none">
            <input type="hidden" name="r" value="admin_geo">
            <input type="hidden" name="tab" value="cities">
            <label class="form-label">عرض المدن حسب الشعبية:</label>
            <select class="form-input" name="region_id" onchange="this.form.submit()">
                <option value="0">— كل الشعبيات —</option>
                <?php foreach ($regions as $rg): ?>
                    <option value="<?= (int) $rg->id ?>" <?= $regionFilter === (int) $rg->id ? 'selected' : '' ?>>
                        <?= htmlspecialchars($rg->name . ' — ' . ($rg->stateName ?? ''), ENT_QUOTES, 'UTF-8') ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </form>
        <div class="admin-geo-grid">
            <section class="admin-geo-card">
                <h3 class="admin-geo-card__title">المدن</h3>
                <?php if ($cities === []): ?>
                    <p class="muted">لا توجد مدن.</p>
                <?php else: ?>
                <div class="addresses-table-wrap">
                    <table class="data-table">
                        <thead><tr><th>#</th><th>الاسم</th><th>الشعبية</th><th>إجراءات</th></tr></thead>
                        <tbody>
                        <?php foreach ($cities as $c): ?>
                            <tr>
                                <td class="mono"><?= (int) $c->id ?></td>
                                <td><?= htmlspecialchars($c->name, ENT_QUOTES, 'UTF-8') ?></td>
                                <td><?= htmlspecialchars((string) $c->regionName, ENT_QUOTES, 'UTF-8') ?></td>
                                <td class="cell-actions">
                                    <form method="post" action="index.php?r=admin_geo_city_save" class="inline-form admin-geo-inline-edit">
                                        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                                        <input type="hidden" name="id" value="<?= (int) $c->id ?>">
                                        <input class="form-input form-input--inline" type="text" name="name" value="<?= htmlspecialchars($c->name, ENT_QUOTES, 'UTF-8') ?>" required maxlength="120">
                                        <select class="form-input form-input--inline" name="region_id" required>
                                            <?php foreach ($regions as $rg): ?>
                                                <option value="<?= (int) $rg->id ?>" <?= $c->regionId === (int) $rg->id ? 'selected' : '' ?>>
                                                    <?= htmlspecialchars($rg->name, ENT_QUOTES, 'UTF-8') ?>
                                                </option>
                                            <?php endforeach; ?>
                                        </select>
                                        <button class="btn btn-ghost" type="submit">حفظ</button>
                                    </form>
                                    <form method="post" action="index.php?r=admin_geo_city_delete" class="inline-form js-confirm-delete">
                                        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                                        <input type="hidden" name="id" value="<?= (int) $c->id ?>">
                                        <button class="btn btn-ghost" type="submit">حذف</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <?php endif; ?>
            </section>
            <aside class="admin-geo-card">
                <h3 class="admin-geo-card__title">إضافة مدينة</h3>
                <?php if ($regions === []): ?>
                    <p class="muted">أضف شعبية أولاً.</p>
                <?php else: ?>
                <form method="post" action="index.php?r=admin_geo_city_save" class="form-stack">
                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                    <label class="form-label" for="city-name">اسم المدينة</label>
                    <input class="form-input" type="text" name="name" id="city-name" required maxlength="120">
                    <label class="form-label" for="city-region">تتبع للشعبية</label>
                    <select class="form-input" name="region_id" id="city-region" required>
                        <?php foreach ($regions as $rg): ?>
                            <option value="<?= (int) $rg->id ?>"><?= htmlspecialchars($rg->name, ENT_QUOTES, 'UTF-8') ?></option>
                        <?php endforeach; ?>
                    </select>
                    <button type="submit" class="btn btn-primary">إضافة</button>
                </form>
                <?php endif; ?>
            </aside>
        </div>

    <?php elseif ($tab === 'areas'): ?>
        <form method="get" action="index.php" class="admin-geo-tabs" style="border:none">
            <input type="hidden" name="r" value="admin_geo">
            <input type="hidden" name="tab" value="areas">
            <label class="form-label">عرض المناطق حسب المدينة:</label>
            <select class="form-input" name="city_id" onchange="this.form.submit()">
                <option value="0">— كل المدن —</option>
                <?php foreach ($cities as $c): ?>
                    <option value="<?= (int) $c->id ?>" <?= $cityFilter === (int) $c->id ? 'selected' : '' ?>>
                        <?= htmlspecialchars($c->name . ' — ' . ($c->regionName ?? ''), ENT_QUOTES, 'UTF-8') ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </form>
        <div class="admin-geo-grid">
            <section class="admin-geo-card">
                <h3 class="admin-geo-card__title">المناطق</h3>
                <?php if ($areas === []): ?>
                    <p class="muted">لا توجد مناطق.</p>
                <?php else: ?>
                <div class="addresses-table-wrap">
                    <table class="data-table">
                        <thead><tr><th>#</th><th>الاسم</th><th>المدينة</th><th>إجراءات</th></tr></thead>
                        <tbody>
                        <?php foreach ($areas as $a): ?>
                            <tr>
                                <td class="mono"><?= (int) $a->id ?></td>
                                <td><?= htmlspecialchars($a->name, ENT_QUOTES, 'UTF-8') ?></td>
                                <td><?= htmlspecialchars((string) $a->cityName, ENT_QUOTES, 'UTF-8') ?></td>
                                <td class="cell-actions">
                                    <form method="post" action="index.php?r=admin_geo_area_save" class="inline-form admin-geo-inline-edit">
                                        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                                        <input type="hidden" name="id" value="<?= (int) $a->id ?>">
                                        <input class="form-input form-input--inline" type="text" name="name" value="<?= htmlspecialchars($a->name, ENT_QUOTES, 'UTF-8') ?>" required maxlength="120">
                                        <select class="form-input form-input--inline" name="city_id" required>
                                            <?php foreach ($cities as $c): ?>
                                                <option value="<?= (int) $c->id ?>" <?= $a->cityId === (int) $c->id ? 'selected' : '' ?>>
                                                    <?= htmlspecialchars($c->name, ENT_QUOTES, 'UTF-8') ?>
                                                </option>
                                            <?php endforeach; ?>
                                        </select>
                                        <button class="btn btn-ghost" type="submit">حفظ</button>
                                    </form>
                                    <form method="post" action="index.php?r=admin_geo_area_delete" class="inline-form js-confirm-delete">
                                        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                                        <input type="hidden" name="id" value="<?= (int) $a->id ?>">
                                        <button class="btn btn-ghost" type="submit">حذف</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <?php endif; ?>
            </section>
            <aside class="admin-geo-card">
                <h3 class="admin-geo-card__title">إضافة منطقة</h3>
                <?php if ($cities === []): ?>
                    <p class="muted">أضف مدينة أولاً.</p>
                <?php else: ?>
                <form method="post" action="index.php?r=admin_geo_area_save" class="form-stack">
                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                    <label class="form-label" for="area-name">اسم المنطقة</label>
                    <input class="form-input" type="text" name="name" id="area-name" required maxlength="120">
                    <label class="form-label" for="area-city">تتبع للمدينة</label>
                    <select class="form-input" name="city_id" id="area-city" required>
                        <?php foreach ($cities as $c): ?>
                            <option value="<?= (int) $c->id ?>"><?= htmlspecialchars($c->name, ENT_QUOTES, 'UTF-8') ?></option>
                        <?php endforeach; ?>
                    </select>
                    <button type="submit" class="btn btn-primary">إضافة</button>
                </form>
                <?php endif; ?>
            </aside>
        </div>

    <?php endif; ?>
</main>
<?php require dirname(__DIR__, 2) . '/partials/foot.php';
