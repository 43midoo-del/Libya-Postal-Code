<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();
foreach ([
    [6, 33, 25], [6, 34, 25], [6, 35, 25], [6, 36, 25],
    [6, 33, 26], [6, 34, 26], [6, 35, 26], [6, 36, 26],
    [6, 33, 27], [6, 34, 27], [6, 35, 27], [6, 36, 27],
    [6, 33, 28], [6, 34, 28], [6, 35, 28], [6, 36, 28],
    [7, 71, 55], [7, 72, 56], [8, 144, 111], [8, 143, 102],
] as [$z, $x, $y]) {
    $t = $svc->getTileXYZ($z, $x, $y);
    $len = $t ? strlen($t) : 0;
    $head = $t ? bin2hex(substr($t, 0, 8)) : 'none';
    echo "z{$z}/{$x}/{$y} len={$len} head={$head}\n";
    if ($t && $len < 1500) {
        file_put_contents(__DIR__ . "/_tile_z{$z}_{$x}_{$y}.png", $t);
    }
}
