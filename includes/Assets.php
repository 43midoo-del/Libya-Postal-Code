<?php
/**
 * Versioned URLs for project static assets and vendored libraries.
 */
declare(strict_types=1);

namespace App;

final class Assets
{
    public static function url(string $rel): string
    {
        $rel = ltrim(str_replace('\\', '/', $rel), '/');
        $abs = APP_ROOT . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        $ver = is_file($abs) ? (string) filemtime($abs) : '0';
        return $rel . '?v=' . $ver;
    }

    public static function leafletCss(): string
    {
        return self::url('vendor/leaflet/1.9.4/leaflet.css');
    }

    public static function leafletJs(): string
    {
        return self::url('vendor/leaflet/1.9.4/leaflet.js');
    }

    public static function html2canvasJs(): string
    {
        return self::url('vendor/html2canvas/1.4.1/html2canvas.min.js');
    }

    public static function qrcodeJs(): string
    {
        return self::url('vendor/qrcodejs/1.0.0/qrcode.min.js');
    }

    public static function chartJs(): string
    {
        return self::url('vendor/chart.js/4.4.1/chart.umd.min.js');
    }

    public static function html2pdfJs(): string
    {
        return self::url('vendor/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
    }

    public static function geomanCss(): string
    {
        return self::url('vendor/leaflet-geoman/2.16.0/leaflet-geoman.css');
    }

    public static function geomanJs(): string
    {
        return self::url('vendor/leaflet-geoman/2.16.0/leaflet-geoman.min.js');
    }

    /** @return array<string, mixed> */
    public static function offlineConfig(): array
    {
        static $cfg = null;
        if ($cfg === null) {
            $path = APP_ROOT . '/config/offline.php';
            $cfg = is_file($path) ? require $path : [];
        }
        return is_array($cfg) ? $cfg : [];
    }

    public static function offlineSatMbtilesPath(): string
    {
        $cfg = self::offlineConfig();
        $rel = (string) ($cfg['sat_mbtiles_path'] ?? 'data/tiles/libya-sat.mbtiles');
        return APP_ROOT . '/' . str_replace('/', DIRECTORY_SEPARATOR, ltrim($rel, '/'));
    }

    public static function offlineSatAvailable(): bool
    {
        return self::mbtilesHasTiles(self::offlineSatMbtilesPath());
    }

    public static function offlineLabelsTransportPath(): string
    {
        $cfg = self::offlineConfig();
        $rel = (string) ($cfg['labels_transport_mbtiles_path'] ?? 'data/tiles/libya-labels-transport.mbtiles');
        return APP_ROOT . '/' . str_replace('/', DIRECTORY_SEPARATOR, ltrim($rel, '/'));
    }

    public static function offlineLabelsPlacesPath(): string
    {
        $cfg = self::offlineConfig();
        $rel = (string) ($cfg['labels_places_mbtiles_path'] ?? 'data/tiles/libya-labels-places.mbtiles');
        return APP_ROOT . '/' . str_replace('/', DIRECTORY_SEPARATOR, ltrim($rel, '/'));
    }

    public static function offlineLabelsTransportAvailable(): bool
    {
        return self::mbtilesHasTiles(self::offlineLabelsTransportPath());
    }

    public static function offlineLabelsPlacesAvailable(): bool
    {
        return self::mbtilesHasTiles(self::offlineLabelsPlacesPath());
    }

    public static function offlineLabelsAvailable(): bool
    {
        return self::offlineLabelsTransportAvailable();
    }

    public static function offlineTilePath(string $layer): ?string
    {
        return match ($layer) {
            'sat'              => self::offlineSatMbtilesPath(),
            'labels', 'labels-transport' => self::offlineLabelsTransportPath(),
            'labels-places'    => self::offlineLabelsPlacesPath(),
            default            => null,
        };
    }

    private static function mbtilesHasTiles(string $path): bool
    {
        if (!is_file($path) || (filesize($path) ?: 0) < 4096) {
            return false;
        }
        if (!MBTilesService::isAvailable()) {
            return false;
        }
        try {
            $stats = (new MBTilesService($path))->stats();
            return ($stats['tiles'] ?? 0) > 0;
        } catch (\Throwable) {
            return false;
        }
    }
}
