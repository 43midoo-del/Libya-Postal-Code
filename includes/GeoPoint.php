<?php
/**
 * GeoPoint — small, reusable geo helpers (point-in-polygon + boundary lookup).
 *
 * The "official" boundary source per shabiya is, in priority:
 *   1) The `boundaries` table (`level='region'`, `code` matches B2 / T12 / …).
 *   2) Fallback: data/libya-shabiyat.geojson (FeatureCollection).
 *
 * Lookups are cached per-request so multiple `inShabiyaCode()` calls during
 * a single Address::create() don't re-parse JSON repeatedly.
 */
declare(strict_types=1);

namespace App;

final class GeoPoint
{
    /** @var array<string, array<int, array<int, array<int, array<int, float>>>>>|null */
    private static ?array $shabiyaPolygonCache = null;

    /**
     * Point-in-polygon (with holes). $polygon = GeoJSON Polygon coordinates:
     * [outerRing, hole1, hole2, …] where each ring is [[lng,lat], …].
     *
     * @param array<int, array<int, array<int, float>>> $polygon
     */
    public static function pointInPolygon(float $lat, float $lng, array $polygon): bool
    {
        if ($polygon === []) {
            return false;
        }
        $outer = $polygon[0];
        if (!is_array($outer) || count($outer) < 3) {
            return false;
        }
        if (!self::ringContains($outer, $lat, $lng)) {
            return false;
        }
        $n = count($polygon);
        for ($i = 1; $i < $n; $i++) {
            $hole = $polygon[$i];
            if (is_array($hole) && self::ringContains($hole, $lat, $lng)) {
                return false; /* inside a hole = outside */
            }
        }
        return true;
    }

    /**
     * @param array<int, array<int, float>> $ring
     */
    public static function ringContains(array $ring, float $lat, float $lng): bool
    {
        $n = count($ring);
        if ($n < 3) {
            return false;
        }
        $inside = false;
        $x = $lng;
        $y = $lat;
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            $xi = (float) ($ring[$i][0] ?? 0);
            $yi = (float) ($ring[$i][1] ?? 0);
            $xj = (float) ($ring[$j][0] ?? 0);
            $yj = (float) ($ring[$j][1] ?? 0);
            $intersect = (($yi > $y) !== ($yj > $y))
                && ($x < (($xj - $xi) * ($y - $yi) / (($yj - $yi) ?: 1e-12)) + $xi);
            if ($intersect) {
                $inside = !$inside;
            }
        }
        return $inside;
    }

    /**
     * Parse any GeoJSON string (Geometry / Feature / FeatureCollection) into a flat
     * list of Polygon coordinate arrays. Public wrapper around the internal parser.
     *
     * @return array<int, array<int, array<int, array<int, float>>>>
     */
    public static function polygonsFromGeoJson(string $raw): array
    {
        $raw = trim($raw);
        if ($raw === '') {
            return [];
        }
        return self::extractPolygons($raw);
    }

    /**
     * Whether two polygons (each = [outerRing, hole1, …], ring = [[lng,lat], …]) overlap.
     * Uses bbox rejection, then vertex-containment (both directions), then edge crossing.
     *
     * @param array<int, array<int, array<int, float>>> $a
     * @param array<int, array<int, array<int, float>>> $b
     */
    public static function polygonsOverlap(array $a, array $b): bool
    {
        if ($a === [] || $b === []) {
            return false;
        }
        $ringA = $a[0] ?? [];
        $ringB = $b[0] ?? [];
        if (!is_array($ringA) || count($ringA) < 3 || !is_array($ringB) || count($ringB) < 3) {
            return false;
        }
        $bbA = self::ringBbox($ringA);
        $bbB = self::ringBbox($ringB);
        if (!self::bboxOverlap($bbA, $bbB)) {
            return false;
        }
        foreach ($ringA as $pt) {
            if (self::pointInPolygon((float) ($pt[1] ?? 0), (float) ($pt[0] ?? 0), $b)) {
                return true;
            }
        }
        foreach ($ringB as $pt) {
            if (self::pointInPolygon((float) ($pt[1] ?? 0), (float) ($pt[0] ?? 0), $a)) {
                return true;
            }
        }
        $na = count($ringA);
        $nb = count($ringB);
        for ($i = 0; $i < $na - 1; $i++) {
            for ($j = 0; $j < $nb - 1; $j++) {
                if (self::segmentsIntersect($ringA[$i], $ringA[$i + 1], $ringB[$j], $ringB[$j + 1])) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * @param array<int, array<int, float>> $ring
     * @return array{minX: float, minY: float, maxX: float, maxY: float}
     */
    private static function ringBbox(array $ring): array
    {
        $minX = INF;
        $minY = INF;
        $maxX = -INF;
        $maxY = -INF;
        foreach ($ring as $pt) {
            $x = (float) ($pt[0] ?? 0);
            $y = (float) ($pt[1] ?? 0);
            if ($x < $minX) { $minX = $x; }
            if ($x > $maxX) { $maxX = $x; }
            if ($y < $minY) { $minY = $y; }
            if ($y > $maxY) { $maxY = $y; }
        }
        return ['minX' => $minX, 'minY' => $minY, 'maxX' => $maxX, 'maxY' => $maxY];
    }

    /**
     * @param array{minX: float, minY: float, maxX: float, maxY: float} $a
     * @param array{minX: float, minY: float, maxX: float, maxY: float} $b
     */
    private static function bboxOverlap(array $a, array $b): bool
    {
        return $a['minX'] <= $b['maxX'] && $a['maxX'] >= $b['minX']
            && $a['minY'] <= $b['maxY'] && $a['maxY'] >= $b['minY'];
    }

    /**
     * Proper segment intersection test for segments p1p2 and p3p4 (each [lng,lat]).
     *
     * @param array<int, float> $p1
     * @param array<int, float> $p2
     * @param array<int, float> $p3
     * @param array<int, float> $p4
     */
    private static function segmentsIntersect(array $p1, array $p2, array $p3, array $p4): bool
    {
        $ccw = static function (array $a, array $b, array $c): float {
            return ((float) $c[1] - (float) $a[1]) * ((float) $b[0] - (float) $a[0])
                - ((float) $b[1] - (float) $a[1]) * ((float) $c[0] - (float) $a[0]);
        };
        $d1 = $ccw($p3, $p4, $p1);
        $d2 = $ccw($p3, $p4, $p2);
        $d3 = $ccw($p1, $p2, $p3);
        $d4 = $ccw($p1, $p2, $p4);
        return (($d1 > 0) !== ($d2 > 0)) && (($d3 > 0) !== ($d4 > 0));
    }

    /**
     * Lookup the polygon set for a shabiya by its code (e.g. "B2", "T12").
     * Returns NULL if no boundary data is available for that code (cannot verify).
     * Returns an array of GeoJSON Polygon coordinates (one per part for MultiPolygon).
     *
     * @return array<int, array<int, array<int, array<int, float>>>>|null
     */
    public static function shabiyaPolygons(string $code): ?array
    {
        $code = strtoupper(trim($code));
        if ($code === '') {
            return null;
        }
        self::loadShabiyaPolygons();
        return self::$shabiyaPolygonCache[$code] ?? null;
    }

    /**
     * Verify whether the point lies inside the shabiya's polygon.
     * Returns:
     *   - true  if inside
     *   - false if outside
     *   - null  if data is missing or unverifiable (caller should not flag a warning)
     */
    public static function inShabiyaCode(string $code, float $lat, float $lng): ?bool
    {
        $polys = self::shabiyaPolygons($code);
        if ($polys === null || $polys === []) {
            return null;
        }
        foreach ($polys as $polygon) {
            if (self::pointInPolygon($lat, $lng, $polygon)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Loads (and caches) shabiya polygons by code. Prefers DB `boundaries`
     * table, then falls back to data/libya-shabiyat.geojson.
     */
    private static function loadShabiyaPolygons(): void
    {
        if (self::$shabiyaPolygonCache !== null) {
            return;
        }
        $cache = [];

        /* 1) DB-stored boundaries (preferred) */
        try {
            $pdo = Database::getInstance()->getPdo();
            $st  = $pdo->query("SELECT code, geojson FROM `boundaries` WHERE level = 'region' AND geojson IS NOT NULL AND geojson != ''");
            if ($st !== false) {
                foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                    $code = strtoupper((string) ($row['code'] ?? ''));
                    if ($code === '') { continue; }
                    $polys = self::extractPolygons((string) ($row['geojson'] ?? ''));
                    if ($polys !== []) {
                        $cache[$code] = $polys;
                    }
                }
            }
        } catch (\Throwable) {
            /* table may not exist yet (pre-Phase-0); ignore */
        }

        /* 2) GeoJSON fallback for any code missing from DB */
        $file = dirname(__DIR__) . '/data/libya-shabiyat.geojson';
        if (is_file($file)) {
            $raw = @file_get_contents($file);
            if (is_string($raw) && $raw !== '') {
                $data = json_decode($raw, true);
                if (is_array($data) && ($data['type'] ?? '') === 'FeatureCollection') {
                    foreach (($data['features'] ?? []) as $feature) {
                        if (!is_array($feature)) { continue; }
                        $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
                        $code  = strtoupper((string) ($props['code'] ?? $props['CODE'] ?? ''));
                        if ($code === '' || isset($cache[$code])) { continue; }
                        $geom = $feature['geometry'] ?? null;
                        if (!is_array($geom)) { continue; }
                        $polys = self::geometryToPolygons($geom);
                        if ($polys !== []) {
                            $cache[$code] = $polys;
                        }
                    }
                }
            }
        }

        self::$shabiyaPolygonCache = $cache;
    }

    /**
     * Parses a GeoJSON string (Geometry, Feature, or FeatureCollection) and
     * returns a flat array of Polygon coordinate arrays.
     *
     * @return array<int, array<int, array<int, array<int, float>>>>
     */
    private static function extractPolygons(string $raw): array
    {
        $data = json_decode($raw, true);
        if (!is_array($data)) { return []; }
        $type = (string) ($data['type'] ?? '');
        if ($type === 'FeatureCollection') {
            $out = [];
            foreach (($data['features'] ?? []) as $f) {
                if (!is_array($f)) { continue; }
                $geom = $f['geometry'] ?? null;
                if (is_array($geom)) {
                    foreach (self::geometryToPolygons($geom) as $p) { $out[] = $p; }
                }
            }
            return $out;
        }
        if ($type === 'Feature') {
            $geom = $data['geometry'] ?? null;
            return is_array($geom) ? self::geometryToPolygons($geom) : [];
        }
        return self::geometryToPolygons($data);
    }

    /**
     * @param array<string, mixed> $geom
     * @return array<int, array<int, array<int, array<int, float>>>>
     */
    private static function geometryToPolygons(array $geom): array
    {
        $type = (string) ($geom['type'] ?? '');
        $coords = $geom['coordinates'] ?? null;
        if (!is_array($coords)) { return []; }
        if ($type === 'Polygon') {
            return [$coords];
        }
        if ($type === 'MultiPolygon') {
            $out = [];
            foreach ($coords as $poly) {
                if (is_array($poly)) { $out[] = $poly; }
            }
            return $out;
        }
        return [];
    }
}
