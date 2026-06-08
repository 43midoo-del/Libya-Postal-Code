<?php
/**
 * One-shot seed for the MBTiles base layer.
 * Downloads zoom 5..7 over Libya bbox (≈ 60-90 tiles) so the offline base map
 * has something to show before the admin runs a full sync.
 *
 *   php scripts/seed_mbtiles_from_osm.php [zmin] [zmax]
 */
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

if (!MBTilesService::isAvailable()) {
    fwrite(STDERR, "pdo_sqlite غير مفعّل.\n");
    exit(1);
}

$zmin = isset($argv[1]) ? max(0, min(18, (int) $argv[1])) : 5;
$zmax = isset($argv[2]) ? max($zmin, min(18, (int) $argv[2])) : 7;

$bbox = ['south' => 19.4, 'west' => 9.2, 'north' => 33.45, 'east' => 25.15];
$svc = new MBTilesService();
echo "MBTiles: " . $svc->path() . PHP_EOL;
echo "Range:   z={$zmin}..{$zmax}, bbox = " . json_encode($bbox) . PHP_EOL;

$total = 0;
$ok = 0;
$fail = 0;
$skipped = 0;

for ($z = $zmin; $z <= $zmax; $z++) {
    $n = (1 << $z);
    $xMin = (int) floor(($bbox['west'] + 180) / 360 * $n);
    $xMax = (int) floor(($bbox['east'] + 180) / 360 * $n);
    $latNRad = deg2rad($bbox['north']);
    $latSRad = deg2rad($bbox['south']);
    $yMin = (int) floor((1 - log(tan($latNRad) + 1 / cos($latNRad)) / M_PI) / 2 * $n);
    $yMax = (int) floor((1 - log(tan($latSRad) + 1 / cos($latSRad)) / M_PI) / 2 * $n);

    for ($x = max(0, $xMin); $x <= min($n - 1, $xMax); $x++) {
        for ($y = max(0, $yMin); $y <= min($n - 1, $yMax); $y++) {
            $total++;
            if ($svc->getTileXYZ($z, $x, $y) !== null) {
                $skipped++;
                continue;
            }
            $url = 'https://tile.openstreetmap.org/' . $z . '/' . $x . '/' . $y . '.png';
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 20,
                CURLOPT_USERAGENT => 'LibyaPostal/1.0 (offline-seed)',
                CURLOPT_FOLLOWLOCATION => true,
            ]);
            $body = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($code === 200 && is_string($body) && strlen($body) > 64) {
                $svc->putTileXYZ($z, $x, $y, $body);
                $ok++;
                echo "  + z{$z}/{$x}/{$y}  " . strlen($body) . "B\n";
            } else {
                $fail++;
                echo "  ! z{$z}/{$x}/{$y}  HTTP {$code}\n";
            }
            /* polite throttle */
            usleep(150 * 1000);
        }
    }
}

echo PHP_EOL;
echo "Total: {$total}, downloaded: {$ok}, skipped: {$skipped}, failed: {$fail}" . PHP_EOL;
$stats = $svc->stats();
echo "MBTiles tiles now: {$stats['tiles']}  size: " . number_format($stats['size_bytes'] / 1024, 1) . " KB" . PHP_EOL;
