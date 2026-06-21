<?php
require dirname(__DIR__) . '/includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();
$pdo = new PDO('sqlite:' . $svc->path());

$sizeHist = [];
$st = $pdo->query('SELECT length(tile_data) AS len, COUNT(*) AS c FROM tiles GROUP BY len ORDER BY c DESC LIMIT 20');
echo "Top tile sizes:\n";
while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
    echo "  len={$r['len']} count={$r['c']}\n";
}

$st2 = $pdo->query('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles WHERE zoom_level=14 LIMIT 5');
echo "\nSample z14 tiles:\n";
while ($r = $st2->fetch(PDO::FETCH_ASSOC)) {
    $blob = (string) $r['tile_data'];
    $tmsY = (int) $r['tile_row'];
    $z = (int) $r['zoom_level'];
    $y = ((1 << $z) - 1) - $tmsY;
    echo "  z{$z}/{$r['tile_column']}/{$y} len=" . strlen($blob) . "\n";
}

// Save one z14 tile for visual inspection
$st3 = $pdo->query('SELECT tile_data FROM tiles WHERE zoom_level=14 LIMIT 1');
$row = $st3->fetch(PDO::FETCH_ASSOC);
if ($row) {
    file_put_contents(dirname(__DIR__) . '/data/tiles/_sample_z14.png', $row['tile_data']);
    echo "\nWrote data/tiles/_sample_z14.png\n";
}
