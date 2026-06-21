<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();
$z = 7;
$n = 1 << $z;
$pad = 2;
$xMin = (int) floor((9.2 + 180) / 360 * $n) - $pad;
$xMax = (int) floor((25.15 + 180) / 360 * $n) + $pad;
$latNRad = deg2rad(33.45);
$latSRad = deg2rad(19.4);
$yMin = (int) floor((1 - log(tan($latNRad) + 1 / cos($latNRad)) / M_PI) / 2 * $n) - $pad;
$yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n) + $pad;

$miss = [];
for ($x = max(0, $xMin); $x <= min($n - 1, $xMax); $x++) {
    for ($y = max(0, $yMin); $y <= min($n - 1, $yMax); $y++) {
        if ($svc->getTileXYZ($z, $x, $y) === null) {
            $miss[] = "{$x}/{$y}";
        }
    }
}
echo 'z7 missing with pad=2: ' . count($miss) . PHP_EOL;
echo implode(', ', $miss) . PHP_EOL;
