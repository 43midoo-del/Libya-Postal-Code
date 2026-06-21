<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

const MIN_GOOD = 800;

$south = 19.4;
$west = 9.2;
$north = 33.45;
$east = 25.15;
$pad = 1; // one tile ring outside bbox (Leaflet keepBuffer / fit padding)

$svc = new MBTilesService();
$issues = [];

for ($z = 5; $z <= 8; $z++) {
    $n = 1 << $z;
    $xMin = (int) floor(($west + 180) / 360 * $n) - $pad;
    $xMax = (int) floor(($east + 180) / 360 * $n) + $pad;
    $latNRad = deg2rad($north);
    $latSRad = deg2rad($south);
    $yMin = (int) floor((1 - log(tan($latNRad) + 1 / cos($latNRad)) / M_PI) / 2 * $n) - $pad;
    $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n) + $pad;

    for ($x = max(0, $xMin); $x <= min($n - 1, $xMax); $x++) {
        for ($y = max(0, $yMin); $y <= min($n - 1, $yMax); $y++) {
            $t = $svc->getTileXYZ($z, $x, $y);
            if ($t === null) {
                $issues[] = "missing z{$z}/{$x}/{$y}";
            } elseif (strlen($t) < MIN_GOOD) {
                $issues[] = 'tiny z' . $z . '/' . $x . '/' . $y . ' len=' . strlen($t);
            }
        }
    }
}

echo 'issues=' . count($issues) . PHP_EOL;
foreach ($issues as $line) {
    echo $line . PHP_EOL;
}
