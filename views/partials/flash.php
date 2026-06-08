<?php
/**
 * Renders a flash line from Flash::getAndClear (array) or legacy string.
 * @var array{m: string, t: 'ok'|'err'|'info'}|string|null $flash
 */
$flash = $flash ?? null;
if ($flash === null || $flash === '') {
    return;
}
if (is_string($flash)) {
    $msg  = $flash;
    $type = 'ok';
} else {
    $msg  = (string) ($flash['m'] ?? '');
    $type = (string) ($flash['t'] ?? 'info');
    if (!in_array($type, ['ok', 'err', 'info'], true)) {
        $type = 'info';
    }
}
if ($msg === '') {
    return;
}
$cls  = 'alert--' . $type;
$role = $type === 'err' ? 'alert' : 'status';
?>
<div class="alert flash-msg <?= htmlspecialchars($cls, ENT_QUOTES, 'UTF-8') ?>" role="<?= htmlspecialchars($role, ENT_QUOTES, 'UTF-8') ?>"><?= htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') ?></div>
