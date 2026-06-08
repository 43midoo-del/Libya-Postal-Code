<?php
/**
 * Import OSM place nodes/ways into `shabiya_city_places` for one shabiya polygon (from libya-shabiyat.geojson).
 *
 * Usage (from project root or tools/):
 *   php tools/import_shabiya_places_from_osm.php B2
 *   php tools/import_shabiya_places_from_osm.php B2 --dry-run
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use App\Database;

$codeArg = strtoupper(trim($argv[1] ?? 'B2'));
$dryRun = in_array('--dry-run', $argv, true);

/** @var array{shabiyat: list<array{name: string, wilayah: string, code?: string}>} $libyaFile */
$libyaFile = require dirname(__DIR__) . '/config/libya_admin.php';

$shabiyaMeta = null;
foreach ($libyaFile['shabiyat'] as $row) {
    if (strcasecmp(trim((string) ($row['code'] ?? '')), $codeArg) === 0) {
        $shabiyaMeta = $row;
        break;
    }
}
if ($shabiyaMeta === null) {
    fwrite(STDERR, "Unknown shabiya code: {$codeArg}\n");
    exit(1);
}

$arabicName = trim((string) ($shabiyaMeta['name'] ?? ''));
$geoPath = dirname(__DIR__) . '/data/libya-shabiyat.geojson';
$geo = json_decode((string) file_get_contents($geoPath), true);
if (!is_array($geo) || empty($geo['features'])) {
    fwrite(STDERR, "Invalid geojson: {$geoPath}\n");
    exit(1);
}

$ring = null;
foreach ($geo['features'] as $feature) {
    if (strcasecmp(trim((string) ($feature['properties']['code'] ?? '')), $codeArg) !== 0) {
        continue;
    }
    $coords = $feature['geometry']['coordinates'][0] ?? null;
    if (!is_array($coords) || count($coords) < 3) {
        break;
    }
    $ring = $coords;
    break;
}
if ($ring === null) {
    fwrite(STDERR, "Polygon not found for {$codeArg} in geojson\n");
    exit(1);
}

/** @param list<array{0: float, 1: float}> $polygon */
function pointInPolygon(float $lat, float $lng, array $polygon): bool
{
    $inside = false;
    $n = count($polygon);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        $yi = (float) $polygon[$i][1];
        $xi = (float) $polygon[$i][0];
        $yj = (float) $polygon[$j][1];
        $xj = (float) $polygon[$j][0];
        $intersect = (($yi > $lat) !== ($yj > $lat))
            && ($lng < ($xj - $xi) * ($lat - $yi) / (($yj - $yi) ?: 1e-12) + $xi);
        if ($intersect) {
            $inside = !$inside;
        }
    }

    return $inside;
}

function hasArabic(string $s): bool
{
    return (bool) preg_match('/\p{Arabic}/u', $s);
}

function hasLatin(string $s): bool
{
    return (bool) preg_match('/[A-Za-z]/', $s);
}

function distKm(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $r = 6371.0;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat / 2) ** 2
        + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

    return 2 * $r * asin(min(1.0, sqrt($a)));
}

/**
 * @param list<array{name: string, lat: float, lng: float, type: string, sort: int}> $rows
 * @return list<array{name: string, lat: float, lng: float, type: string, sort: int}>
 */
function dedupeNearbyPlaces(array $rows): array
{
    $keep = [];
    foreach ($rows as $row) {
        $merged = false;
        foreach ($keep as $idx => $existing) {
            if (distKm($row['lat'], $row['lng'], $existing['lat'], $existing['lng']) > 1.5) {
                continue;
            }
            $rowAr = hasArabic($row['name']);
            $rowLa = hasLatin($row['name']);
            $exAr = hasArabic($existing['name']);
            $exLa = hasLatin($existing['name']);
            if ($rowAr && !$rowLa && ($exLa || !$exAr)) {
                $keep[$idx] = $row;
                $merged = true;
                break;
            }
            if ($exAr && !$exLa && ($rowLa || !$rowAr)) {
                $merged = true;
                break;
            }
            if ($row['sort'] < $existing['sort']) {
                $keep[$idx] = $row;
                $merged = true;
                break;
            }
            $merged = true;
            break;
        }
        if (!$merged) {
            $keep[] = $row;
        }
    }

    return array_values($keep);
}

$south = 90.0;
$west = 180.0;
$north = -90.0;
$east = -180.0;
foreach ($ring as $pt) {
    $lng = (float) $pt[0];
    $lat = (float) $pt[1];
    $south = min($south, $lat);
    $north = max($north, $lat);
    $west = min($west, $lng);
    $east = max($east, $lng);
}

$polyParts = [];
foreach ($ring as $pt) {
    $polyParts[] = round((float) $pt[1], 6) . ' ' . round((float) $pt[0], 6);
}
$polyStr = implode(' ', $polyParts);

$placeFilter = 'city|town|village|suburb|hamlet|neighbourhood|locality|quarter|isolated_dwelling';
$query = '[out:json][timeout:180];('
    . 'node["place"~"^(' . $placeFilter . ')$"](' . $south . ',' . $west . ',' . $north . ',' . $east . ');'
    . 'way["place"~"^(' . $placeFilter . ')$"](' . $south . ',' . $west . ',' . $north . ',' . $east . ');'
    . 'relation["place"~"^(' . $placeFilter . ')$"](' . $south . ',' . $west . ',' . $north . ',' . $east . ');'
    . ');out center;';

fwrite(STDERR, "Querying Overpass for {$codeArg} ({$arabicName}) bbox…\n");

$overpassUrls = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];
$raw = null;
$http = 0;
$err = '';
foreach ($overpassUrls as $url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => 'data=' . rawurlencode($query),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded; charset=UTF-8'],
        CURLOPT_TIMEOUT        => 200,
        CURLOPT_USERAGENT      => 'LibyaPostalImport/1.0',
    ]);
    $raw = curl_exec($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if (is_string($raw) && $http === 200) {
        break;
    }
    fwrite(STDERR, "Overpass {$url} failed HTTP {$http}: {$err}\n");
}

if (!is_string($raw) || $http !== 200) {
    fwrite(STDERR, "Overpass failed HTTP {$http}: {$err}\n");
    exit(1);
}

$data = json_decode($raw, true);
if (!is_array($data) || !isset($data['elements']) || !is_array($data['elements'])) {
    fwrite(STDERR, "Invalid Overpass JSON response\n");
    exit(1);
}

/** @var array<string, array{name: string, lat: float, lng: float, type: string, sort: int}> $byName */
$byName = [];

$kindRank = [
    'city'              => 10,
    'town'              => 20,
    'suburb'            => 30,
    'village'           => 40,
    'hamlet'            => 50,
    'neighbourhood'     => 60,
    'quarter'           => 65,
    'locality'          => 70,
    'isolated_dwelling' => 80,
];

foreach ($data['elements'] as $el) {
    $tags = $el['tags'] ?? [];
    if (!is_array($tags)) {
        continue;
    }
    $name = trim((string) ($tags['name:ar'] ?? $tags['name'] ?? ''));
    if ($name === '' || preg_match('/^\d+$/', $name)) {
        continue;
    }
    $kind = trim((string) ($tags['place'] ?? 'town'));
    $lat = null;
    $lng = null;
    if (($el['type'] ?? '') === 'node' && isset($el['lat'], $el['lon'])) {
        $lat = (float) $el['lat'];
        $lng = (float) $el['lon'];
    } elseif (isset($el['center']['lat'], $el['center']['lon'])) {
        $lat = (float) $el['center']['lat'];
        $lng = (float) $el['center']['lon'];
    }
    if ($lat === null || $lng === null) {
        continue;
    }
    if (!pointInPolygon($lat, $lng, $ring)) {
        continue;
    }

    $rank = $kindRank[$kind] ?? 90;
    $prev = $byName[$name] ?? null;
    if ($prev !== null && $prev['sort'] <= $rank) {
        continue;
    }
    $byName[$name] = [
        'name' => $name,
        'lat'  => $lat,
        'lng'  => $lng,
        'type' => $kind,
        'sort' => $rank,
    ];
}

if ($byName === []) {
    fwrite(STDERR, "No places returned from OSM for {$codeArg}\n");
    exit(1);
}

uasort($byName, static function (array $a, array $b): int {
    $cmp = $a['sort'] <=> $b['sort'];
    if ($cmp !== 0) {
        return $cmp;
    }

    return strcmp($a['name'], $b['name']);
});

/** @var list<array{0:string,1:float,2:float,3:string}> $supplemental */
$supplemental = [
    'B2' => [
        ['قرنوبة', 32.718, 22.698, 'town'],
        ['البردي', 32.069, 22.069, 'village'],
    ],
];
foreach ($supplemental[$codeArg] ?? [] as $extra) {
    [$nm, $la, $lo, $pk] = $extra;
    if (isset($byName[$nm])) {
        continue;
    }
    if (!pointInPolygon((float) $la, (float) $lo, $ring)) {
        continue;
    }
    $byName[$nm] = [
        'name' => $nm,
        'lat'  => (float) $la,
        'lng'  => (float) $lo,
        'type' => (string) $pk,
        'sort' => $kindRank[(string) $pk] ?? 90,
    ];
}

$rows = dedupeNearbyPlaces(array_values($byName));
fwrite(STDERR, 'Found ' . count($rows) . " places inside {$codeArg} polygon (after dedupe).\n");

if ($dryRun) {
    foreach ($rows as $i => $r) {
        echo ($i + 1) . "\t" . $r['name'] . "\t" . $r['type'] . "\t" . round($r['lat'], 6) . "\t" . round($r['lng'], 6) . "\n";
    }
    exit(0);
}

$pdo = Database::getInstance()->getPdo();
$pdo->beginTransaction();
try {
    $del = $pdo->prepare('DELETE FROM shabiya_city_places WHERE UPPER(TRIM(shabiya_code)) = :c');
    $del->execute([':c' => $codeArg]);

    $ins = $pdo->prepare(
        'INSERT INTO shabiya_city_places (shabiya_name, shabiya_code, place_name, lat, lng, place_kind, sort_order)
         VALUES (:sn, :sc, :pn, :lat, :lng, :pk, :so)'
    );

    $sortOrder = 0;
    foreach ($rows as $r) {
        $sortOrder += 10;
        $ins->execute([
            ':sn'  => $arabicName,
            ':sc'  => $codeArg,
            ':pn'  => $r['name'],
            ':lat' => round($r['lat'], 7),
            ':lng' => round($r['lng'], 7),
            ':pk'  => $r['type'],
            ':so'  => $sortOrder,
        ]);
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, 'DB error: ' . $e->getMessage() . "\n");
    exit(1);
}

echo "Imported " . count($rows) . " places for {$arabicName} ({$codeArg}).\n";
