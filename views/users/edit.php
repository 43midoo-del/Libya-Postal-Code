<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $userName
 * @var string $userRole
 * @var string $navCurrent
 * @var string $csrf
 * @var array{m: string, t: string}|null $flash
 * @var \App\Models\User $editUser
 */
$flash = $flash ?? null;
require dirname(__DIR__) . '/partials/head.php';
require dirname(__DIR__) . '/partials/app_header.php';
$selfId = \App\SessionAuth::userId();
?>
<main id="main-content" class="content main-panel users-page users-page--form">
    <?php require dirname(__DIR__) . '/partials/flash.php'; ?>
    <div class="user-form-card">
        <h2 class="user-form-card__title">تعديل المستخدم #<?= (int) $editUser->id ?></h2>
        <form method="post" action="index.php?r=user_update" class="form-stack" autocomplete="off">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
            <input type="hidden" name="id" value="<?= (int) $editUser->id ?>">
            <label class="form-label" for="name">الاسم الكامل</label>
            <input class="form-input" type="text" name="name" id="name" required maxlength="120"
                   value="<?= htmlspecialchars($editUser->name, ENT_QUOTES, 'UTF-8') ?>">
            <label class="form-label" for="email">البريد الإلكتروني</label>
            <input class="form-input" type="email" name="email" id="email" required maxlength="255" dir="ltr"
                   value="<?= htmlspecialchars($editUser->email, ENT_QUOTES, 'UTF-8') ?>">
            <label class="form-label" for="role">الدور</label>
            <select class="form-input" name="role" id="role" required <?= ($editUser->id === $selfId && $editUser->role === 'admin') ? 'disabled' : '' ?>>
                <option value="admin" <?= $editUser->role === 'admin' ? 'selected' : '' ?>>مدير</option>
                <option value="employee" <?= $editUser->role === 'employee' ? 'selected' : '' ?>>موظف</option>
                <option value="citizen" <?= $editUser->role === 'citizen' ? 'selected' : '' ?>>مواطن</option>
            </select>
            <?php if ($editUser->id === $selfId && $editUser->role === 'admin'): ?>
                <input type="hidden" name="role" value="admin">
                <p class="muted">لا يمكنك تخفيض دور حسابك الإداري من هنا (للحماية).</p>
            <?php endif; ?>
            <label class="form-label" for="password">كلمة مرور جديدة (اختياري)</label>
            <input class="form-input" type="password" name="password" id="password" minlength="6" placeholder="اتركها فارغة للإبقاء على الحالية">
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">حفظ</button>
                <a class="btn btn-ghost" href="index.php?r=users">رجوع</a>
            </div>
        </form>
    </div>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
