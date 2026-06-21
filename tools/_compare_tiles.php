<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();
$good = $svc->getTileXYZ(6, 33, 25);
$bad = $svc->getTileXYZ(6, 36, 28);
echo 'good len=' . strlen((string)$good) . PHP_EOL;
echo 'bad len=' . strlen((string)$bad) . PHP_EOL;
echo 'good head: ' . bin2hex(substr((string)$good, 0, 64)) . PHP_EOL;
echo 'bad head:  ' . bin2hex(substr((string)$bad, 0, 64)) . PHP_EOL;
$gi = getimagesizefromstring((string)$good);
$bi = getimagesizefromstring((string)$bad);
echo 'good img: ' . json_encode($gi) . PHP_EOL;
echo 'bad img:  ' . json_encode($bi) . PHP_EOL;
