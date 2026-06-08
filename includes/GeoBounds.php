<?php
/**
 * WGS84 bounds (same as config/map.php) for simple server-side checks.
 */
declare(strict_types=1);

namespace App;

final class GeoBounds
{
    public static function isInLibya(float $lat, float $lng): bool
    {
        $m = require dirname(__DIR__) . '/config/map.php';
        $b = $m['libya_bounds'];
        return $lat >= (float) $b['south']
            && $lat <= (float) $b['north']
            && $lng >= (float) $b['west']
            && $lng <= (float) $b['east'];
    }
}
