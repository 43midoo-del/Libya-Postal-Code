<?php
/**
 * Download missing Esri satellite tiles inside the Derna shabiya offline zone (z9–12).
 *
 *   php scripts/repair_derna_sat_zone_tiles.php
 */
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\Assets;
use App\MBTilesService;

const USER_AGENT = 'LibyaPostalOffline/1.0 (+https://libya-postal.local; contact=admin@libya-postal.local)';

function isValidSatTile(string $body): bool
{
    if (strlen($body) < 500) {
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

$zone = [
    'name'  => 'derna-shabiya-b2-sat',
    'south' => 30.79,
    'west'  => 21.92,
    'north' => 33.08,
    'east'  => 23.35,
    'zmin'  => 9,
    'zmax'  => 12,
];

$path = Assets::offlineSatMbtilesPath();
$svc = new MBTilesService($path);
echo 'Sat MBTiles: ' . $path . PHP_EOL;
echo 'Zone: ' . $zone['name'] . PHP_EOL;

$ok = 0;
$fail = 0;
$skipped = 0;

for ($z = $zone['zmin']; $z <= $zone['zmax']; $z++) {
    $n = (1 << $z);
    $xMin = (int) floor(($zone['west'] + 180) / 360 * $n);
    $xMax = (int) floor(($zone['east'] + 180) / 360 * $n);
    $latNRad = deg2rad($zone['north']);
    $latSRad = deg2rad($zone['south']);
    $yMin = (int) floor((1 - log(tan($latNRad) + 1 / cos($latNRad)) / M_PI) / 2 * $n);
    $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n);

    for ($x = max(0, $xMin); $x <= min($n - 1, $xMax); $x++) {
        for ($y = max(0, $yMin); $y <= min($n - 1, $yMax); $y++) {
            $existing = $svc->getTileXYZ($z, $x, $y);
            if ($existing !== null && isValidSatTile($existing)) {
                $skipped++;
                continue;
            }
            $body = fetchEsriTile($z, $x, $y);
            if ($body === null) {
                $fail++;
                if ($fail <= 40) {
                    echo "  ! z{$z}/{$x}/{$y}\n";
                }
                usleep(300 * 1000);
                continue;
            }
            $svc->putTileXYZ($z, $x, $y, $body);
            $ok++;
            if ($ok % 15 === 0) {
                echo "  … {$ok} downloaded (z{$z})\n";
            }
            usleep(120 * 1000);
        }
    }
}

echo PHP_EOL . "downloaded={$ok} skipped={$skipped} failed={$fail}" . PHP_EOL;
$stats = $svc->stats();
echo 'tiles=' . $stats['tiles'] . ' size=' . number_format($stats['size_bytes'] / (1024 * 1024), 2) . " MB" . PHP_EOL;
