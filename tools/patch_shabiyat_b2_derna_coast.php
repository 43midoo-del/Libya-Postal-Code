<?php
/**
 * Patch B2 (Derna) polygon: one long coastal chord cuts through the city;
 * insert bulge points so the northern coast sits inside the ring.
 */
declare(strict_types=1);

$path = dirname(__DIR__) . '/data/libya-shabiyat.geojson';
$bak = dirname(__DIR__) . '/data/libya-shabiyat.geojson.bak-patch';
$data = json_decode((string) file_get_contents($path), true);
if (!is_array($data) || empty($data['features'])) {
    fwrite(STDERR, "Invalid geojson\n");
    exit(1);
}

$i0 = null;
$i1 = null;
foreach ($data['features'] as $fi => $f) {
    if (($f['properties']['code'] ?? '') !== 'B2') {
        continue;
    }
    $coords = $f['geometry']['coordinates'][0];
    /* Find segment 22.81,32.72 -> 22.58,32.784 (rounded match) */
    $n = count($coords);
    for ($i = 0; $i < $n - 1; $i++) {
        $lng1 = (float) $coords[$i][0];
        $lat1 = (float) $coords[$i][1];
        $lng2 = (float) $coords[$i + 1][0];
        $lat2 = (float) $coords[$i + 1][1];
        if (abs($lng1 - 22.812510613274) < 1e-6 && abs($lat1 - 32.724514065172) < 1e-6
            && abs($lng2 - 22.578868035332) < 1e-6 && abs($lat2 - 32.784613348227) < 1e-6
        ) {
            $i0 = $fi;
            $i1 = $i;
            break 2;
        }
    }
}
if ($i0 === null || $i1 === null) {
    fwrite(STDERR, "B2 chord not found — already patched?\n");
    exit(1);
}

$f = $data['features'][$i0];
$coords = $f['geometry']['coordinates'][0];
$n = count($coords);
$insertAt = $i1 + 1;
$lng0 = (float) $coords[$i1][0];
$lat0 = (float) $coords[$i1][1];
$lng1 = (float) $coords[$insertAt][0]; /* same segment end */
$lat1 = (float) $coords[$insertAt][1];

$extras = [];
$steps = 7;
for ($s = 1; $s < $steps; $s++) {
    $t = $s / $steps;
    $lng = $lng0 + $t * ($lng1 - $lng0);
    $lat = $lat0 + $t * ($lat1 - $lat0);
    /* ~0.1° latitude bulge (~11 km) for Derna coast */
    $lat += 0.10 * sin($t * M_PI);
    $extras[] = [$lng, $lat];
}

$before = $coords[$insertAt];
array_splice($coords, $insertAt, 0, $extras);

/* Close ring consistency: first == last */
if ($coords[0] !== $coords[count($coords) - 1]) {
    $coords[] = $coords[0];
}

$data['features'][$i0]['geometry']['coordinates'][0] = $coords;

if (!is_file($bak)) {
    copy($path, $bak);
}

file_put_contents(
    $path,
    json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n"
);

echo 'Inserted ' . count($extras) . ' points into B2 at index ' . $insertAt . "\n";
