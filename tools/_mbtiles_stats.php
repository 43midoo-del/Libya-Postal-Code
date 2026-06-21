<?php
require dirname(__DIR__) . '/includes/bootstrap.php';
$s = (new App\MBTilesService())->stats();
echo 'tiles=' . $s['tiles'] . ' size=' . round($s['size_bytes'] / 1024 / 1024, 2) . "MB\n";
echo json_encode($s['zooms'], JSON_UNESCAPED_UNICODE) . "\n";
