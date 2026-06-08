<?php
/**
 * @var string $appName
 * @var string $title
 * @var string|null $error
 * @var string $csrf
 */
$appShellClass = 'app-shell--auth';
require dirname(__DIR__) . '/partials/head.php';
?>
<main id="main-content" class="auth-card">
    <h1 class="auth-title">تسجيل الدخول</h1>
    <p class="auth-sub"><?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?></p>
    <?php if (!empty($error)): ?>
        <div class="alert alert-error" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div>
    <?php endif; ?>
    <form method="post" action="index.php?r=auth" class="form-stack" autocomplete="on">
        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
        <label class="form-label" for="email">البريد الإلكتروني</label>
        <input class="form-input" type="email" name="email" id="email" required maxlength="255" placeholder="you@example.com">
        <label class="form-label" for="password">كلمة المرور</label>
        <input class="form-input" type="password" name="password" id="password" required minlength="4" placeholder="••••••••">
        <button type="submit" class="btn btn-primary">دخول</button>
    </form>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
