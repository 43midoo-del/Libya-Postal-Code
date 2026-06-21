<?php
/**
 * Remove invalid OSM placeholder tiles from libya.mbtiles.
 *
 *   php scripts/purge_blocked_tiles.php
 */
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;
use App\TileValidator;

if (!MBTilesService::isAvailable()) {
    fwrite(STDERR, "pdo_sqlite غير مفعّل.\n");
    exit(1);
}

$svc = new MBTilesService();
$pdo = new PDO('sqlite:' . $svc->path());
$st = $pdo->query('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles');
$removed = 0;
$del = $pdo->prepare(
    'DELETE FROM tiles WHERE zoom_level = :z AND tile_column = :x AND tile_row = :y'
);

while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $blob = $row['tile_data'];
    if (!is_string($blob) || TileValidator::isValidPngTile($blob, (int) $row['zoom_level'])) {
        continue;
    }
    $del->execute([
        'z' => (int) $row['zoom_level'],
        'x' => (int) $row['tile_column'],
        'y' => (int) $row['tile_row'],
    ]);
    $removed++;
}

echo "Removed invalid tiles: {$removed}\n";
$stats = $svc->stats();
echo 'Remaining: ' . $stats['tiles'] . '  size: ' . number_format($stats['size_bytes'] / 1024 / 1024, 2) . " MB\n";
