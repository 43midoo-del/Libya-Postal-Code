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

use App\MBTilesService;

final class TileController extends BaseController
{
    /** 1x1 transparent PNG — used when no tile is available. */
    private const BLANK_PNG = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82";

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
        try {
            $svc = new MBTilesService();
        } catch (\Throwable) {
            $this->sendBlank(503);
            return;
        }

        $tile = $svc->getTileXYZ($z, $x, $y);
        if ($tile === null) {
            $this->sendBlank(204); /* No Content — client/SW can fall back to a remote source */
            return;
        }

        $format = $svc->meta('format') ?: 'png';
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
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . strlen($tile));
        header('ETag: ' . $etag);
        header('Cache-Control: public, max-age=2592000, immutable');
        echo $tile;
    }

    private function sendBlank(int $status): void
    {
        http_response_code($status);
        header('Content-Type: image/png');
        header('Content-Length: ' . strlen(self::BLANK_PNG));
        header('Cache-Control: no-store');
        if ($status !== 204) {
            echo self::BLANK_PNG;
        }
    }
}
