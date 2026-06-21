<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;
use App\TileValidator;

$svc = new MBTilesService();
$pdo = new PDO('sqlite:' . $svc->path());
$st = $pdo->query('SELECT zoom_level, tile_column, tile_row, length(tile_data) AS len FROM tiles WHERE zoom_level BETWEEN 5 AND 8');

$suspect = [];
while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $z = (int) $row['zoom_level'];
    $x = (int) $row['tile_column'];
    $yTms = (int) $row['tile_row'];
    $len = (int) $row['len'];
    $y = ((1 << $z) - 1) - $yTms;
    if ($len >= 5000 && $len < 8000) {
        $blob = $svc->getTileXYZ($z, $x, $y);
        if (!is_string($blob)) {
            continue;
        }
        if (!TileValidator::isValidPngTile($blob)) {
            $suspect[] = "INVALID z{$z}/{$x}/{$y} len={$len}";
        } elseif ($len >= 5500 && $len < 6000) {
            $hasBlocked = stripos($blob, 'blocked') !== false;
            $suspect[] = "EDGE z{$z}/{$x}/{$y} len={$len}" . ($hasBlocked ? ' BLOCKED_TEXT' : '');
        }
    }
}
echo count($suspect) . " suspect tiles z5-8:\n";
foreach (array_slice($suspect, 0, 50) as $line) {
    echo $line . "\n";
}
