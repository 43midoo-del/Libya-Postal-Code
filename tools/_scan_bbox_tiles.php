<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();
$south = 19.4;
$west = 9.2;
$north = 33.45;
$east = 25.15;

for ($z = 5; $z <= 8; $z++) {
    $n = 1 << $z;
    $xMin = (int) floor(($west + 180) / 360 * $n);
    $xMax = (int) floor(($east + 180) / 360 * $n);
    $latNRad = deg2rad($north);
    $latSRad = deg2rad($south);
    $yMin = (int) floor((1 - log(tan($latNRad) + 1 / cos($latNRad)) / M_PI) / 2 * $n);
    $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n);

    echo "z{$z} x={$xMin}..{$xMax} y={$yMin}..{$yMax}\n";
    for ($x = $xMin; $x <= $xMax; $x++) {
        for ($y = $yMin; $y <= $yMax; $y++) {
            $t = $svc->getTileXYZ($z, $x, $y);
            if ($t === null) {
                echo "  MISS {$x}/{$y}\n";
            } else {
                $len = strlen($t);
                if ($len < 2500) {
                    echo "  SMALL {$x}/{$y} len={$len}\n";
                }
            }
        }
    }
}
