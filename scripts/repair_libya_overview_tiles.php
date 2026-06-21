<?php
/**
 * Repair missing or corrupt OSM overview tiles (z5–8) in libya.mbtiles.
 *
 *   php scripts/repair_libya_overview_tiles.php
 */
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;
use App\TileValidator;

const USER_AGENT   = 'LibyaPostalOffline/1.0 (+https://libya-postal.local; contact=admin@libya-postal.local)';

function isValidMapTile(string $body, int $zoom): bool
{
    return TileValidator::isValidPngTile($body, $zoom);
}

/** @return string|null */
function fetchTile(int $z, int $x, int $y): ?string
{
    $sources = [
        'https://tile.openstreetmap.de/' . $z . '/' . $x . '/' . $y . '.png',
        'https://tile.openstreetmap.org/' . $z . '/' . $x . '/' . $y . '.png',
    ];
    foreach ($sources as $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 35,
            CURLOPT_USERAGENT      => USER_AGENT,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER     => ['Accept: image/png,*/*'],
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code === 200 && is_string($body) && isValidMapTile($body, $z)) {
            return $body;
        }
        usleep(300 * 1000);
    }
    return null;
}

if (!MBTilesService::isAvailable()) {
    fwrite(STDERR, "pdo_sqlite غير مفعّل.\n");
    exit(1);
}

$zones = [
    ['south' => 19.4, 'west' => 9.2, 'north' => 33.45, 'east' => 25.15, 'zmin' => 5, 'zmax' => 8, 'pad' => 2],
];

$svc = new MBTilesService();
$need = [];
$removed = 0;

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
                if ($existing !== null && !isValidMapTile($existing, $z)) {
                    $pdo = new PDO('sqlite:' . $svc->path());
                    $pdo->prepare(
                        'DELETE FROM tiles WHERE zoom_level = :z AND tile_column = :x AND tile_row = :y'
                    )->execute(['z' => $z, 'x' => $x, 'y' => $y]);
                    $removed++;
                    $existing = null;
                }
                if ($existing === null) {
                    $need[] = [$z, $x, $y];
                }
            }
        }
    }
}

echo 'Removed corrupt: ' . $removed . PHP_EOL;
echo 'To download: ' . count($need) . PHP_EOL;

$ok = 0;
$fail = 0;
foreach ($need as [$z, $x, $y]) {
    $body = fetchTile($z, $x, $y);
    if ($body === null) {
        $fail++;
        echo "  FAIL z{$z}/{$x}/{$y}\n";
        continue;
    }
    $svc->putTileXYZ($z, $x, $y, $body);
    $ok++;
    echo "  OK z{$z}/{$x}/{$y}\n";
    usleep(200 * 1000);
}

$stats = $svc->stats();
echo PHP_EOL . "done ok={$ok} fail={$fail} tiles={$stats['tiles']} size="
    . number_format($stats['size_bytes'] / (1024 * 1024), 2) . " MB" . PHP_EOL;
