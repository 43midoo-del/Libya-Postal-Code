<?php
/**
 * Import Derna city neighbourhoods + streets from OSM/Nominatim and build Voronoi grid boundaries.
 *
 * Usage:
 *   php tools/import_derna_city_blocks_from_osm.php
 *   php tools/import_derna_city_blocks_from_osm.php --dry-run
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use App\Database;
use App\GeoPoint;
use App\Models\Area;
use App\Models\Boundary;
use App\Models\Street;

$dryRun = in_array('--dry-run', $argv, true);
$cityId = 123;
$regionId = 2;

/** Derna urban core (REACH SBA / AAU Atlas centroids). */
const DERNA_SOUTH = 32.748;
const DERNA_NORTH = 32.772;
const DERNA_WEST  = 22.605;
const DERNA_EAST  = 22.665;
const AREA_CELL_HALF  = 0.006;
const STREET_CELL_HALF = 0.0025;

/**
 * Centroids from AAU Atlas + REACH Derna neighbourhood map (March 2023).
 * Coordinates verified inside urban envelope — no Nominatim override.
 */
const NEIGHBORHOOD_SEEDS = [
    ['name' => 'الجبيلة',         'code' => 'JB', 'lat' => 32.7668, 'lng' => 22.6342],
    ['name' => 'شيحا الغربية',    'code' => 'SW', 'lat' => 32.7620, 'lng' => 22.6100],
    ['name' => 'شيحا الشرقية',    'code' => 'SE', 'lat' => 32.7618, 'lng' => 22.6520],
    ['name' => 'البلاد',          'code' => 'BL', 'lat' => 32.7640, 'lng' => 22.6490],
    ['name' => 'المغار',          'code' => 'MG', 'lat' => 32.7650, 'lng' => 22.6360],
    ['name' => 'أبو منصور',       'code' => 'AM', 'lat' => 32.7685, 'lng' => 22.6425],
    ['name' => 'الفتايح',         'code' => 'FT', 'lat' => 32.7530, 'lng' => 22.6580],
    ['name' => 'الظهور',          'code' => 'ZH', 'lat' => 32.7568, 'lng' => 22.6315],
    ['name' => 'البطن',           'code' => 'BT', 'lat' => 32.7608, 'lng' => 22.6275],
    ['name' => 'العطبة',          'code' => 'AT', 'lat' => 32.7638, 'lng' => 22.6385],
    ['name' => 'العليوة',         'code' => 'EL', 'lat' => 32.7540, 'lng' => 22.6465],
    ['name' => 'بن ناصر',         'code' => 'BN', 'lat' => 32.7672, 'lng' => 22.6405],
    ['name' => 'الشعبية',         'code' => 'SH', 'lat' => 32.7598, 'lng' => 22.6355],
    ['name' => 'الوادي',          'code' => 'WD', 'lat' => 32.7572, 'lng' => 22.6418],
    ['name' => 'المدينة القديمة', 'code' => 'OC', 'lat' => 32.7615, 'lng' => 22.6378],
    ['name' => 'وسط الساحل',      'code' => 'WS', 'lat' => 32.7585, 'lng' => 22.6445],
    ['name' => 'حي الخديجة',      'code' => 'HK', 'lat' => 32.7675, 'lng' => 22.6305],
];

/** OSM-verified street centroids inside Derna (Overpass May 2026). */
const KNOWN_STREETS = [
    ['name' => 'شارع الجبيلة',           'code' => 'SJ', 'lat' => 32.7669, 'lng' => 22.6340],
    ['name' => 'شارع المغار',            'code' => 'SM', 'lat' => 32.7648, 'lng' => 22.6358],
    ['name' => 'شارع رافع الانصاري',     'code' => 'RF', 'lat' => 32.7656, 'lng' => 22.6368],
    ['name' => 'شارع الفنار',            'code' => 'FN', 'lat' => 32.7682, 'lng' => 22.6418],
    ['name' => 'شارع الملاهب',           'code' => 'ML', 'lat' => 32.7670, 'lng' => 22.6398],
];

function out(string $line): void
{
    echo $line . PHP_EOL;
}

function pointInRing(array $ring, float $lat, float $lng): bool
{
    $inside = false;
    $n = count($ring);
    if ($n < 3) {
        return false;
    }
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        $xi = (float) ($ring[$i][0] ?? 0);
        $yi = (float) ($ring[$i][1] ?? 0);
        $xj = (float) ($ring[$j][0] ?? 0);
        $yj = (float) ($ring[$j][1] ?? 0);
        $intersect = (($yi > $lat) !== ($yj > $lat))
            && ($lng < (($xj - $xi) * ($lat - $yi) / (($yj - $yi) ?: 1e-12)) + $xi);
        if ($intersect) {
            $inside = !$inside;
        }
    }
    return $inside;
}

function pointInCity(float $lat, float $lng, array $cityRing): bool
{
    return pointInRing($cityRing, $lat, $lng);
}

function distSq(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $dLat = $lat2 - $lat1;
    $dLng = $lng2 - $lng1;
    return $dLat * $dLat + $dLng * $dLng;
}

function geometryToPolygonSets(array $geom): array
{
    $type = (string) ($geom['type'] ?? '');
    $coords = $geom['coordinates'] ?? null;
    if (!is_array($coords)) {
        return [];
    }
    if ($type === 'Polygon') {
        return [$coords];
    }
    if ($type === 'MultiPolygon') {
        $out = [];
        foreach ($coords as $poly) {
            if (is_array($poly)) {
                $out[] = $poly;
            }
        }
        return $out;
    }
    return [];
}

function httpGetJson(string $url, int $sleepMs = 1100): ?array
{
    usleep($sleepMs * 1000);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_USERAGENT      => 'LibyaPostalDernaImport/1.0 (contact@local)',
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if (!is_string($raw) || $code !== 200) {
        return null;
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : null;
}

function fetchDernaCityPolygon(): ?array
{
    $q = http_build_query([
        'city'              => 'Derna',
        'country'           => 'Libya',
        'format'            => 'json',
        'polygon_geojson'   => 1,
        'limit'             => 1,
    ]);
    $rows = httpGetJson('https://nominatim.openstreetmap.org/search?' . $q, 0);
    if (!$rows || !isset($rows[0]['geojson'])) {
        return null;
    }
    $gj = $rows[0]['geojson'];
    if (!is_array($gj) || ($gj['type'] ?? '') !== 'Polygon') {
        return null;
    }
    return $gj;
}

function nominatimLocate(array $queries, array $cityRing): ?array
{
    foreach ($queries as $q) {
        $url = 'https://nominatim.openstreetmap.org/search?' . http_build_query([
            'q'               => $q,
            'format'          => 'json',
            'limit'           => 5,
            'viewbox'         => DERNA_WEST . ',' . DERNA_NORTH . ',' . DERNA_EAST . ',' . DERNA_SOUTH,
            'bounded'         => 1,
            'accept-language' => 'ar',
        ]);
        $rows = httpGetJson($url);
        if (!$rows) {
            continue;
        }
        foreach ($rows as $row) {
            $lat = isset($row['lat']) ? (float) $row['lat'] : null;
            $lng = isset($row['lon']) ? (float) $row['lon'] : null;
            if ($lat === null || $lng === null) {
                continue;
            }
            if (!pointInCity($lat, $lng, $cityRing)) {
                continue;
            }
            return ['lat' => $lat, 'lng' => $lng, 'label' => (string) ($row['display_name'] ?? $q)];
        }
    }
    return null;
}

function overpassQuery(string $query): ?array
{
    $urls = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
    ];
    foreach ($urls as $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => 'data=' . rawurlencode($query),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 180,
            CURLOPT_USERAGENT      => 'LibyaPostalDernaImport/1.0',
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded; charset=UTF-8'],
        ]);
        $raw = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (is_string($raw) && $http === 200) {
            $j = json_decode($raw, true);
            if (is_array($j) && isset($j['elements'])) {
                return $j;
            }
        }
        fwrite(STDERR, "Overpass {$url} HTTP {$http}\n");
    }
    return null;
}

function fetchOsmNeighborhoods(): array
{
    $q = '[out:json][timeout:120];('
        . 'node["place"~"^(suburb|neighbourhood|quarter|neighborhood)$"]('
        . DERNA_SOUTH . ',' . DERNA_WEST . ',' . DERNA_NORTH . ',' . DERNA_EAST . ');'
        . 'way["place"~"^(suburb|neighbourhood|quarter|neighborhood)$"]('
        . DERNA_SOUTH . ',' . DERNA_WEST . ',' . DERNA_NORTH . ',' . DERNA_EAST . ');'
        . ');out center tags;';
    $data = overpassQuery($q);
    if ($data === null) {
        return [];
    }
    $out = [];
    foreach ($data['elements'] as $el) {
        $tags = is_array($el['tags'] ?? null) ? $el['tags'] : [];
        $name = trim((string) ($tags['name:ar'] ?? $tags['name'] ?? ''));
        if ($name === '') {
            continue;
        }
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
        $out[$name] = ['name' => $name, 'lat' => $lat, 'lng' => $lng, 'source' => 'osm-place'];
    }
    return array_values($out);
}

function isUrbanStreetName(string $name, array $tags): bool
{
    $hw = strtolower((string) ($tags['highway'] ?? ''));
    if (in_array($hw, ['motorway', 'trunk', 'motorway_link', 'trunk_link'], true)) {
        return false;
    }
    $n = mb_strtolower(trim($name));
    if ($n === '' || mb_strlen($n) < 4) {
        return false;
    }
    if (preg_match('/شركة|company|matrix|ماتركس/u', $n)) {
        return false;
    }
    if (preg_match('/طبرق|tobruk|القبة|qubbah|طريق\s*درنة/u', $n) && !preg_match('/^شارع/u', $n)) {
        return false;
    }
    return (bool) preg_match('/^شارع|^\d|street|st\.|road|طريق/u', $n)
        || str_contains($n, 'شارع')
        || str_contains($n, 'street');
}

function fetchOsmStreets(): array
{
    $q = '[out:json][timeout:120];way["highway"~"^(residential|living_street|tertiary|secondary|primary|unclassified|service)$"]["name"]('
        . DERNA_SOUTH . ',' . DERNA_WEST . ',' . DERNA_NORTH . ',' . DERNA_EAST
        . ');out center tags;';
    $data = overpassQuery($q);
    if ($data === null) {
        return [];
    }
    $out = [];
    foreach ($data['elements'] as $el) {
        $tags = is_array($el['tags'] ?? null) ? $el['tags'] : [];
        $name = trim((string) ($tags['name:ar'] ?? $tags['name'] ?? ''));
        if ($name === '' || !isset($el['center']['lat'], $el['center']['lon'])) {
            continue;
        }
        if (!isUrbanStreetName($name, $tags)) {
            continue;
        }
        $lat = (float) $el['center']['lat'];
        $lng = (float) $el['center']['lon'];
        $key = mb_strtolower($name);
        if (!isset($out[$key])) {
            $out[$key] = ['name' => $name, 'lat' => $lat, 'lng' => $lng, 'source' => 'osm-highway'];
        }
    }
    return array_values($out);
}

function nearestAreaId(float $lat, float $lng, array $areaRows): int
{
    $best = 0;
    $bestD = INF;
    foreach ($areaRows as $row) {
        $alat = $row['lat'] ?? null;
        $alng = $row['lng'] ?? null;
        if ($alat === null || $alng === null) {
            continue;
        }
        $d = distSq($lat, $lng, (float) $alat, (float) $alng);
        if ($d < $bestD) {
            $bestD = $d;
            $best = (int) $row['id'];
        }
    }
    return $best;
}

function streetCodeFromName(string $name): string
{
    $ascii = preg_replace('/[^A-Za-z0-9]/', '', $name) ?? '';
    if ($ascii !== '') {
        return strtoupper(substr($ascii, 0, 4));
    }
    return strtoupper(substr(md5($name), 0, 4));
}

function buildUrbanEnvelope(array $neighborhoods, float $pad = 0.005): array
{
    $lats = [];
    $lngs = [];
    foreach ($neighborhoods as $n) {
        $lats[] = (float) $n['lat'];
        $lngs[] = (float) $n['lng'];
    }
    $south = max(DERNA_SOUTH, min($lats) - $pad);
    $north = min(DERNA_NORTH, max($lats) + $pad);
    $west = max(DERNA_WEST, min($lngs) - $pad);
    $east = min(DERNA_EAST, max($lngs) + $pad);

    return [
        'type'        => 'Polygon',
        'coordinates' => [[
            [$west, $south],
            [$east, $south],
            [$east, $north],
            [$west, $north],
            [$west, $south],
        ]],
    ];
}

function buildFixedSquareGeometry(float $lat, float $lng, float $halfDeg): array
{
    return [
        'type'        => 'Polygon',
        'coordinates' => [[
            [$lng - $halfDeg, $lat - $halfDeg],
            [$lng + $halfDeg, $lat - $halfDeg],
            [$lng + $halfDeg, $lat + $halfDeg],
            [$lng - $halfDeg, $lat + $halfDeg],
            [$lng - $halfDeg, $lat - $halfDeg],
        ]],
    ];
}

function pointInsideUrban(float $lat, float $lng): bool
{
    return $lat >= DERNA_SOUTH && $lat <= DERNA_NORTH && $lng >= DERNA_WEST && $lng <= DERNA_EAST;
}

function saveFixedAreaGrids(array $areaRows): int
{
    $saved = 0;
    foreach ($areaRows as $row) {
        if ($row['lat'] === null || $row['lng'] === null) {
            continue;
        }
        $lat = (float) $row['lat'];
        $lng = (float) $row['lng'];
        if (!pointInsideUrban($lat, $lng)) {
            continue;
        }
        $geom = buildFixedSquareGeometry($lat, $lng, AREA_CELL_HALF);
        Boundary::save(
            'area',
            (int) $row['id'],
            json_encode($geom, JSON_UNESCAPED_UNICODE),
            $row['code'] ?? null,
            null,
            null
        );
        $saved++;
    }
    return $saved;
}

function saveFixedStreetGrids(PDO $pdo, array $streetCoords): int
{
    $saved = 0;
    $codeSt = $pdo->prepare('SELECT code FROM streets WHERE id = :id LIMIT 1');
    foreach ($streetCoords as $streetId => $cent) {
        $lat = (float) $cent['lat'];
        $lng = (float) $cent['lng'];
        if (!pointInsideUrban($lat, $lng)) {
            continue;
        }
        $codeSt->execute(['id' => (int) $streetId]);
        $code = $codeSt->fetchColumn();
        $code = $code !== false ? (string) $code : null;
        $geom = buildFixedSquareGeometry($lat, $lng, STREET_CELL_HALF);
        Boundary::save('street', (int) $streetId, json_encode($geom, JSON_UNESCAPED_UNICODE), $code, null, null);
        $saved++;
    }
    return $saved;
}

/* ---- main ---- */

/** @var array<string, array{name:string,code:string,lat:float,lng:float,source:string}> $neighborhoods */
$neighborhoods = [];
foreach (NEIGHBORHOOD_SEEDS as $seed) {
    $lat = (float) $seed['lat'];
    $lng = (float) $seed['lng'];
    $neighborhoods[$seed['name']] = [
        'name'   => $seed['name'],
        'code'   => $seed['code'],
        'lat'    => $lat,
        'lng'    => $lng,
        'source' => 'aau-reach',
    ];
    out('  [ok] ' . $seed['name'] . ' → ' . round($lat, 5) . ',' . round($lng, 5));
}

$cityGeom = buildUrbanEnvelope(array_values($neighborhoods));
out('Urban envelope: lat ' . DERNA_SOUTH . '–' . DERNA_NORTH . ', lng ' . DERNA_WEST . '–' . DERNA_EAST);

$osmStreets = fetchOsmStreets();
out('OSM streets (extra): ' . count($osmStreets));

if ($neighborhoods === []) {
    fwrite(STDERR, "No neighbourhoods resolved.\n");
    exit(1);
}

if ($dryRun) {
    out("\n--- Dry run summary ---");
    out('Neighbourhoods: ' . count($neighborhoods));
    foreach ($neighborhoods as $n) {
        out('  ' . $n['name'] . ' (' . $n['code'] . ') ' . $n['lat'] . ',' . $n['lng'] . ' [' . $n['source'] . ']');
    }
    out('Streets from OSM: ' . count($osmStreets));
    foreach (array_slice($osmStreets, 0, 25) as $s) {
        out('  ' . $s['name']);
    }
    if (count($osmStreets) > 25) {
        out('  … +' . (count($osmStreets) - 25) . ' more');
    }
    exit(0);
}

$pdo = Database::getInstance()->getPdo();
$pdo->beginTransaction();
try {
    Boundary::save('city', $cityId, json_encode($cityGeom, JSON_UNESCAPED_UNICODE), null, null, null);
    out('Saved urban city envelope.');

    $areaByName = [];
    /** @var array<int, array{lat:float,lng:float}> $streetCoords */
    $streetCoords = [];
    $stExist = $pdo->prepare('SELECT id, name, code, lat, lng FROM areas WHERE city_id = :cid');
    $stExist->execute(['cid' => $cityId]);
    foreach ($stExist->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $areaByName[(string) $row['name']] = $row;
    }

    foreach ($neighborhoods as $n) {
        if (isset($areaByName[$n['name']])) {
            $aid = (int) $areaByName[$n['name']]['id'];
            $pdo->prepare('UPDATE areas SET code = :c, kind = :k, lat = :lat, lng = :lng WHERE id = :id')
                ->execute([
                    'c'   => $n['code'],
                    'k'   => 'neighborhood',
                    'lat' => $n['lat'],
                    'lng' => $n['lng'],
                    'id'  => $aid,
                ]);
        } else {
            $aid = Area::createWithCoords($n['name'], $cityId, $n['lat'], $n['lng'], $n['code'], 'neighborhood');
        }
        $areaByName[$n['name']] = [
            'id'   => $aid,
            'name' => $n['name'],
            'code' => $n['code'],
            'lat'  => $n['lat'],
            'lng'  => $n['lng'],
        ];
    }

    $areaRows = array_values($areaByName);
    $areaSaved = saveFixedAreaGrids($areaRows);
    out('Area grid cells saved: ' . $areaSaved);

    $pdo->prepare('DELETE FROM streets WHERE area_id IN (SELECT id FROM areas WHERE city_id = :cid)')
        ->execute(['cid' => $cityId]);
    $pdo->prepare('DELETE FROM boundaries WHERE level = "street" AND entity_id NOT IN (SELECT id FROM streets)')
        ->execute();

    $streetCount = 0;
    $allStreets = KNOWN_STREETS;
    foreach ($osmStreets as $s) {
        $dup = false;
        foreach ($allStreets as $ks) {
            if (mb_strtolower($ks['name']) === mb_strtolower($s['name'])) {
                $dup = true;
                break;
            }
        }
        if (!$dup) {
            $allStreets[] = [
                'name' => $s['name'],
                'code' => streetCodeFromName($s['name']),
                'lat'  => $s['lat'],
                'lng'  => $s['lng'],
            ];
        }
    }

    foreach ($allStreets as $s) {
        $aid = nearestAreaId((float) $s['lat'], (float) $s['lng'], $areaRows);
        if ($aid < 1) {
            continue;
        }
        $sid = Street::create($s['name'], $aid, $s['code'], null);
        $streetCoords[$sid] = ['lat' => (float) $s['lat'], 'lng' => (float) $s['lng']];
        $streetCount++;
    }

    $stExist->execute(['cid' => $cityId]);
    $areaRows = $stExist->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $streetGrids = saveFixedStreetGrids($pdo, $streetCoords);
    out('Street grid cells saved: ' . $streetGrids);

    $pdo->commit();
    out('Done. City #' . $cityId . ' — areas: ' . count($areaRows) . ', new streets: ' . $streetCount);
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n");
    exit(1);
}
