<?php
declare(strict_types=1);

namespace App;

/**
 * Validates raster map tiles served from MBTiles (rejects OSM error placeholders).
 */
final class TileValidator
{
    private const BLOCKED_SHA1 = '0cfb5f443183efc5921f61005aaa7f341fcfd143';
    private const BLOCKED_LEN  = 6987;
    /** OSM "access blocked" variants are often ~6.4–7.2 KB instead of exactly 6987. */
    private const ERROR_BAND_MIN = 6000;
    private const ERROR_BAND_MAX = 7200;
    /** Overview tiles (z5–8) also ship ~5.5–6.0 KB error placeholders. */
    private const OVERVIEW_ERROR_BAND_MIN = 5500;

    public static function isBlankTile(string $body): bool
    {
        $path = dirname(__DIR__) . '/data/tiles/blank-256.png';
        if (is_file($path)) {
            static $blankSha = null;
            if ($blankSha === null) {
                $b = file_get_contents($path);
                $blankSha = is_string($b) ? sha1($b) : '';
            }
            if ($blankSha !== '' && sha1($body) === $blankSha) {
                return true;
            }
        }
        return strlen($body) >= 300 && strlen($body) <= 500;
    }

    public static function isValidPngTile(string $body, ?int $zoom = null): bool
    {
        if (self::isBlankTile($body)) {
            return true;
        }
        if (strlen($body) < 800 || !str_starts_with($body, "\x89PNG\r\n\x1a\n")) {
            return false;
        }
        if (stripos($body, 'Access blocked') !== false) {
            return false;
        }
        if (stripos($body, 'access blocked') !== false) {
            return false;
        }
        if (strlen($body) === self::BLOCKED_LEN || sha1($body) === self::BLOCKED_SHA1) {
            return false;
        }
        $len = strlen($body);
        $bandMin = ($zoom !== null && $zoom <= 8) ? self::OVERVIEW_ERROR_BAND_MIN : self::ERROR_BAND_MIN;
        if ($len >= $bandMin && $len <= self::ERROR_BAND_MAX) {
            return false;
        }
        return true;
    }
}
