<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;
use App\TileValidator;

$svc = new MBTilesService();

// Ring outside strict Libya bbox (padding / keepBuffer)
$checks = [];
for ($z = 5; $z <= 8; $z++) {
    $n = 1 << $z;
    $xMin = (int) floor((9.2 + 180) / 360 * $n) - 1;
    $xMax = (int) floor((25.15 + 180) / 360 * $n) + 1;
    $latNRad = deg2rad(33.45);
    $latSRad = deg2rad(19.4);
    $yMin = (int) floor((1 - log(tan($latNRad) + 1 / cos($latNRad)) / M_PI) / 2 * $n) - 1;
    $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n) + 1;
    for ($x = max(0, $xMin); $x <= min($n - 1, $xMax); $x++) {
        for ($y = max(0, $yMin); $y <= min($n - 1, $yMax); $y++) {
            $t = $svc->getTileXYZ($z, $x, $y);
            if ($t === null) {
                $checks[] = "MISS z{$z}/{$x}/{$y}";
            } elseif (!TileValidator::isValidPngTile($t)) {
                $checks[] = 'BAD z' . $z . '/' . $x . '/' . $y . ' len=' . strlen($t);
            }
        }
    }
}
echo 'count=' . count($checks) . PHP_EOL;
foreach (array_slice($checks, 0, 40) as $c) {
    echo $c . PHP_EOL;
}
