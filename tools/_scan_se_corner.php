<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;
use App\TileValidator;

$svc = new MBTilesService();
$bounds = ['south' => 19.4, 'west' => 9.2, 'north' => 33.45, 'east' => 25.15];

foreach ([5, 6, 7, 8] as $z) {
    $n = 1 << $z;
    $xMax = (int) floor(($bounds['east'] + 180) / 360 * $n);
    $latSRad = deg2rad($bounds['south']);
    $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n);
    $t = $svc->getTileXYZ($z, $xMax, $yMax);
    $len = $t === null ? 'MISS' : (string) strlen($t);
    $valid = ($t !== null && TileValidator::isValidPngTile($t)) ? 'valid' : 'INVALID';
    echo "z{$z} SE ({$xMax}/{$yMax}): {$len} {$valid}\n";
}

// Tiles one row/col outside bbox (what fitBounds padding may show)
echo "\nOutside bbox (padding overflow):\n";
foreach ([6, 7] as $z) {
    $n = 1 << $z;
    $xMax = (int) floor(($bounds['east'] + 180) / 360 * $n);
    $latSRad = deg2rad($bounds['south']);
    $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n);
    foreach ([[$xMax + 1, $yMax], [$xMax, $yMax + 1], [$xMax + 1, $yMax + 1]] as [$x, $y]) {
        if ($x >= $n || $y >= $n) {
            continue;
        }
        $t = $svc->getTileXYZ($z, $x, $y);
        $len = $t === null ? 'MISS' : (string) strlen($t);
        $valid = ($t !== null && TileValidator::isValidPngTile($t)) ? 'valid' : 'INVALID';
        echo "z{$z} ({$x}/{$y}): {$len} {$valid}\n";
    }
}
