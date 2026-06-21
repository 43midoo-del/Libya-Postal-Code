<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();
$zone = ['south' => 30.79, 'west' => 21.92, 'north' => 33.08, 'east' => 23.35, 'zmin' => 9, 'zmax' => 12];
$miss = 0;
$total = 0;

for ($z = $zone['zmin']; $z <= $zone['zmax']; $z++) {
    $n = 1 << $z;
    $xMin = (int) floor(($zone['west'] + 180) / 360 * $n);
    $xMax = (int) floor(($zone['east'] + 180) / 360 * $n);
    $latNRad = deg2rad($zone['north']);
    $latSRad = deg2rad($zone['south']);
    $yMin = (int) floor((1 - log(tan($latNRad) + 1 / cos($latNRad)) / M_PI) / 2 * $n);
    $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n);
    for ($x = $xMin; $x <= $xMax; $x++) {
        for ($y = $yMin; $y <= $yMax; $y++) {
            $total++;
            if ($svc->getTileXYZ($z, $x, $y) === null) {
                $miss++;
                if ($z >= 10) {
                    echo "MISS z{$z}/{$x}/{$y}\n";
                }
            }
        }
    }
}
echo "total={$total} miss={$miss}\n";
