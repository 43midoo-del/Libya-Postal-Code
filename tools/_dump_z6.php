<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();
$t = $svc->getTileXYZ(6, 36, 28);
if ($t) {
    file_put_contents(__DIR__ . '/_tile_z6_36_28.png', $t);
    echo 'len=' . strlen($t) . ' sha=' . sha1($t) . PHP_EOL;
}
