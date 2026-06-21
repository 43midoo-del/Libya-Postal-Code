<?php
/**
 * Seed offline Esri reference label tiles (roads + place names) for Derna.
 *
 *   php scripts/seed_derna_labels_tiles.php
 *
 *   libya-labels-transport.mbtiles → layer=labels-transport (roads)
 *   libya-labels-places.mbtiles   → layer=labels-places (city/place names)
 */
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\Assets;
use App\MBTilesService;

const USER_AGENT = 'LibyaPostalOffline/1.0 (+https://libya-postal.local; contact=admin@libya-postal.local)';

function isValidLabelTile(string $body): bool
{
    if (strlen($body) < 80) {
        return false;
    }
    return str_starts_with($body, "\x89PNG\r\n\x1a\n");
}

/** @return string|null */
function fetchEsriRefTile(string $service, int $z, int $x, int $y): ?string
{
    $url = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/'
        . $service
        . '/MapServer/tile/' . $z . '/' . $y . '/' . $x;
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
    if ($code === 200 && is_string($body) && isValidLabelTile($body)) {
        return $body;
    }
    return null;
}

/** @param list<array{name:string,south:float,west:float,north:float,east:float,zmin:int,zmax:int}> $zones */
function seedLayer(string $label, string $service, string $mbPath, array $zones): void
{
    echo PHP_EOL . '========== ' . $label . ' ==========' . PHP_EOL;
    echo 'Path: ' . $mbPath . PHP_EOL;

    $svc = new MBTilesService($mbPath);
    $svc->setMeta('format', 'png');
    $svc->setMeta('name', 'libya-postal-' . $label);
    $svc->setMeta('maxzoom', '16');
    $svc->setMeta('bounds', '9.20,19.40,25.15,33.45');
    $svc->setMeta('center', '17.18,26.30,6');
    $svc->setMeta('type', 'overlay');

    $total = 0;
    $ok = 0;
    $fail = 0;
    $skipped = 0;

    foreach ($zones as $zone) {
        echo PHP_EOL . '--- ' . $zone['name'] . " z={$zone['zmin']}..{$zone['zmax']} ---" . PHP_EOL;
        for ($z = $zone['zmin']; $z <= $zone['zmax']; $z++) {
            $n = (1 << $z);
            $xMin = (int) floor(($zone['west'] + 180) / 360 * $n);
            $xMax = (int) floor(($zone['east'] + 180) / 360 * $n);
            $latNRad = deg2rad($zone['north']);
            $latSRad = deg2rad($zone['south']);
            $yMin = (int) floor((1 - log(tan($latNRad) + 1 / cos($latNRad)) / M_PI) / 2 * $n);
            $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n);
            $zoneTiles = 0;

            for ($x = max(0, $xMin); $x <= min($n - 1, $xMax); $x++) {
                for ($y = max(0, $yMin); $y <= min($n - 1, $yMax); $y++) {
                    $total++;
                    $zoneTiles++;
                    $existing = $svc->getTileXYZ($z, $x, $y);
                    if ($existing !== null && isValidLabelTile($existing)) {
                        $skipped++;
                        continue;
                    }
                    $body = fetchEsriRefTile($service, $z, $x, $y);
                    if ($body === null) {
                        $fail++;
                        usleep(300 * 1000);
                        continue;
                    }
                    $svc->putTileXYZ($z, $x, $y, $body);
                    $ok++;
                    if ($ok % 25 === 0) {
                        echo "  … {$ok} downloaded (z{$z})\n";
                    }
                    usleep(150 * 1000);
                }
            }
            echo "  z{$z}: {$zoneTiles} cells\n";
        }
    }

    $stats = $svc->stats();
    echo PHP_EOL . "{$label}: total={$total} ok={$ok} skipped={$skipped} fail={$fail}" . PHP_EOL;
    echo "  tiles={$stats['tiles']} size=" . number_format($stats['size_bytes'] / (1024 * 1024), 2) . " MB" . PHP_EOL;
}

if (!MBTilesService::isAvailable()) {
    fwrite(STDERR, "pdo_sqlite غير مفعّل.\n");
    exit(1);
}

$zones = [
    ['name' => 'libya-labels-country', 'south' => 19.4, 'west' => 9.2, 'north' => 33.45, 'east' => 25.15, 'zmin' => 5, 'zmax' => 8],
    ['name' => 'derna-shabiya-b2-labels', 'south' => 30.79, 'west' => 21.92, 'north' => 32.95, 'east' => 23.25, 'zmin' => 9, 'zmax' => 12],
    ['name' => 'derna-labels-overview', 'south' => 32.55, 'west' => 22.35, 'north' => 32.95, 'east' => 23.05, 'zmin' => 11, 'zmax' => 12],
    ['name' => 'derna-labels-city', 'south' => 32.68, 'west' => 22.48, 'north' => 32.88, 'east' => 22.84, 'zmin' => 13, 'zmax' => 16],
];

seedLayer(
    'labels-transport',
    'World_Transportation',
    Assets::offlineLabelsTransportPath(),
    $zones
);

seedLayer(
    'labels-places',
    'World_Boundaries_and_Places',
    Assets::offlineLabelsPlacesPath(),
    $zones
);

echo PHP_EOL . 'Done.' . PHP_EOL;
