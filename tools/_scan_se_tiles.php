<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();

foreach ([5, 6, 7, 8] as $z) {
    for ($x = 30; $x <= 40; $x++) {
        for ($y = 20; $y <= 32; $y++) {
            $t = $svc->getTileXYZ($z, $x, $y);
            if ($t === null) {
                echo "MISS z{$z}/{$x}/{$y}\n";
                continue;
            }
            $len = strlen($t);
            if ($len < 2500) {
                echo "SMALL z{$z}/{$x}/{$y} len={$len}\n";
            }
        }
    }
}
