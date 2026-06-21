<?php
/**
 * Seed offline satellite (Esri World Imagery): Libya overview + Derna shabiya + Derna city.
 *
 *   php scripts/seed_derna_sat_tiles.php
 *
 * Stores in data/tiles/libya-sat.mbtiles — index.php?r=tile&layer=sat
 */
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\Assets;
use App\MBTilesService;

const USER_AGENT = 'LibyaPostalOffline/1.0 (+https://libya-postal.local; contact=admin@libya-postal.local)';

function isValidSatTile(string $body): bool
{
    if (strlen($body) < 800) {
        return false;
    }
    return str_starts_with($body, "\x89PNG\r\n\x1a\n") || str_starts_with($body, "\xff\xd8\xff");
}

/** @return string|null */
function fetchEsriTile(int $z, int $x, int $y): ?string
{
    $url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'
        . $z . '/' . $y . '/' . $x;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 35,
        CURLOPT_USERAGENT      => USER_AGENT,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER     => ['Accept: image/jpeg,image/png,*/*'],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code === 200 && is_string($body) && isValidSatTile($body)) {
        return $body;
    }
    return null;
}

if (!MBTilesService::isAvailable()) {
    fwrite(STDERR, "pdo_sqlite غير مفعّل.\n");
    exit(1);
}

/** @var list<array{name:string,south:float,west:float,north:float,east:float,zmin:int,zmax:int}> */
$zones = [
    [
        'name'  => 'libya-sat-country',
        'south' => 19.4,
        'west'  => 9.2,
        'north' => 33.45,
        'east'  => 25.15,
        'zmin'  => 5,
        'zmax'  => 8,
    ],
    [
        'name'  => 'derna-shabiya-b2-sat',
        'south' => 30.79,
        'west'  => 21.92,
        'north' => 32.95,
        'east'  => 23.25,
        'zmin'  => 9,
        'zmax'  => 12,
    ],
    [
        'name'  => 'derna-sat-city',
        'south' => 32.68,
        'west'  => 22.48,
        'north' => 32.88,
        'east'  => 22.84,
        'zmin'  => 13,
        'zmax'  => 16,
    ],
];

$path = Assets::offlineSatMbtilesPath();
$svc = new MBTilesService($path);
$svc->setMeta('format', 'jpg');
$svc->setMeta('name', 'libya-postal-sat-offline');
$svc->setMeta('maxzoom', '16');
$svc->setMeta('bounds', '9.20,19.40,25.15,33.45');
$svc->setMeta('center', '17.18,26.30,6');
$svc->setMeta('type', 'baselayer');

echo 'Sat MBTiles: ' . $path . PHP_EOL;

$total = 0;
$ok = 0;
$fail = 0;
$skipped = 0;

foreach ($zones as $zone) {
    echo PHP_EOL . '=== ' . $zone['name'] . " z={$zone['zmin']}..{$zone['zmax']} ===" . PHP_EOL;
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
                if ($existing !== null && isValidSatTile($existing)) {
                    $skipped++;
                    continue;
                }
                $body = fetchEsriTile($z, $x, $y);
                if ($body === null) {
                    $fail++;
                    if ($fail <= 30 || $fail % 50 === 0) {
                        echo "  ! z{$z}/{$x}/{$y}\n";
                    }
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

echo PHP_EOL;
echo "Total: {$total}, downloaded: {$ok}, skipped: {$skipped}, failed: {$fail}" . PHP_EOL;
$stats = $svc->stats();
echo 'Sat tiles now: ' . $stats['tiles'] . '  size: ' . number_format($stats['size_bytes'] / (1024 * 1024), 2) . " MB" . PHP_EOL;
echo 'Zoom levels: ' . json_encode($stats['zooms'], JSON_UNESCAPED_UNICODE) . PHP_EOL;
