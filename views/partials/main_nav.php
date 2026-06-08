<?php
/**
 * Shared top navigation (RTL). Set $userRole, $navCurrent
 * (dashboard|addresses|address|users|admin_geo|profile|none)
 *
 * @var string $userRole
 * @var string $navCurrent
 */
$userRole = $userRole ?? 'citizen';
$navCurrent = $navCurrent ?? 'none';
$isStaff    = in_array($userRole, ['admin', 'employee'], true);
$isAdmin    = $userRole === 'admin';
$isActive   = static function (string $k) use ($navCurrent): string {
    return $navCurrent === $k ? ' is-active' : '';
};
?>
<nav class="main-nav" aria-label="التنقّل الرئيسي">
    <a class="main-nav__link<?= $isActive('dashboard') ?>" href="index.php?r=dashboard">اللوحة</a>
    <a class="main-nav__link<?= $isActive('addresses') ?>" href="index.php?r=addresses">العناوين</a>
    <a class="main-nav__link<?= $isActive('postal_lookup') ?>" href="index.php?r=postal_lookup">بحث بالرمز</a>
    <?php if ($isStaff): ?>
    <a class="main-nav__link<?= $isActive('address') ?>" href="index.php?r=address_new">إضافة عنوان</a>
    <?php endif; ?>
    <?php if ($isStaff): ?>
    <a class="main-nav__link<?= $isActive('boundary_editor') ?>" href="index.php?r=boundary_editor">محرر الحدود</a>
    <?php endif; ?>
    <?php if ($isAdmin): ?>
    <a class="main-nav__link<?= $isActive('users') ?>" href="index.php?r=users">المستخدمون</a>
    <a class="main-nav__link<?= $isActive('admin_geo') ?>" href="index.php?r=admin_geo">التقسيم الإداري</a>
    <a class="main-nav__link<?= $isActive('tile_sync') ?>" href="index.php?r=tile_sync">مزامنة الخريطة</a>
    <?php endif; ?>
    <a class="main-nav__link<?= $isActive('profile') ?>" href="index.php?r=profile">حسابي</a>
</nav>
