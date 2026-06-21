<?php
declare(strict_types=1);
require dirname(__DIR__) . '/includes/bootstrap.php';
use App\MBTilesService;
use App\TileValidator;

[$z, $x, $y] = [(int)($argv[1] ?? 6), (int)($argv[2] ?? 36), (int)($argv[3] ?? 28)];
$svc = new MBTilesService();
$t = $svc->getTileXYZ($z, $x, $y);
if ($t === null) {
    echo "MISSING\n";
    exit(0);
}
$valid = TileValidator::isValidPngTile($t, $z) ? 'valid' : 'INVALID';
$blank = TileValidator::isBlankTile($t) ? 'blank' : 'map';
echo "z{$z}/{$x}/{$y} len=" . strlen($t) . " {$valid} {$blank}\n";
if (function_exists('getimagesizefromstring')) {
    $info = @getimagesizefromstring($t);
    echo 'dims=' . ($info ? ($info[0] . 'x' . $info[1]) : '?') . "\n";
}
