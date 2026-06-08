<?php
/**
 * @var string $appName
 * @var string $title
 * @var string|null $error
 * @var array{name?: string, email?: string} $old
 * @var string $csrf
 */
$old = $old ?? [];
$appShellClass = 'app-shell--auth';
require dirname(__DIR__) . '/partials/head.php';
?>
<main id="main-content" class="auth-card">
    <h1 class="auth-title">إنشاء حساب مواطن</h1>
    <p class="auth-sub"><?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?></p>
    <?php if (!empty($error)): ?>
        <div class="alert alert--err" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div>
    <?php endif; ?>
    <form method="post" action="index.php?r=register_store" class="form-stack" autocomplete="on">
        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
        <label class="form-label" for="name">الاسم الكامل</label>
        <input class="form-input" type="text" name="name" id="name" required maxlength="120"
               value="<?= htmlspecialchars((string) ($old['name'] ?? ''), ENT_QUOTES, 'UTF-8') ?>"
               placeholder="مثال: محمد علي">
        <label class="form-label" for="email">البريد الإلكتروني</label>
        <input class="form-input" type="email" name="email" id="email" required maxlength="255"
               value="<?= htmlspecialchars((string) ($old['email'] ?? ''), ENT_QUOTES, 'UTF-8') ?>"
               placeholder="you@example.com">
        <label class="form-label" for="password">كلمة المرور</label>
        <input class="form-input" type="password" name="password" id="password" required minlength="6" placeholder="6 خانات فأكثر">
        <label class="form-label" for="password_confirm">تأكيد كلمة المرور</label>
        <input class="form-input" type="password" name="password_confirm" id="password_confirm" required minlength="6">
        <button type="submit" class="btn btn-primary">إنشاء الحساب</button>
        <p class="muted auth-card__hint">لديك حساب بالفعل؟ <a class="map-link" href="index.php?r=login">تسجيل الدخول</a></p>
    </form>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
