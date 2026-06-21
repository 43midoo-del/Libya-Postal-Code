<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();
// Bottom row of Libya at z6 (y=28) and z7 (y=56)
foreach ([6 => 28, 7 => 56] as $z => $y) {
    $n = 1 << $z;
    $xMin = (int) floor((9.2 + 180) / 360 * $n);
    $xMax = (int) floor((25.15 + 180) / 360 * $n);
    echo "z{$z} y={$y}:\n";
    for ($x = $xMin; $x <= $xMax; $x++) {
        $t = $svc->getTileXYZ($z, $x, $y);
        $status = $t === null ? 'MISS' : 'ok len=' . strlen($t);
        echo "  {$x}/{$y} {$status}\n";
    }
}
