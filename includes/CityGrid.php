<?php
/**
 * Subdivide a container polygon into Voronoi-like cells (one per seed point).
 * Used by the boundary editor to show editable city/area grids before boundaries are saved.
 */
declare(strict_types=1);

namespace App;

final class CityGrid
{
    /**
     * @param array<int, array<int, array<int, array<int, float>>>> $containerPolys GeoJSON Polygon coordinate sets
     * @param list<array{entity_id:int,name:string,lat:float,lng:float}> $points
     * @param array{level:string,parent_id:int} $meta
     * @return list<array<string,mixed>>
     */
    public static function buildFeatures(array $containerPolys, array $points, array $meta): array
    {
        if ($containerPolys === [] || $points === []) {
            return [];
        }

        $level = (string) ($meta['level'] ?? 'city');
        $parentId = (int) ($meta['parent_id'] ?? 0);
        $parts = self::normalizeParts($containerPolys);
        if ($parts === []) {
            return [];
        }

        if (count($points) === 1) {
            $geom = self::partsToGeometry($parts);
            if ($geom === null) {
                return [];
            }

            return [self::makeFeature($points[0], $geom, $level, $parentId)];
        }

        $byPart = self::assignPointsToParts($parts, $points);
        $features = [];

        foreach ($byPart as $partIdx => $partPoints) {
            if ($partPoints === []) {
                continue;
            }
            $part = $parts[$partIdx];
            foreach ($partPoints as $pt) {
                $ring = self::voronoiCellRing($part, $pt, $partPoints);
                if ($ring === null || count($ring) < 4) {
                    $ring = self::fallbackRing($pt['lat'], $pt['lng'], $part);
                }
                if ($ring === null || count($ring) < 4) {
                    continue;
                }
                $features[] = self::makeFeature($pt, [
                    'type'        => 'Polygon',
                    'coordinates' => [$ring],
                ], $level, $parentId);
            }
        }

        return $features;
    }

    /**
     * Build one Voronoi cell for a new point among existing siblings.
     *
     * @param array<int, array<int, array<int, array<int, float>>>> $containerPolys
     * @param array{entity_id:int,name:string,lat:float,lng:float} $point
     * @param list<array{entity_id:int,name:string,lat:float,lng:float}> $siblings
     * @param array{level:string,parent_id:int} $meta
     * @return array<string,mixed>|null
     */
    public static function buildSingleCell(array $containerPolys, array $point, array $siblings, array $meta): ?array
    {
        $entityId = (int) ($point['entity_id'] ?? 0);
        if ($entityId < 1 || $containerPolys === []) {
            return null;
        }

        $all = $siblings;
        $all[] = $point;
        foreach (self::buildFeatures($containerPolys, $all, $meta) as $feature) {
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            if ((int) ($props['entity_id'] ?? 0) === $entityId) {
                return $feature;
            }
        }

        return null;
    }

    /**
     * @param array<int, array<int, array<int, array<int, float>>>> $containerPolys
     * @return list<array<int, array<int, array<int, float>>>>
     */
    private static function normalizeParts(array $containerPolys): array
    {
        $parts = [];
        foreach ($containerPolys as $poly) {
            if (!is_array($poly) || $poly === []) {
                continue;
            }
            $outer = $poly[0] ?? null;
            if (!is_array($outer) || count($outer) < 4) {
                continue;
            }
            $parts[] = $poly;
        }

        return $parts;
    }

    /**
     * @param list<array<int, array<int, array<int, float>>>> $parts
     * @return array<string,mixed>|null
     */
    private static function partsToGeometry(array $parts): ?array
    {
        if ($parts === []) {
            return null;
        }
        if (count($parts) === 1) {
            return ['type' => 'Polygon', 'coordinates' => $parts[0]];
        }
        $coords = [];
        foreach ($parts as $part) {
            $coords[] = $part;
        }

        return ['type' => 'MultiPolygon', 'coordinates' => $coords];
    }

    /**
     * @param list<array<int, array<int, array<int, float>>>> $parts
     * @param list<array{entity_id:int,name:string,lat:float,lng:float}> $points
     * @return array<int, list<array{entity_id:int,name:string,lat:float,lng:float}>>
     */
    private static function assignPointsToParts(array $parts, array $points): array
    {
        $out = array_fill(0, count($parts), []);
        foreach ($points as $pt) {
            $lat = (float) $pt['lat'];
            $lng = (float) $pt['lng'];
            $bestIdx = 0;
            $bestDist = INF;
            $insideIdx = null;
            foreach ($parts as $idx => $part) {
                if (GeoPoint::pointInPolygon($lat, $lng, $part)) {
                    $insideIdx = $idx;
                    break;
                }
                $cent = self::ringCentroid($part[0]);
                $d = self::distSq($lat, $lng, $cent[0], $cent[1]);
                if ($d < $bestDist) {
                    $bestDist = $d;
                    $bestIdx = $idx;
                }
            }
            $out[$insideIdx ?? $bestIdx][] = $pt;
        }

        return $out;
    }

    /**
     * @param array<int, array<int, array<int, float>>> $part
     * @param array{entity_id:int,name:string,lat:float,lng:float} $focus
     * @param list<array{entity_id:int,name:string,lat:float,lng:float}> $all
     * @return list<array{0:float,1:float}>|null
     */
    private static function voronoiCellRing(array $part, array $focus, array $all): ?array
    {
        $poly = $part;
        foreach ($all as $other) {
            if ((int) $other['entity_id'] === (int) $focus['entity_id']) {
                continue;
            }
            $clipped = self::clipPolygonCloserTo(
                $poly,
                (float) $focus['lat'],
                (float) $focus['lng'],
                (float) $other['lat'],
                (float) $other['lng']
            );
            if ($clipped === []) {
                return null;
            }
            $poly = $clipped;
        }

        $outer = $poly[0] ?? null;
        if (!is_array($outer) || count($outer) < 4) {
            return null;
        }

        return self::closeRing($outer);
    }

    /**
     * @param array<int, array<int, array<int, float>>> $polyCoords
     * @return array<int, array<int, array<int, float>>>
     */
    private static function clipPolygonCloserTo(
        array $polyCoords,
        float $focusLat,
        float $focusLng,
        float $otherLat,
        float $otherLng
    ): array {
        $out = [];
        foreach ($polyCoords as $ring) {
            if (!is_array($ring) || count($ring) < 3) {
                continue;
            }
            $clipped = self::clipRingCloserTo($ring, $focusLat, $focusLng, $otherLat, $otherLng);
            if (count($clipped) >= 4) {
                $out[] = $clipped;
            }
        }

        return $out;
    }

    /**
     * @param list<array{0:float,1:float}> $ring
     * @return list<array{0:float,1:float}>
     */
    private static function clipRingCloserTo(
        array $ring,
        float $focusLat,
        float $focusLng,
        float $otherLat,
        float $otherLng
    ): array {
        $ring = self::closeRing($ring);
        $n = count($ring);
        if ($n < 4) {
            return [];
        }

        $output = [];
        for ($i = 0; $i < $n - 1; $i++) {
            $s = $ring[$i];
            $e = $ring[$i + 1];
            $sIn = self::closerThan((float) $s[1], (float) $s[0], $focusLat, $focusLng, $otherLat, $otherLng);
            $eIn = self::closerThan((float) $e[1], (float) $e[0], $focusLat, $focusLng, $otherLat, $otherLng);

            if ($sIn && $eIn) {
                $output[] = $e;
            } elseif ($sIn && !$eIn) {
                $ix = self::bisectorIntersection($s, $e, $focusLat, $focusLng, $otherLat, $otherLng);
                if ($ix !== null) {
                    $output[] = $ix;
                }
            } elseif (!$sIn && $eIn) {
                $ix = self::bisectorIntersection($s, $e, $focusLat, $focusLng, $otherLat, $otherLng);
                if ($ix !== null) {
                    $output[] = $ix;
                }
                $output[] = $e;
            }
        }

        return self::closeRing($output);
    }

    private static function closerThan(
        float $lat,
        float $lng,
        float $focusLat,
        float $focusLng,
        float $otherLat,
        float $otherLng
    ): bool {
        return self::distSq($lat, $lng, $focusLat, $focusLng) <= self::distSq($lat, $lng, $otherLat, $otherLng);
    }

    private static function distSq(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $dlat = $lat1 - $lat2;
        $dlng = $lng1 - $lng2;

        return $dlat * $dlat + $dlng * $dlng;
    }

    /**
     * @param array{0:float,1:float} $s
     * @param array{0:float,1:float} $e
     * @return array{0:float,1:float}|null
     */
    private static function bisectorIntersection(
        array $s,
        array $e,
        float $focusLat,
        float $focusLng,
        float $otherLat,
        float $otherLng
    ): ?array {
        $lng1 = (float) $s[0];
        $lat1 = (float) $s[1];
        $lng2 = (float) $e[0];
        $lat2 = (float) $e[1];
        $dlng = $lng2 - $lng1;
        $dlat = $lat2 - $lat1;

        $vfLng = $lng1 - $focusLng;
        $vfLat = $lat1 - $focusLat;
        $voLng = $lng1 - $otherLng;
        $voLat = $lat1 - $otherLat;
        $df = ($voLng * $voLng + $voLat * $voLat) - ($vfLng * $vfLng + $vfLat * $vfLat);
        $dot = $dlng * ($otherLng - $focusLng) + $dlat * ($otherLat - $focusLat);

        if (abs($dot) < 1e-15) {
            return null;
        }

        $t = -$df / (2 * $dot);
        if ($t < 0.0 || $t > 1.0) {
            return null;
        }

        return [$lng1 + $t * $dlng, $lat1 + $t * $dlat];
    }

    /**
     * @param array<int, array<int, array<int, float>>> $part
     * @return list<array{0:float,1:float}>|null
     */
    private static function fallbackRing(float $lat, float $lng, array $part): ?array
    {
        $delta = 0.04;
        $ring = [
            [$lng - $delta, $lat - $delta],
            [$lng + $delta, $lat - $delta],
            [$lng + $delta, $lat + $delta],
            [$lng - $delta, $lat + $delta],
        ];
        $clipped = self::clipPolygonCloserTo([$ring], $lat, $lng, $lat + $delta * 3, $lng);
        $outer = $clipped[0] ?? null;
        if (!is_array($outer) || count($outer) < 4) {
            if (GeoPoint::pointInPolygon($lat, $lng, $part)) {
                return self::closeRing($part[0]);
            }

            return null;
        }

        return self::closeRing($outer);
    }

    /**
     * @param list<array{0:float,1:float}> $ring
     * @return array{0:float,1:float}
     */
    private static function ringCentroid(array $ring): array
    {
        $n = count($ring);
        if ($n === 0) {
            return [0.0, 0.0];
        }
        $sumLat = 0.0;
        $sumLng = 0.0;
        $count = 0;
        foreach ($ring as $pt) {
            if (!is_array($pt) || count($pt) < 2) {
                continue;
            }
            $sumLng += (float) $pt[0];
            $sumLat += (float) $pt[1];
            $count++;
        }
        if ($count === 0) {
            return [0.0, 0.0];
        }

        return [$sumLat / $count, $sumLng / $count];
    }

    /**
     * @param list<array{0:float,1:float}> $ring
     * @return list<array{0:float,1:float}>
     */
    private static function closeRing(array $ring): array
    {
        if ($ring === []) {
            return [];
        }
        $first = $ring[0];
        $last = $ring[count($ring) - 1];
        if ((float) $first[0] === (float) $last[0] && (float) $first[1] === (float) $last[1]) {
            return $ring;
        }
        $ring[] = $first;

        return $ring;
    }

    /**
     * @param array{entity_id:int,name:string,lat:float,lng:float} $pt
     * @param array<string,mixed> $geom
     * @return array<string,mixed>
     */
    private static function makeFeature(array $pt, array $geom, string $level, int $parentId): array
    {
        return [
            'type'       => 'Feature',
            'properties' => [
                'entity_id' => (int) $pt['entity_id'],
                'level'     => $level,
                'parent_id' => $parentId,
                'name'      => (string) ($pt['name'] ?? ''),
                'code'      => '',
                'is_grid'   => true,
            ],
            'geometry'   => $geom,
        ];
    }
}
