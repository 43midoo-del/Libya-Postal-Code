<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
use App\MBTilesService;

$z = (int) ($argv[1] ?? 6);
$x = (int) ($argv[2] ?? 35);
$y = (int) ($argv[3] ?? 28);
$out = __DIR__ . "/_tile_z{$z}_{$x}_{$y}.png";
$t = (new MBTilesService())->getTileXYZ($z, $x, $y);
if (!is_string($t)) {
    fwrite(STDERR, "missing\n");
    exit(1);
}
file_put_contents($out, $t);
echo "wrote {$out} len=" . strlen($t) . "\n";
