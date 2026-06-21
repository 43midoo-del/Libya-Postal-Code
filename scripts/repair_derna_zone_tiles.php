<?php
/**
 * Download only missing tiles inside the Derna shabiya offline zone (z9–12).
 *
 *   php scripts/repair_derna_zone_tiles.php
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

$zone = [
    'name' => 'derna-shabiya-b2',
    'south' => 30.79,
    'west' => 21.92,
    'north' => 33.08,
    'east' => 23.35,
    'zmin' => 9,
    'zmax' => 12,
];

$svc = new MBTilesService();
echo 'MBTiles: ' . $svc->path() . PHP_EOL;
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
            if ($existing !== null && isValidMapTile($existing, $z)) {
                $skipped++;
                continue;
            }
            $fetched = fetchTile($z, $x, $y);
            if ($fetched === null) {
                $fail++;
                echo "  ! z{$z}/{$x}/{$y}\n";
                continue;
            }
            $svc->putTileXYZ($z, $x, $y, $fetched[0]);
            $ok++;
            if ($ok % 20 === 0) {
                echo "  … {$ok} downloaded\n";
            }
            usleep(180 * 1000);
        }
    }
}

echo PHP_EOL . "downloaded={$ok} skipped={$skipped} failed={$fail}" . PHP_EOL;
$stats = $svc->stats();
echo 'tiles=' . $stats['tiles'] . ' size=' . number_format($stats['size_bytes'] / (1024 * 1024), 2) . " MB" . PHP_EOL;
