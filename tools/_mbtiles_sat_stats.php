<?php
require dirname(__DIR__) . '/includes/bootstrap.php';
$path = \App\Assets::offlineSatMbtilesPath();
if (!is_file($path)) {
    echo "missing: {$path}\n";
    exit(1);
}
$s = (new App\MBTilesService($path))->stats();
echo 'sat tiles=' . $s['tiles'] . ' size=' . round($s['size_bytes'] / 1024 / 1024, 2) . "MB\n";
echo json_encode($s['zooms'], JSON_UNESCAPED_UNICODE) . "\n";
