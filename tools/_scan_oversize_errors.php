<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
use App\MBTilesService;
use App\TileValidator;

$svc = new MBTilesService();
$pdo = new PDO('sqlite:' . $svc->path());
$st = $pdo->query('SELECT zoom_level, tile_column, tile_row, length(tile_data) AS len FROM tiles WHERE zoom_level BETWEEN 5 AND 8 AND length(tile_data) BETWEEN 7200 AND 12000');
$bad = 0;
while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $z = (int) $row['zoom_level'];
    $x = (int) $row['tile_column'];
    $y = (int) $row['tile_row'];
    $blob = $svc->getTileXYZ($z, $x, $y);
    if (!is_string($blob)) {
        continue;
    }
    if (stripos($blob, 'blocked') !== false || stripos($blob, 'Access') !== false) {
        echo "TEXT z{$z}/{$x}/{$y} len=" . strlen($blob) . PHP_EOL;
        $bad++;
        continue;
    }
    // Heuristic: mostly flat yellow/error tiles have low unique byte count
    if (!TileValidator::isValidPngTile($blob, $z)) {
        echo "INVALID z{$z}/{$x}/{$y} len=" . strlen($blob) . PHP_EOL;
        $bad++;
    }
}
echo "done suspicious={$bad}\n";

// bottom row scan
echo "\nBottom row z6:\n";
for ($x = 33; $x <= 37; $x++) {
    $t = $svc->getTileXYZ(6, $x, 28);
    $len = $t ? strlen($t) : 0;
    $v = $t && TileValidator::isValidPngTile($t, 6) ? 'ok' : 'BAD';
    $blk = $t && stripos($t, 'blocked') !== false ? ' BLOCKED' : '';
    echo "  {$x}/28 len={$len} {$v}{$blk}\n";
}
