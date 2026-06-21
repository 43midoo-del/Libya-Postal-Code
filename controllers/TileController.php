<?php
/**
 * Serves vector/raster tiles from a local MBTiles SQLite file.
 *
 *   GET index.php?r=tile&z=6&x=39&y=27   →  image/png bytes
 *
 * If the requested tile is missing from MBTiles, returns a 1x1 transparent PNG
 * so the map shows blank space rather than the Leaflet "broken tile" placeholder
 * (clients can detect this and fall back to OSM if online).
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Assets;
use App\MBTilesService;
use App\TileValidator;

final class TileController extends BaseController
{
    private static ?string $blankPng256 = null;
    private static ?string $seaPng256 = null;
    private static ?string $landPng256 = null;

    /** Legacy 1x1 fallback when blank-256.png is missing. */
    private const BLANK_PNG_1X1 = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82";
    /** Near-empty satellite tiles over the sea (no shoreline detail). */
    private const SAT_EMPTY_TILE_MAX = 950;

    private static function blankPng(): string
    {
        if (self::$blankPng256 !== null) {
            return self::$blankPng256;
        }
        $path = dirname(__DIR__) . '/data/tiles/blank-256.png';
        if (is_file($path)) {
            $body = file_get_contents($path);
            if (is_string($body) && strlen($body) > 80) {
                self::$blankPng256 = $body;
                return self::$blankPng256;
            }
        }
        self::$blankPng256 = self::BLANK_PNG_1X1;
        return self::$blankPng256;
    }

    private static function seaPng(): string
    {
        if (self::$seaPng256 !== null) {
            return self::$seaPng256;
        }
        $path = dirname(__DIR__) . '/data/tiles/sea-256.png';
        if (is_file($path)) {
            $body = file_get_contents($path);
            if (is_string($body) && strlen($body) > 80) {
                self::$seaPng256 = $body;
                return self::$seaPng256;
            }
        }
        self::$seaPng256 = self::blankPng();
        return self::$seaPng256;
    }

    private static function landPng(): string
    {
        if (self::$landPng256 !== null) {
            return self::$landPng256;
        }
        $path = dirname(__DIR__) . '/data/tiles/land-256.png';
        if (is_file($path)) {
            $body = file_get_contents($path);
            if (is_string($body) && strlen($body) > 80) {
                self::$landPng256 = $body;
                return self::$landPng256;
            }
        }
        self::$landPng256 = self::blankPng();
        return self::$landPng256;
    }

    private static function tileCenterLat(int $z, int $y): float
    {
        $n = 1 << $z;
        $latRad = atan(sinh(M_PI * (1.0 - (2.0 * $y + 1.0) / $n)));
        return rad2deg($latRad);
    }

    private static function tileCenterLng(int $z, int $x): float
    {
        $n = 1 << $z;
        return ((float) $x + 0.5) / $n * 360.0 - 180.0;
    }

    private function isSatMaritimeTile(int $z, int $y): bool
    {
        return self::tileCenterLat($z, $y) >= 28.5;
    }

    /** Missing base-map tiles over sea should use sea-256, not transparent blank. */
    private function isMapMaritimeTile(int $z, int $x, int $y): bool
    {
        $lat = self::tileCenterLat($z, $y);
        $lng = self::tileCenterLng($z, $x, $y);
        if ($lng >= 9.0 && $lng <= 25.5 && $lat >= 33.05) {
            return true;
        }
        if ($lng >= 21.5 && $lng <= 25.5 && $lat >= 32.68) {
            return true;
        }
        return false;
    }

    private function mapPlaceholderKind(int $z, int $x, int $y): string
    {
        if ($this->isMapMaritimeTile($z, $x, $y)) {
            return 'sea';
        }
        return 'land';
    }

    private function sendPngBody(string $body, int $status, bool $cacheable = false): void
    {
        http_response_code($status);
        header('Content-Type: image/png');
        header('Content-Length: ' . strlen($body));
        if ($cacheable) {
            header('ETag: "' . sha1($body) . '"');
            header('Cache-Control: public, max-age=2592000, immutable');
        } else {
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('Pragma: no-cache');
        }
        if ($status !== 204) {
            echo $body;
        }
    }

    public function serve(): void
    {
        /* Public read access (offline maps should not require login during PWA boot). */
        $z = isset($_GET['z']) ? (int) $_GET['z'] : -1;
        $x = isset($_GET['x']) ? (int) $_GET['x'] : -1;
        $y = isset($_GET['y']) ? (int) $_GET['y'] : -1;

        if ($z < 0 || $z > 22 || $x < 0 || $y < 0) {
            $this->sendBlank(404);
            return;
        }
        $max = (1 << $z);
        if ($x >= $max || $y >= $max) {
            $this->sendBlank(404);
            return;
        }

        if (!MBTilesService::isAvailable()) {
            $this->sendBlank(503);
            return;
        }
        $layer = isset($_GET['layer']) ? (string) $_GET['layer'] : 'map';
        $mbPath = Assets::offlineTilePath($layer);
        try {
            $svc = MBTilesService::open($mbPath);
        } catch (\Throwable) {
            $this->sendBlank(503);
            return;
        }

        $tile = $svc->getTileXYZ($z, $x, $y);
        $format = $svc->meta('format') ?: 'png';
        $satMaritime = $layer === 'sat' && $this->isSatMaritimeTile($z, $y);
        $mapPlaceholder = $layer === 'map' ? $this->mapPlaceholderKind($z, $x, $y) : null;
        if ($tile === null) {
            $this->sendBlank(200, $satMaritime, $mapPlaceholder);
            return;
        }
        if ($format === 'png' && !TileValidator::isValidPngTile($tile, $z)) {
            $this->sendBlank(200, $satMaritime, $mapPlaceholder);
            return;
        }
        if ($satMaritime && (TileValidator::isBlankTile($tile) || strlen($tile) <= self::SAT_EMPTY_TILE_MAX)) {
            $this->sendBlank(200, true);
            return;
        }
        $mime = match ($format) {
            'jpg', 'jpeg' => 'image/jpeg',
            'webp'        => 'image/webp',
            'pbf'         => 'application/x-protobuf',
            default       => 'image/png',
        };

        $etag = '"' . sha1($tile) . '"';
        if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
            http_response_code(304);
            return;
        }
        $this->sendPngBody($tile, 200, true);
    }

    private function sendBlank(int $status, bool $sea = false, ?string $mapPlaceholder = null): void
    {
        if ($mapPlaceholder === 'sea') {
            $blank = self::seaPng();
        } elseif ($mapPlaceholder === 'land') {
            $blank = self::landPng();
        } else {
            $blank = $sea ? self::seaPng() : self::blankPng();
        }
        $this->sendPngBody($blank, $status, false);
    }
}
