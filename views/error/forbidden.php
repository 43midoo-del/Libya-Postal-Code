<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $message
 */
$title = 'غير مسموح';
require dirname(__DIR__) . '/partials/head.php';
?>
<main id="main-content" class="content error-page">
    <h1 class="error-page__code">403</h1>
    <p class="error-page__msg"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p>
    <p class="error-page__links"><a class="map-link" href="index.php?r=dashboard">العودة للوحة</a> — <a class="map-link" href="index.php?r=login">تسجيل الدخول</a></p>
</main>
<?php require dirname(__DIR__) . '/partials/foot.php';
