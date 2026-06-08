<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $userName
 * @var string $userRole
 * @var string $navCurrent
 * @var string $csrf
 * @var array{m: string, t: string}|null $flash
 * @var \App\Models\User $profileUser
 */
$flash = $flash ?? null;
require dirname(__DIR__) . '/partials/head.php';
require dirname(__DIR__) . '/partials/app_header.php';
?>
<main id="main-content" class="content main-panel users-page users-page--profile">
    <?php require dirname(__DIR__) . '/partials/flash.php'; ?>

    <div class="profile-grid">
        <section class="user-form-card">
            <h2 class="user-form-card__title">بياناتي الشخصية</h2>
            <form method="post" action="index.php?r=profile_update" class="form-stack" autocomplete="off">
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                <label class="form-label" for="name">الاسم الكامل</label>
                <input class="form-input" type="text" name="name" id="name" required maxlength="120"
                       value="<?= htmlspecialchars($profileUser->name, ENT_QUOTES, 'UTF-8') ?>">
                <label class="form-label" for="email">البريد الإلكتروني</label>
                <input class="form-input" type="email" name="email" id="email" required maxlength="255" dir="ltr"
                       value="<?= htmlspecialchars($profileUser->email, ENT_QUOTES, 'UTF-8') ?>">
                <p class="muted">الدور: <strong><?= htmlspecialchars(\App\Models\User::roleLabelAr($profileUser->role), ENT_QUOTES, 'UTF-8') ?></strong> (يديره المدير).</p>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">حفظ البيانات</button>
                </div>
            </form>
        </section>

        <section class="user-form-card">
            <h2 class="user-form-card__title">تغيير كلمة المرور</h2>
            <form method="post" action="index.php?r=profile_password" class="form-stack" autocomplete="off">
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
                <label class="form-label" for="current_password">كلمة المرور الحالية</label>
                <input class="form-input" type="password" name="current_password" id="current_password" required>
                <label class="form-label" for="new_password">كلمة مرور جديدة</label>
                <input class="form-input" type="password" name="new_password" id="new_password" required minlength="6">
                <label class="form-label" for="confirm_password">تأكيد كلمة المرور</label>
                <input class="form-input" type="password" name="confirm_password" id="confirm_password" required minlength="6">
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">تغيير كلمة المرور</button>
                </div>
            </form>
        </section>
    </div>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
