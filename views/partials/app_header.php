<?php
/**
 * Sticky app header: title, role chip + logout, main_nav.
 * Expects: $title (page h1), $userRole, $navCurrent (optional), $topbarExtraClass (optional)
 */
$navCurrent = $navCurrent ?? 'none';
$topbarExtraClass = (string) ($topbarExtraClass ?? '');
$roleAr = match ($userRole) {
    'admin'    => 'مدير',
    'employee' => 'موظف',
    'citizen'  => 'مواطن',
    default    => (string) $userRole,
};
$hc = 'topbar' . ($topbarExtraClass !== '' ? ' ' . htmlspecialchars($topbarExtraClass, ENT_QUOTES, 'UTF-8') : '');
?>
<header class="<?= $hc ?>" role="banner">
    <h1 class="topbar__title"><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></h1>
    <div class="topbar__cluster">
        <div class="topbar__meta">
            <span class="badge badge--role" title="الدور"><?= htmlspecialchars($roleAr, ENT_QUOTES, 'UTF-8') ?></span>
            <a class="topbar__logout" href="index.php?r=logout">خروج</a>
        </div>
        <?php require __DIR__ . '/main_nav.php'; ?>
    </div>
</header>
