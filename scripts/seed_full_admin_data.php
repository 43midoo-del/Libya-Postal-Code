<?php
/**
 * Phase 7 — Full admin-tree seed:
 *   1) syncs `states` (3 wilayah)
 *   2) syncs `regions` (22 shabiyat) with code / lat / lng, and writes their polygon into `boundaries`
 *   3) inserts/updates ~80 cities from data/libya-cities-source.json (point-in-polygon → region_id)
 *   4) ensures every city has a default `areas` row (kind='default') so existing addresses keep working
 *
 * Run from project root:
 *   php scripts/seed_full_admin_data.php
 */
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\Database;

$projectRoot = dirname(__DIR__);

function out(string $line): void
{
    echo $line . PHP_EOL;
}

function arabicSlug(string $name): string
{
    $name = trim($name);
    $ascii = preg_replace('/[^A-Za-z0-9]/', '', $name) ?? '';
    if ($ascii !== '') {
        return strtoupper(substr($ascii, 0, 6));
    }
    /* fall back to a deterministic short hash so cities with only-Arabic names stay unique. */
    return strtoupper(substr(md5($name), 0, 4));
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

function pointInPolygon(array $polygon, float $lat, float $lng): bool
{
    if (!isset($polygon[0]) || !is_array($polygon[0])) {
        return false;
    }
    if (!pointInRing($polygon[0], $lat, $lng)) {
        return false;
    }
    for ($i = 1, $n = count($polygon); $i < $n; $i++) {
        if (is_array($polygon[$i]) && pointInRing($polygon[$i], $lat, $lng)) {
            return false;
        }
    }
    return true;
}

function pointInFeature(array $feature, float $lat, float $lng): bool
{
    $geom = $feature['geometry'] ?? null;
    if (!is_array($geom)) {
        return false;
    }
    $type = (string) ($geom['type'] ?? '');
    $coords = $geom['coordinates'] ?? null;
    if (!is_array($coords)) {
        return false;
    }
    if ($type === 'Polygon') {
        return pointInPolygon($coords, $lat, $lng);
    }
    if ($type === 'MultiPolygon') {
        foreach ($coords as $poly) {
            if (is_array($poly) && pointInPolygon($poly, $lat, $lng)) {
                return true;
            }
        }
    }
    return false;
}

/* ============================================================
 *  1. Load source data
 * ============================================================ */
$adminCfg = require $projectRoot . '/config/libya_admin.php';
$regionsCentroidCfg = require $projectRoot . '/config/postal_map_regions.php';

$geojsonPath = $projectRoot . '/data/libya-shabiyat.geojson';
if (!is_file($geojsonPath)) {
    fwrite(STDERR, "ERROR: missing $geojsonPath\n");
    exit(1);
}
$shabiyatGeo = json_decode((string) file_get_contents($geojsonPath), true);
if (!is_array($shabiyatGeo) || ($shabiyatGeo['type'] ?? '') !== 'FeatureCollection') {
    fwrite(STDERR, "ERROR: invalid GeoJSON FeatureCollection in libya-shabiyat.geojson\n");
    exit(1);
}

$citiesPath = $projectRoot . '/data/libya-cities-source.json';
if (!is_file($citiesPath)) {
    fwrite(STDERR, "ERROR: missing $citiesPath\n");
    exit(1);
}
$citiesSrc = json_decode((string) file_get_contents($citiesPath), true);
if (!is_array($citiesSrc) || !isset($citiesSrc['cities']) || !is_array($citiesSrc['cities'])) {
    fwrite(STDERR, "ERROR: libya-cities-source.json malformed\n");
    exit(1);
}

/* index region centroid records by code */
$centroidByCode = [];
foreach ($regionsCentroidCfg as $r) {
    $code = (string) ($r['code'] ?? '');
    if ($code !== '') {
        $centroidByCode[$code] = $r;
    }
}

/* index geojson features by code */
$featureByCode = [];
foreach (($shabiyatGeo['features'] ?? []) as $feature) {
    $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
    $code = (string) ($props['code'] ?? '');
    if ($code !== '') {
        $featureByCode[$code] = $feature;
    }
}

$pdo = Database::getInstance()->getPdo();

/* ============================================================
 *  2. Sync states (idempotent)
 * ============================================================ */
out('=== States ===');
$stateRows = [
    1 => ['name' => 'طرابلس', 'code' => 'T'],
    2 => ['name' => 'برقة',   'code' => 'B'],
    3 => ['name' => 'فزان',   'code' => 'F'],
];
$stUp = $pdo->prepare('INSERT INTO `states` (`id`, `name`, `code`) VALUES (:id, :n, :c)
    ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `code` = VALUES(`code`)');
foreach ($stateRows as $id => $row) {
    $stUp->execute(['id' => $id, 'n' => $row['name'], 'c' => $row['code']]);
    out("  ✓ state #{$id} {$row['name']} ({$row['code']})");
}

/* ============================================================
 *  3. Sync regions (shabiyat) — populate code/lat/lng + boundaries
 * ============================================================ */
out('=== Regions (Shabiyat) ===');

$wilayahToState = ['barqa' => 2, 'tripolitania' => 1, 'fezzan' => 3];
$regionStmt = $pdo->prepare(
    'INSERT INTO `regions` (`id`, `name`, `state_id`, `code`, `lat`, `lng`)
     VALUES (:id, :n, :sid, :code, :lat, :lng)
     ON DUPLICATE KEY UPDATE
       `name` = VALUES(`name`),
       `state_id` = VALUES(`state_id`),
       `code` = VALUES(`code`),
       `lat` = VALUES(`lat`),
       `lng` = VALUES(`lng`)'
);
$boundaryStmt = $pdo->prepare(
    'INSERT INTO `boundaries` (`level`, `entity_id`, `geojson`, `code`, `color`)
     VALUES ("region", :eid, :gj, :code, :color)
     ON DUPLICATE KEY UPDATE
       `geojson` = VALUES(`geojson`),
       `code` = VALUES(`code`),
       `color` = VALUES(`color`)'
);

$regionIdByCode = [];
$shabiyatList = $adminCfg['shabiyat'] ?? [];
$i = 1;
foreach ($shabiyatList as $sh) {
    $name = (string) ($sh['name'] ?? '');
    $code = (string) ($sh['code'] ?? '');
    $wilayah = (string) ($sh['wilayah'] ?? '');
    if ($name === '' || $code === '') { continue; }
    $sid = $wilayahToState[$wilayah] ?? 1;

    /* lat/lng from postal_map_regions.php */
    $lat = $centroidByCode[$code]['lat'] ?? null;
    $lng = $centroidByCode[$code]['lng'] ?? null;

    $regionStmt->execute([
        'id'  => $i,
        'n'   => $name,
        'sid' => $sid,
        'code'=> $code,
        'lat' => $lat,
        'lng' => $lng,
    ]);

    /* boundary */
    if (isset($featureByCode[$code])) {
        $color = match (strtoupper(substr($code, 0, 1))) {
            'B' => '#ef4444',
            'T' => '#22c55e',
            'F' => '#cbd5e1',
            default => '#cbd5e1',
        };
        $geojson = json_encode($featureByCode[$code]['geometry'] ?? null, JSON_UNESCAPED_UNICODE);
        if ($geojson !== false) {
            $boundaryStmt->execute([
                'eid'   => $i,
                'gj'    => $geojson,
                'code'  => $code,
                'color' => $color,
            ]);
        }
    }
    $regionIdByCode[$code] = $i;
    out("  ✓ region #{$i} {$code} {$name}");
    $i++;
}

/* ============================================================
 *  4. Cities — point-in-polygon to assign region, then code/lat/lng
 * ============================================================ */
out('=== Cities ===');
$cityIns = $pdo->prepare(
    'INSERT INTO `cities` (`name`, `region_id`, `code`, `lat`, `lng`, `population`)
     VALUES (:n, :rid, :code, :lat, :lng, :pop)
     ON DUPLICATE KEY UPDATE
       `region_id` = VALUES(`region_id`),
       `lat` = VALUES(`lat`),
       `lng` = VALUES(`lng`),
       `population` = VALUES(`population`)'
);
$cityFindByName = $pdo->prepare(
    'SELECT id, code FROM `cities` WHERE name = :n AND region_id = :rid LIMIT 1'
);
$citySetCode = $pdo->prepare(
    'UPDATE `cities` SET `code` = :code WHERE id = :id'
);
$areaIns = $pdo->prepare(
    'INSERT INTO `areas` (`name`, `city_id`, `code`, `kind`)
     SELECT :n, :cid, :code, "default"
     FROM dual
     WHERE NOT EXISTS (SELECT 1 FROM `areas` WHERE city_id = :cid_dup AND kind = "default" LIMIT 1)'
);

$codeUsage = [];
$addedCities = 0;
$updatedCities = 0;
foreach ($citiesSrc['cities'] as $row) {
    $nm = trim((string) ($row['name_ar'] ?? ''));
    $lat = (float) ($row['lat'] ?? 0);
    $lng = (float) ($row['lng'] ?? 0);
    if ($nm === '' || $lat === 0.0 || $lng === 0.0) { continue; }
    $hint = (string) ($row['shabiya_hint'] ?? '');
    $pop = isset($row['population']) ? (int) $row['population'] : null;
    $kindHint = (string) ($row['kind'] ?? 'town');

    /* find by point-in-polygon */
    $matchedCode = '';
    foreach ($featureByCode as $code => $feature) {
        if (pointInFeature($feature, $lat, $lng)) {
            $matchedCode = $code;
            break;
        }
    }
    if ($matchedCode === '' && $hint !== '' && isset($regionIdByCode[$hint])) {
        $matchedCode = $hint;
    }
    if ($matchedCode === '' || !isset($regionIdByCode[$matchedCode])) {
        out("  ! skip city {$nm} ({$lat},{$lng}) — no region match");
        continue;
    }
    $regionId = $regionIdByCode[$matchedCode];

    /* deterministic code: region prefix + name slug */
    $slug = arabicSlug((string) ($row['name_en'] ?? $nm));
    $base = $matchedCode . '-' . $slug;
    $codeChoice = $base;
    $n = 2;
    while (isset($codeUsage[$codeChoice])) {
        $codeChoice = $base . $n;
        $n++;
    }
    $codeUsage[$codeChoice] = true;

    /* check existing by (name, region_id) to keep code stable across re-runs */
    $cityFindByName->execute(['n' => $nm, 'rid' => $regionId]);
    $existing = $cityFindByName->fetch(\PDO::FETCH_ASSOC);
    if ($existing) {
        $existingCode = (string) ($existing['code'] ?? '');
        if ($existingCode === '') {
            $citySetCode->execute(['code' => $codeChoice, 'id' => (int) $existing['id']]);
        } else {
            $codeChoice = $existingCode;
            $codeUsage[$codeChoice] = true;
        }
        $cityIns->execute([
            'n' => $nm,
            'rid' => $regionId,
            'code' => $codeChoice,
            'lat' => $lat,
            'lng' => $lng,
            'pop' => $pop,
        ]);
        $updatedCities++;
        $cityId = (int) $existing['id'];
    } else {
        $cityIns->execute([
            'n' => $nm,
            'rid' => $regionId,
            'code' => $codeChoice,
            'lat' => $lat,
            'lng' => $lng,
            'pop' => $pop,
        ]);
        $cityId = (int) $pdo->lastInsertId();
        $addedCities++;
    }

    /* ensure a default area exists under this city (for FK back-compat with existing addresses) */
    try {
        $areaIns->execute([
            'n' => 'منطقة افتراضية',
            'cid' => $cityId,
            'code' => 'X',
            'cid_dup' => $cityId,
        ]);
    } catch (\PDOException) {
        /* swallow — unique key may exist for older datasets */
    }
}

out("  → cities added: {$addedCities}, updated: {$updatedCities}");

/* ============================================================
 *  5. Final tally
 * ============================================================ */
$counts = [];
foreach (['states', 'regions', 'cities', 'areas', 'boundaries'] as $tbl) {
    $n = (int) ($pdo->query("SELECT COUNT(*) FROM `$tbl`")->fetchColumn() ?: 0);
    $counts[$tbl] = $n;
}

out('=== Final Counts ===');
foreach ($counts as $k => $v) {
    out("  {$k}: {$v}");
}
out('Done.');
