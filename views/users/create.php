<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $userName
 * @var string $userRole
 * @var string $navCurrent
 * @var string $csrf
 * @var array{m: string, t: string}|null $flash
 * @var array{name?: string, email?: string, role?: string} $old
 */
$flash = $flash ?? null;
$old = $old ?? [];
require dirname(__DIR__) . '/partials/head.php';
require dirname(__DIR__) . '/partials/app_header.php';
?>
<main id="main-content" class="content main-panel users-page users-page--form">
    <?php require dirname(__DIR__) . '/partials/flash.php'; ?>
    <div class="user-form-card">
        <h2 class="user-form-card__title">إضافة مستخدم جديد</h2>
        <form method="post" action="index.php?r=user_store" class="form-stack" autocomplete="off">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
            <label class="form-label" for="name">الاسم الكامل</label>
            <input class="form-input" type="text" name="name" id="name" required maxlength="120"
                   value="<?= htmlspecialchars((string) ($old['name'] ?? ''), ENT_QUOTES, 'UTF-8') ?>">
            <label class="form-label" for="email">البريد الإلكتروني</label>
            <input class="form-input" type="email" name="email" id="email" required maxlength="255" dir="ltr"
                   value="<?= htmlspecialchars((string) ($old['email'] ?? ''), ENT_QUOTES, 'UTF-8') ?>">
            <label class="form-label" for="role">الدور</label>
            <select class="form-input" name="role" id="role" required>
                <?php $oldRole = (string) ($old['role'] ?? 'employee'); ?>
                <option value="admin" <?= $oldRole === 'admin' ? 'selected' : '' ?>>مدير</option>
                <option value="employee" <?= $oldRole === 'employee' ? 'selected' : '' ?>>موظف</option>
                <option value="citizen" <?= $oldRole === 'citizen' ? 'selected' : '' ?>>مواطن</option>
            </select>
            <label class="form-label" for="password">كلمة المرور</label>
            <input class="form-input" type="password" name="password" id="password" required minlength="6" placeholder="6 خانات فأكثر">
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">إنشاء</button>
                <a class="btn btn-ghost" href="index.php?r=users">إلغاء</a>
            </div>
        </form>
    </div>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
