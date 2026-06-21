<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;
use App\TileValidator;

$z = (int) ($argv[1] ?? 6);
$x = (int) ($argv[2] ?? 36);
$y = (int) ($argv[3] ?? 28);

$svc = new MBTilesService();
$t = $svc->getTileXYZ($z, $x, $y);
if ($t === null) {
    echo "MISSING\n";
    exit(0);
}
$len = strlen($t);
$valid = TileValidator::isValidPngTile($t) ? 'valid' : 'INVALID';
$blocked = (stripos($t, 'blocked') !== false) ? 'HAS_BLOCKED_TEXT' : 'no_blocked_text';
$isPng = str_starts_with($t, "\x89PNG") ? 'png' : 'not_png';
echo "z{$z}/{$x}/{$y}: len={$len} {$valid} {$blocked} {$isPng}\n";
if (preg_match('/IHDR\x00\x00\x00(.)(.)/', $t, $m)) {
    $w = unpack('N', "\x00" . $m[1])[1];
    $h = unpack('N', "\x00" . $m[2])[1];
    echo "dimensions: {$w}x{$h}\n";
}
