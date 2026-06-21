<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
use App\MBTilesService;
use App\TileValidator;

$svc = new MBTilesService();
$bounds = ['south' => 19.4, 'west' => 9.2, 'north' => 33.45, 'east' => 25.15];

foreach ([5, 6, 7] as $z) {
    $n = 1 << $z;
    $xMin = (int) floor(($bounds['west'] + 180) / 360 * $n);
    $xMax = (int) floor(($bounds['east'] + 180) / 360 * $n);
    $latNRad = deg2rad($bounds['north']);
    $latSRad = deg2rad($bounds['south']);
    $yMin = (int) floor((1 - log(tan($latNRad) + 1 / cos($latNRad)) / M_PI) / 2 * $n);
    $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n);
    echo "z{$z} x:{$xMin}-{$xMax} y:{$yMin}-{$yMax}\n";
    foreach ([[$xMax, $yMax], [$xMax + 1, $yMax], [$xMax, $yMax + 1]] as [$x, $y]) {
        if ($x < 0 || $y < 0 || $x >= $n || $y >= $n) {
            continue;
        }
        $t = $svc->getTileXYZ($z, $x, $y);
        $len = $t === null ? 'MISS' : strlen($t);
        $valid = ($t !== null && TileValidator::isValidPngTile($t, $z)) ? 'ok' : 'BAD';
        $sha = $t ? substr(sha1($t), 0, 8) : '-';
        echo "  ({$x}/{$y}): {$len} {$valid} sha={$sha}\n";
    }
}
