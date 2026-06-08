<?php
/**
 * Build the Libya cities/localities GeoJSON used by the address-add map's
 * second drill-down level (shabiyya → city).
 *
 * - Reads the curated source list at data/libya-cities-source.json
 *   (a JSON file with WGS84 lat/lng + Arabic/English names).
 * - For each row, runs a point-in-polygon test against every feature in
 *   data/libya-shabiyat.geojson (Polygon and MultiPolygon supported, with
 *   correct outer-ring/holes handling) to assign the row's shabiyaCode +
 *   shabiyaName. Falls back to the per-row `shabiya_hint` if the point sits
 *   just outside any polygon (e.g. coastal cities pushed slightly into the
 *   sea by source-data rounding).
 * - Writes the resulting FeatureCollection of Points to
 *   data/libya-cities.geojson.
 *
 * Run from a shell:
 *     php scripts/build_cities_geojson.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
$srcPath = $root . '/data/libya-cities-source.json';
$shPath = $root . '/data/libya-shabiyat.geojson';
$outPath = $root . '/data/libya-cities.geojson';

if (!file_exists($srcPath)) {
    fwrite(STDERR, "Source not found: $srcPath\n");
    exit(1);
}
if (!file_exists($shPath)) {
    fwrite(STDERR, "Shabiyat GeoJSON not found: $shPath\n");
    exit(1);
}

$srcRaw = (string) file_get_contents($srcPath);
$src = json_decode($srcRaw, true);
if (!is_array($src) || empty($src['cities']) || !is_array($src['cities'])) {
    fwrite(STDERR, "Invalid cities source JSON.\n");
    exit(1);
}

$shRaw = (string) file_get_contents($shPath);
$sh = json_decode($shRaw, true);
if (!is_array($sh) || empty($sh['features'])) {
    fwrite(STDERR, "Invalid shabiyat GeoJSON.\n");
    exit(1);
}

/**
 * Standard ray-casting point-in-polygon. Returns true if (lng, lat) lies
 * inside `ring` (an array of [lng, lat] pairs).
 */
function pointInRing(float $lng, float $lat, array $ring): bool
{
    $inside = false;
    $n = count($ring);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        $xi = (float) $ring[$i][0];
        $yi = (float) $ring[$i][1];
        $xj = (float) $ring[$j][0];
        $yj = (float) $ring[$j][1];
        $intersect = (($yi > $lat) !== ($yj > $lat))
            && ($lng < ($xj - $xi) * ($lat - $yi) / (($yj - $yi) ?: 1e-12) + $xi);
        if ($intersect) {
            $inside = !$inside;
        }
    }
    return $inside;
}

/**
 * A single polygon = outer ring + (optional) inner ring holes.
 * Point is inside the polygon iff inside the outer ring AND outside every hole.
 */
function pointInPolygon(float $lng, float $lat, array $polygon): bool
{
    if (empty($polygon)) {
        return false;
    }
    if (!pointInRing($lng, $lat, $polygon[0])) {
        return false;
    }
    for ($h = 1, $c = count($polygon); $h < $c; $h++) {
        if (pointInRing($lng, $lat, $polygon[$h])) {
            return false;
        }
    }
    return true;
}

/**
 * Find the shabiyya feature whose geometry contains (lng, lat). Returns the
 * matched feature or null.
 *
 * @param list<array<string,mixed>> $features
 */
function findShabiya(float $lng, float $lat, array $features): ?array
{
    foreach ($features as $f) {
        $g = $f['geometry'] ?? null;
        if (!is_array($g)) {
            continue;
        }
        $type = $g['type'] ?? '';
        $coords = $g['coordinates'] ?? [];
        if ($type === 'Polygon') {
            if (pointInPolygon($lng, $lat, $coords)) {
                return $f;
            }
        } elseif ($type === 'MultiPolygon') {
            foreach ($coords as $poly) {
                if (pointInPolygon($lng, $lat, $poly)) {
                    return $f;
                }
            }
        }
    }
    return null;
}

/** Build a quick `code => feature` index of shabiyat for hint-based fallback. */
$byCode = [];
foreach ($sh['features'] as $f) {
    $code = (string) ($f['properties']['code'] ?? '');
    if ($code !== '') {
        $byCode[$code] = $f;
    }
}

$outFeatures = [];
$assignedByPip = 0;
$assignedByHint = 0;
$skipped = [];
foreach ($src['cities'] as $city) {
    $lat = (float) ($city['lat'] ?? 0);
    $lng = (float) ($city['lng'] ?? 0);
    if ($lat === 0.0 || $lng === 0.0) {
        $skipped[] = (string) ($city['name_ar'] ?? '?');
        continue;
    }
    $hint = (string) ($city['shabiya_hint'] ?? '');
    $matched = null;

    /* Prefer hint when it geometrically contains the point — many shabiyat
       overlap at their edges (notably the synthetic T9 vs neighbouring T8/T10),
       and the curated hint resolves these ambiguities deterministically. */
    if ($hint !== '' && isset($byCode[$hint])) {
        $hintFeature = $byCode[$hint];
        $g = $hintFeature['geometry'] ?? null;
        $hits = false;
        if (is_array($g)) {
            $type = $g['type'] ?? '';
            $coords = $g['coordinates'] ?? [];
            if ($type === 'Polygon') {
                $hits = pointInPolygon($lng, $lat, $coords);
            } elseif ($type === 'MultiPolygon') {
                foreach ($coords as $poly) {
                    if (pointInPolygon($lng, $lat, $poly)) {
                        $hits = true;
                        break;
                    }
                }
            }
        }
        if ($hits) {
            $matched = $hintFeature;
            $assignedByPip++;
        }
    }

    if ($matched === null) {
        $matched = findShabiya($lng, $lat, $sh['features']);
        if ($matched !== null) {
            $assignedByPip++;
        }
    }

    if ($matched === null) {
        if ($hint !== '' && isset($byCode[$hint])) {
            $matched = $byCode[$hint];
            $assignedByHint++;
        } else {
            $skipped[] = (string) ($city['name_ar'] ?? '?');
            continue;
        }
    }
    $mp = $matched['properties'] ?? [];
    $props = [
        'name_ar' => (string) ($city['name_ar'] ?? ''),
        'name_en' => (string) ($city['name_en'] ?? ''),
        'shabiyaCode' => (string) ($mp['code'] ?? ''),
        'shabiyaName' => (string) ($mp['name'] ?? ''),
        'kind' => (string) ($city['kind'] ?? 'town'),
    ];
    if (isset($city['population'])) {
        $props['population'] = (int) $city['population'];
    }
    $outFeatures[] = [
        'type' => 'Feature',
        'properties' => $props,
        'geometry' => [
            'type' => 'Point',
            'coordinates' => [$lng, $lat],
        ],
    ];
}

usort($outFeatures, function (array $a, array $b): int {
    $ca = (string) ($a['properties']['shabiyaCode'] ?? '');
    $cb = (string) ($b['properties']['shabiyaCode'] ?? '');
    $cmp = strcmp($ca, $cb);
    if ($cmp !== 0) {
        return $cmp;
    }
    return strcmp(
        (string) ($a['properties']['name_en'] ?? ''),
        (string) ($b['properties']['name_en'] ?? '')
    );
});

$out = [
    'type' => 'FeatureCollection',
    'features' => $outFeatures,
];

$encoded = json_encode($out, JSON_UNESCAPED_UNICODE);
if ($encoded === false) {
    fwrite(STDERR, "Failed to encode result GeoJSON.\n");
    exit(1);
}
file_put_contents($outPath, $encoded);

$total = count($outFeatures);
fwrite(STDOUT, "Wrote $total city features to $outPath\n");
fwrite(STDOUT, "  assigned by point-in-polygon: $assignedByPip\n");
fwrite(STDOUT, "  assigned by hint fallback:    $assignedByHint\n");
if (!empty($skipped)) {
    fwrite(STDOUT, "  skipped (no shabiyya found):  " . count($skipped) . " — " . implode(', ', $skipped) . "\n");
}

/** Print a per-shabiyya coverage summary so we can spot any gaps. */
$coverage = [];
foreach ($outFeatures as $f) {
    $code = (string) ($f['properties']['shabiyaCode'] ?? '');
    $coverage[$code] = ($coverage[$code] ?? 0) + 1;
}
ksort($coverage);
fwrite(STDOUT, "Per-shabiyya coverage:\n");
foreach ($coverage as $code => $count) {
    fwrite(STDOUT, "  $code: $count\n");
}
$expectedCodes = array_keys($byCode);
foreach ($expectedCodes as $c) {
    if (!isset($coverage[$c])) {
        fwrite(STDERR, "  WARNING: $c has 0 cities\n");
    }
}
