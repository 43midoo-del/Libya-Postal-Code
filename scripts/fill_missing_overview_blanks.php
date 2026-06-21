<?php
/**
 * Insert transparent 256×256 tiles for missing overview cells (z5–8).
 *
 *   php scripts/fill_missing_overview_blanks.php
 */
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;
use App\TileValidator;

$blankPath = dirname(__DIR__) . '/data/tiles/blank-256.png';
if (!is_file($blankPath)) {
    fwrite(STDERR, "Missing blank-256.png — run tools/_gen_blank_tile.php first\n");
    exit(1);
}
$blank = file_get_contents($blankPath);
if (!is_string($blank) || strlen($blank) < 80) {
    fwrite(STDERR, "Invalid blank tile\n");
    exit(1);
}

$zones = [
    ['south' => 19.4, 'west' => 9.2, 'north' => 33.45, 'east' => 25.15, 'zmin' => 5, 'zmax' => 8, 'pad' => 2],
];

$svc = new MBTilesService();
$filled = 0;
$skipped = 0;

foreach ($zones as $zone) {
    $pad = (int) ($zone['pad'] ?? 0);
    for ($z = $zone['zmin']; $z <= $zone['zmax']; $z++) {
        $n = 1 << $z;
        $xMin = (int) floor(($zone['west'] + 180) / 360 * $n) - $pad;
        $xMax = (int) floor(($zone['east'] + 180) / 360 * $n) + $pad;
        $latNRad = deg2rad($zone['north']);
        $latSRad = deg2rad($zone['south']);
        $yMin = (int) floor((1 - log(tan($latNRad) + 1 / cos($latNRad)) / M_PI) / 2 * $n) - $pad;
        $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n) + $pad;

        for ($x = max(0, $xMin); $x <= min($n - 1, $xMax); $x++) {
            for ($y = max(0, $yMin); $y <= min($n - 1, $yMax); $y++) {
                $existing = $svc->getTileXYZ($z, $x, $y);
                if ($existing !== null && TileValidator::isValidPngTile($existing, $z)) {
                    $skipped++;
                    continue;
                }
                if ($existing !== null) {
                    $pdo = new PDO('sqlite:' . $svc->path());
                    $tmsY = ((1 << $z) - 1) - $y;
                    $pdo->prepare(
                        'DELETE FROM tiles WHERE zoom_level = :z AND tile_column = :x AND tile_row = :y'
                    )->execute(['z' => $z, 'x' => $x, 'y' => $tmsY]);
                }
                $svc->putTileXYZ($z, $x, $y, $blank);
                $filled++;
            }
        }
    }
}

$stats = $svc->stats();
echo "filled={$filled} skipped={$skipped} total={$stats['tiles']} size="
    . number_format($stats['size_bytes'] / (1024 * 1024), 2) . " MB\n";
