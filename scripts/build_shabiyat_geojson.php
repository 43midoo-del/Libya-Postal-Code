<?php
/**
 * Build the Libya shabiyat GeoJSON used by the address-add map.
 *
 * - Reads the geoBoundaries Libya ADM1 source (saved at data/libya-shabiyat-source.geojson).
 * - Maps each admin polygon to the project's postal codes (B1–B7, T8–T16, F17–F22).
 * - Synthesises T9 ("جنوب الخليج") because the postal scheme uses 22 regions that differ
 *   slightly from the Natural Earth/geoBoundaries 22 admin divisions.
 * - Writes the resulting FeatureCollection to data/libya-shabiyat.geojson.
 *
 * Run from a shell:
 *     php scripts/build_shabiyat_geojson.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
$srcPath = $root . '/data/libya-shabiyat-source.geojson';
$outPath = $root . '/data/libya-shabiyat.geojson';

if (!file_exists($srcPath)) {
    fwrite(STDERR, "Source GeoJSON not found: $srcPath\n");
    exit(1);
}

$raw = (string) file_get_contents($srcPath);
$src = json_decode($raw, true);
if (!is_array($src) || empty($src['features'])) {
    fwrite(STDERR, "Invalid source GeoJSON.\n");
    exit(1);
}

/** ISO subcode → project postal-code mapping (postal_map_regions.php order). */
$isoToPostal = [
    'LY-BU' => ['code' => 'B1', 'province' => 'B', 'n' => 1, 'name' => 'شرق البلاد'],
    'LY-DR' => ['code' => 'B2', 'province' => 'B', 'n' => 2, 'name' => 'درنة'],
    'LY-JA' => ['code' => 'B3', 'province' => 'B', 'n' => 3, 'name' => 'الجبل الأخضر'],
    'LY-MJ' => ['code' => 'B4', 'province' => 'B', 'n' => 4, 'name' => 'المرج'],
    'LY-BA' => ['code' => 'B5', 'province' => 'B', 'n' => 5, 'name' => 'بنغازي'],
    'LY-WA' => ['code' => 'B6', 'province' => 'B', 'n' => 6, 'name' => 'الواحات'],
    'LY-KF' => ['code' => 'B7', 'province' => 'B', 'n' => 7, 'name' => 'الكفرة'],
    'LY-SR' => ['code' => 'T8', 'province' => 'T', 'n' => 8, 'name' => 'سرت'],
    'LY-MI' => ['code' => 'T10', 'province' => 'T', 'n' => 10, 'name' => 'مصراتة'],
    'LY-MB' => ['code' => 'T11', 'province' => 'T', 'n' => 11, 'name' => 'المرقب'],
    'LY-TB' => ['code' => 'T12', 'province' => 'T', 'n' => 12, 'name' => 'طرابلس'],
    'LY-JI' => ['code' => 'T13', 'province' => 'T', 'n' => 13, 'name' => 'الجفارة'],
    'LY-ZA' => ['code' => 'T14', 'province' => 'T', 'n' => 14, 'name' => 'الزاوية'],
    /* Postal scheme has no separate Nuqat-al-Khams slot, so its polygon joins T14 as a MultiPolygon below. */
    'LY-NQ' => ['code' => 'T14', 'province' => 'T', 'n' => 14, 'name' => 'الزاوية'],
    'LY-JG' => ['code' => 'T15', 'province' => 'T', 'n' => 15, 'name' => 'الجبل الغربي'],
    'LY-NL' => ['code' => 'T16', 'province' => 'T', 'n' => 16, 'name' => 'نالوت'],
    'LY-JUU' => ['code' => 'F17', 'province' => 'F', 'n' => 17, 'name' => 'الجفرة'],
    'LY-JU'  => ['code' => 'F17', 'province' => 'F', 'n' => 17, 'name' => 'الجفرة'],
    'LY-WS' => ['code' => 'F18', 'province' => 'F', 'n' => 18, 'name' => 'وادي الشاطئ'],
    'LY-SB' => ['code' => 'F19', 'province' => 'F', 'n' => 19, 'name' => 'سبها'],
    'LY-WD' => ['code' => 'F20', 'province' => 'F', 'n' => 20, 'name' => 'وادي الحياة'],
    'LY-GT' => ['code' => 'F21', 'province' => 'F', 'n' => 21, 'name' => 'غات'],
    'LY-MQ' => ['code' => 'F22', 'province' => 'F', 'n' => 22, 'name' => 'مرزق'],
];

/** Synthetic T9 polygon — central-north coast, around the head of the Gulf of Sidra
 *  (between Misrata in the west and Sirte in the east). Overlaps with the eastern fringe
 *  of LY-MI and the western coast of LY-SR; drawn after them so labels stack correctly. */
$t9Coords = [[
    [15.30, 31.40],
    [15.42, 31.42],
    [15.55, 31.43],
    [15.78, 31.40],
    [16.00, 31.35],
    [16.20, 31.28],
    [16.40, 31.20],
    [16.55, 31.10],
    [16.55, 30.85],
    [16.45, 30.60],
    [16.30, 30.35],
    [16.10, 30.20],
    [15.85, 30.20],
    [15.55, 30.30],
    [15.35, 30.65],
    [15.25, 31.00],
    [15.30, 31.40],
]];

/** @var array<string, array{meta: array<string, mixed>, polygons: list<array<int, mixed>>, sources: list<string>}> $byCode */
$byCode = [];
foreach ($src['features'] as $f) {
    $iso = (string) ($f['properties']['shapeISO'] ?? '');
    if (!isset($isoToPostal[$iso])) {
        fwrite(STDERR, "Skipping unmapped ISO: $iso (" . ($f['properties']['shapeName'] ?? '?') . ")\n");
        continue;
    }
    $meta = $isoToPostal[$iso];
    $code = $meta['code'];
    $geom = $f['geometry'] ?? null;
    if (!is_array($geom)) {
        continue;
    }
    $polys = [];
    if (($geom['type'] ?? '') === 'Polygon') {
        $polys[] = $geom['coordinates'];
    } elseif (($geom['type'] ?? '') === 'MultiPolygon') {
        foreach ($geom['coordinates'] as $p) {
            $polys[] = $p;
        }
    }
    if (!isset($byCode[$code])) {
        $byCode[$code] = [
            'meta' => $meta,
            'polygons' => [],
            'sources' => [],
        ];
    }
    $byCode[$code]['polygons'] = array_merge($byCode[$code]['polygons'], $polys);
    $byCode[$code]['sources'][] = $iso . ' / ' . ($f['properties']['shapeName'] ?? '');
}

$features = [];
foreach ($byCode as $code => $entry) {
    $meta = $entry['meta'];
    $polys = $entry['polygons'];
    if (count($polys) === 1) {
        $geometry = [
            'type' => 'Polygon',
            'coordinates' => $polys[0],
        ];
    } else {
        $geometry = [
            'type' => 'MultiPolygon',
            'coordinates' => $polys,
        ];
    }
    $features[] = [
        'type' => 'Feature',
        'properties' => [
            'code' => $code,
            'province' => $meta['province'],
            'n' => $meta['n'],
            'name' => $meta['name'],
            'sources' => $entry['sources'],
        ],
        'geometry' => $geometry,
    ];
}

$features[] = [
    'type' => 'Feature',
    'properties' => [
        'code' => 'T9',
        'province' => 'T',
        'n' => 9,
        'name' => 'جنوب الخليج',
        'sourceISO' => 'SYNTH',
        'sourceName' => 'Synthetic',
    ],
    'geometry' => [
        'type' => 'Polygon',
        'coordinates' => $t9Coords,
    ],
];

usort($features, function (array $a, array $b): int {
    return ($a['properties']['n'] ?? 0) <=> ($b['properties']['n'] ?? 0);
});

$out = [
    'type' => 'FeatureCollection',
    'features' => $features,
];

$encoded = json_encode($out, JSON_UNESCAPED_UNICODE);
if ($encoded === false) {
    fwrite(STDERR, "Failed to encode result GeoJSON.\n");
    exit(1);
}
file_put_contents($outPath, $encoded);
fwrite(STDOUT, "Wrote " . count($features) . " features to $outPath\n");

/* Derive Libya's exact country outline by unioning every admin outer ring.
   Algorithm: count every directed edge across all rings; edges shared by two
   adjacent shabiyat appear twice (once in each direction). Edges that survive
   filtering (i.e., appear only once) are the country boundary, which we then
   walk to form a closed ring. Source data shares exact vertex coordinates
   between neighbours, so equality comparison is reliable. */

$edgeCount = [];
foreach ($src['features'] as $f) {
    $g = $f['geometry'] ?? null;
    if (!is_array($g)) {
        continue;
    }
    $polys = [];
    if (($g['type'] ?? '') === 'Polygon') {
        $polys[] = $g['coordinates'];
    } elseif (($g['type'] ?? '') === 'MultiPolygon') {
        foreach ($g['coordinates'] as $p) {
            $polys[] = $p;
        }
    }
    foreach ($polys as $poly) {
        $ring = $poly[0] ?? null;
        if (!is_array($ring) || count($ring) < 4) {
            continue;
        }
        $n = count($ring);
        for ($i = 0; $i < $n - 1; $i++) {
            $a = $ring[$i];
            $b = $ring[$i + 1];
            if ($a[0] < $b[0] || ($a[0] === $b[0] && $a[1] < $b[1])) {
                $key = $a[0] . '|' . $a[1] . '__' . $b[0] . '|' . $b[1];
            } else {
                $key = $b[0] . '|' . $b[1] . '__' . $a[0] . '|' . $a[1];
            }
            $edgeCount[$key] = ($edgeCount[$key] ?? 0) + 1;
        }
    }
}

$adj = [];
foreach ($edgeCount as $key => $count) {
    if ($count !== 1) {
        continue;
    }
    [$p1, $p2] = explode('__', $key);
    $adj[$p1][] = $p2;
    $adj[$p2][] = $p1;
}

if (!empty($adj)) {
    $startKey = null;
    $minX = INF;
    foreach ($adj as $k => $_) {
        [$x, $y] = explode('|', $k);
        $xv = (float) $x;
        if ($xv < $minX) {
            $minX = $xv;
            $startKey = $k;
        }
    }
    $visited = [];
    $path = [$startKey];
    $visited[$startKey] = true;
    $current = $startKey;
    $maxSteps = count($adj) + 4;
    for ($step = 0; $step < $maxSteps; $step++) {
        $next = null;
        foreach ($adj[$current] ?? [] as $cand) {
            if (!isset($visited[$cand])) {
                $next = $cand;
                break;
            }
        }
        if ($next === null) {
            break;
        }
        $path[] = $next;
        $visited[$next] = true;
        $current = $next;
    }
    $ringOut = [];
    foreach ($path as $pkey) {
        [$x, $y] = explode('|', $pkey);
        $ringOut[] = [(float) $x, (float) $y];
    }
    if ($ringOut[0] !== end($ringOut)) {
        $ringOut[] = $ringOut[0];
    }
    $maskFeature = [
        'type' => 'Feature',
        'properties' => [
            'name' => 'LibyaCountryOutline',
            'note' => 'Auto-derived by unioning all 22 admin polygons; outer ring of the country.',
        ],
        'geometry' => [
            'type' => 'Polygon',
            'coordinates' => [$ringOut],
        ],
    ];
    $maskPath = $root . '/data/libya-mask-inner-ring.geojson';
    file_put_contents($maskPath, json_encode($maskFeature, JSON_UNESCAPED_UNICODE));
    fwrite(STDOUT, 'Wrote country mask with ' . count($ringOut) . " points to $maskPath\n");

    $visibleRing = buildVisibleMaritimeMaskRing($ringOut);
    $visibleFeature = [
        'type' => 'Feature',
        'properties' => [
            'name' => 'LibyaVisibleMaskRing',
            'note' => 'Land outline plus a modest maritime buffer for the map hole.',
        ],
        'geometry' => [
            'type' => 'Polygon',
            'coordinates' => [$visibleRing],
        ],
    ];
    $visiblePath = $root . '/data/libya-visible-mask-ring.geojson';
    file_put_contents($visiblePath, json_encode($visibleFeature, JSON_UNESCAPED_UNICODE));
    fwrite(STDOUT, 'Wrote visible maritime mask with ' . count($visibleRing) . " points to $visiblePath\n");
} else {
    fwrite(STDERR, "Could not derive country mask: no unique boundary edges.\n");
}

/**
 * @param list<array{0: float, 1: float}> $landRing [lng, lat]
 * @return list<array{0: float, 1: float}>
 */
function buildVisibleMaritimeMaskRing(array $landRing): array
{
    $profile = [];
    foreach ($landRing as $point) {
        $lng = $point[0];
        $lat = $point[1];
        $key = (string) (round($lng * 4) / 4);
        if (!isset($profile[$key]) || $lat > $profile[$key]) {
            $profile[$key] = $lat;
        }
    }

    $northPush = 0.22;
    $sirteSouthPush = 0.28;
    $coastTol = 0.22;
    $visible = [];

    foreach ($landRing as $point) {
        $lng = $point[0];
        $lat = $point[1];
        $coastLat = northernCoastLatFromProfile($profile, $lng);
        if ($lng >= 9.2 && $lng <= 25.2 && $coastLat !== null && $coastLat >= 28.8) {
            $onNorthCoast = $lat >= $coastLat - $coastTol;
            $inSirteGulf = $lng >= 16.0 && $lng <= 20.5
                && $lat < $coastLat - 0.08 && $lat >= 29.8 && $lat <= 32.2;
            if ($onNorthCoast) {
                $lat += $northPush;
            } elseif ($inSirteGulf) {
                $lat -= $sirteSouthPush;
            }
        }
        $visible[] = [$lng, $lat];
    }

    if ($visible !== [] && $visible[0] !== $visible[count($visible) - 1]) {
        $visible[] = $visible[0];
    }

    return $visible;
}

/**
 * @param array<string, float> $profile
 */
function northernCoastLatFromProfile(array $profile, float $lng): ?float
{
    $key = (string) (round($lng * 4) / 4);
    if (isset($profile[$key])) {
        return $profile[$key];
    }
    $bestKey = null;
    $bestDelta = INF;
    foreach ($profile as $k => $lat) {
        $delta = abs((float) $k - $lng);
        if ($delta < $bestDelta) {
            $bestDelta = $delta;
            $bestKey = $k;
        }
    }
    return $bestKey !== null ? $profile[$bestKey] : null;
}

