<?php
/**
 * @var string $appName
 * @var string $title
 * @var list<\App\Models\User> $users
 * @var string $filterRole
 * @var string $filterQ
 * @var string $userName
 * @var string $userRole
 * @var string $navCurrent
 * @var string $csrf
 * @var array{m: string, t: string}|null $flash
 */
$flash = $flash ?? null;
require dirname(__DIR__) . '/partials/head.php';
require dirname(__DIR__) . '/partials/app_header.php';
$selfId = \App\SessionAuth::userId();
?>
<main id="main-content" class="content main-panel users-page">
    <?php require dirname(__DIR__) . '/partials/flash.php'; ?>

    <header class="addresses-page__head">
        <div class="addresses-page__heading">
            <h2 class="addresses-page__title">إدارة المستخدمين</h2>
            <p class="muted addresses-page__lead">إضافة وتعديل وحذف حسابات النظام (المدير والموظف والمواطن).</p>
        </div>
        <a class="btn btn-primary addresses-page__add" href="index.php?r=user_new">إضافة مستخدم</a>
    </header>

    <form class="addresses-filters" method="get" action="index.php" role="search">
        <input type="hidden" name="r" value="users">
        <div class="addresses-filters__row">
            <div class="addresses-filters__cell addresses-filters__cell--grow">
                <label class="form-label" for="users-q">بحث (اسم أو بريد)</label>
                <input class="form-input" type="search" name="q" id="users-q"
                       value="<?= htmlspecialchars($filterQ, ENT_QUOTES, 'UTF-8') ?>"
                       placeholder="اكتب جزءاً من الاسم أو البريد" maxlength="120" autocomplete="off">
            </div>
            <div class="addresses-filters__cell">
                <label class="form-label" for="users-role">الدور</label>
                <select class="form-input" name="role" id="users-role">
                    <option value="">كل الأدوار</option>
                    <option value="admin" <?= $filterRole === 'admin' ? 'selected' : '' ?>>مدير</option>
                    <option value="employee" <?= $filterRole === 'employee' ? 'selected' : '' ?>>موظف</option>
                    <option value="citizen" <?= $filterRole === 'citizen' ? 'selected' : '' ?>>مواطن</option>
                </select>
            </div>
        </div>
        <div class="addresses-filters__actions">
            <button class="btn btn-primary" type="submit">تطبيق</button>
            <a class="btn btn-ghost" href="index.php?r=users">مسح الفلاتر</a>
        </div>
    </form>

    <section class="addresses-results">
        <div class="addresses-results__meta">
            <span class="addresses-results__count"><strong><?= count($users) ?></strong> مستخدم</span>
        </div>
        <?php if (count($users) === 0): ?>
            <p class="alert empty-result" role="status">لا يوجد مستخدمون مطابقون للفلاتر المختارة.</p>
        <?php else: ?>
            <div class="addresses-table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>الاسم</th>
                            <th>البريد الإلكتروني</th>
                            <th>الدور</th>
                            <th>تاريخ الإنشاء</th>
                            <th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                    <?php foreach ($users as $u): ?>
                        <tr>
                            <td class="mono"><?= (int) $u->id ?></td>
                            <td><?= htmlspecialchars($u->name, ENT_QUOTES, 'UTF-8') ?>
                                <?php if ($u->id === $selfId): ?>
                                    <span class="badge">أنت</span>
                                <?php endif; ?>
                            </td>
                            <td dir="ltr" class="mono"><?= htmlspecialchars($u->email, ENT_QUOTES, 'UTF-8') ?></td>
                            <td><?= htmlspecialchars(\App\Models\User::roleLabelAr($u->role), ENT_QUOTES, 'UTF-8') ?></td>
                            <td dir="ltr" class="mono"><?= htmlspecialchars((string) $u->createdAt, ENT_QUOTES, 'UTF-8') ?></td>
                            <td class="cell-actions">
                                <a class="btn btn-ghost" href="index.php?r=user_edit&amp;id=<?= (int) $u->id ?>">تعديل</a>
                                <?php if ($u->id !== $selfId): ?>
                                <form method="post" action="index.php?r=user_delete" class="inline-form js-confirm-delete">
                                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                                    <input type="hidden" name="id" value="<?= (int) $u->id ?>">
                                    <button class="btn btn-ghost" type="submit">حذف</button>
                                </form>
                                <?php else: ?>
                                    <span class="muted">—</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </section>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
