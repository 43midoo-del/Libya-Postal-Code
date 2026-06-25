<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\Assets;
use App\MBTilesService;

$z = 12;
$lat = 32.858819;
$lng = 22.799364;
$n = 1 << $z;
$x = (int) floor(($lng + 180) / 360 * $n);
$latRad = deg2rad($lat);
$y = (int) floor((1 - log(tan($latRad) + 1 / cos($latRad)) / M_PI) / 2 * $n);

echo "center tile z={$z} x={$x} y={$y}\n";

$path = Assets::offlineSatMbtilesPath();
$svc = MBTilesService::open($path);

for ($dy = -2; $dy <= 2; $dy++) {
    for ($dx = -2; $dx <= 2; $dx++) {
        $tx = $x + $dx;
        $ty = $y + $dy;
        $t = $svc->getTileXYZ($z, $tx, $ty);
        $len = $t === null ? 0 : strlen($t);
        echo sprintf(
            "  x=%d y=%d %s\n",
            $tx,
            $ty,
            $t === null ? 'MISSING' : "ok len={$len}"
        );
    }
}
