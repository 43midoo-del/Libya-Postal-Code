<?php
/**
 * Seed MBTiles for offline use — Derna shabiya (B2) + Derna city streets (high zoom).
 *
 *   php scripts/seed_derna_tiles.php
 *
 * Uses OSM.de mirror + tile validation (rejects OSM 403 block PNG).
 */
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;
use App\TileValidator;

const USER_AGENT = 'LibyaPostalOffline/1.0 (+https://libya-postal.local; contact=admin@libya-postal.local)';

function isValidMapTile(string $body): bool
{
    return TileValidator::isValidPngTile($body);
}

/** @return array{0:string,1:int}|null */
function fetchTile(int $z, int $x, int $y): ?array
{
    $sources = [
        'https://tile.openstreetmap.de/' . $z . '/' . $x . '/' . $y . '.png',
        'https://tile.openstreetmap.org/' . $z . '/' . $x . '/' . $y . '.png',
    ];
    foreach ($sources as $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_USERAGENT      => USER_AGENT,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER     => ['Accept: image/png,*/*'],
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code === 200 && is_string($body) && isValidMapTile($body)) {
            return [$body, $code];
        }
        usleep(250 * 1000);
    }
    return null;
}

if (!MBTilesService::isAvailable()) {
    fwrite(STDERR, "pdo_sqlite غير مفعّل.\n");
    exit(1);
}

/** @var list<array{name:string,south:float,west:float,north:float,east:float,zmin:int,zmax:int}> */
$zones = [
    ['name' => 'libya-overview', 'south' => 19.4, 'west' => 9.2, 'north' => 33.45, 'east' => 25.15, 'zmin' => 5, 'zmax' => 8],
    ['name' => 'derna-shabiya-b2', 'south' => 30.79, 'west' => 21.92, 'north' => 33.08, 'east' => 23.35, 'zmin' => 9, 'zmax' => 12],
    ['name' => 'derna-city', 'south' => 32.68, 'west' => 22.48, 'north' => 32.88, 'east' => 22.84, 'zmin' => 13, 'zmax' => 16],
    ['name' => 'derna-city-core', 'south' => 32.728, 'west' => 22.595, 'north' => 32.792, 'east' => 22.725, 'zmin' => 17, 'zmax' => 17],
];

$svc = new MBTilesService();
echo 'MBTiles: ' . $svc->path() . PHP_EOL;

$total = 0;
$ok = 0;
$fail = 0;
$skipped = 0;
$replaced = 0;

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
                if ($existing !== null && isValidMapTile($existing)) {
                    $skipped++;
                    continue;
                }
                if ($existing !== null && isBlockedTile($existing)) {
                    $replaced++;
                }
                $fetched = fetchTile($z, $x, $y);
                if ($fetched === null) {
                    $fail++;
                    echo "  ! z{$z}/{$x}/{$y} blocked/invalid\n";
                    usleep(300 * 1000);
                    continue;
                }
                $svc->putTileXYZ($z, $x, $y, $fetched[0]);
                $ok++;
                if ($ok % 25 === 0) {
                    echo "  … {$ok} downloaded (z{$z})\n";
                }
                usleep(200 * 1000);
            }
        }
        echo "  z{$z}: {$zoneTiles} cells\n";
    }
}

$svc->setMeta('maxzoom', '17');
$svc->setMeta('bounds', '21.92,30.79,23.25,32.95');
$svc->setMeta('center', '22.6478,32.7558,14');
$svc->setMeta('name', 'libya-postal-derna-offline');

echo PHP_EOL;
echo "Total: {$total}, downloaded: {$ok}, replaced-blocked: {$replaced}, skipped-ok: {$skipped}, failed: {$fail}" . PHP_EOL;
$stats = $svc->stats();
echo 'MBTiles tiles now: ' . $stats['tiles'] . '  size: ' . number_format($stats['size_bytes'] / (1024 * 1024), 2) . " MB" . PHP_EOL;
echo 'Zoom levels: ' . json_encode($stats['zooms'], JSON_UNESCAPED_UNICODE) . PHP_EOL;
