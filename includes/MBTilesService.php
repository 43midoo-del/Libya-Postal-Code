<?php
/**
 * MBTiles reader/writer (SQLite via PDO).
 *
 * Schema (auto-created on first write):
 *   metadata(name TEXT, value TEXT)
 *   tiles(zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB,
 *         PRIMARY KEY (zoom_level, tile_column, tile_row))
 *
 * Note: MBTiles uses TMS Y-axis. Web mercator XYZ uses inverted Y.
 *       Convert with: tms_y = (1 << z) - 1 - xyz_y
 */
declare(strict_types=1);

namespace App;

use PDO;
use RuntimeException;

final class MBTilesService
{
    private PDO $pdo;
    private string $path;
    private ?\PDOStatement $getTileStmt = null;

    /** @var array<string, self> */
    private static array $instances = [];

    public static function open(?string $path = null): self
    {
        $path = $path ?: (dirname(__DIR__) . '/data/tiles/libya.mbtiles');
        if (!isset(self::$instances[$path])) {
            self::$instances[$path] = new self($path);
        }
        return self::$instances[$path];
    }

    public function __construct(?string $path = null)
    {
        $path = $path ?: (dirname(__DIR__) . '/data/tiles/libya.mbtiles');
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $this->path = $path;
        $createdNew = !is_file($path);
        try {
            $this->pdo = new PDO('sqlite:' . $path, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
        } catch (\PDOException $e) {
            throw new RuntimeException('Failed to open MBTiles: ' . $e->getMessage(), 0, $e);
        }
        $this->pdo->exec('PRAGMA journal_mode=WAL');
        $this->pdo->exec('PRAGMA synchronous=NORMAL');
        $this->pdo->exec('PRAGMA cache_size=-64000');
        $this->pdo->exec('PRAGMA temp_store=MEMORY');
        $this->pdo->exec('PRAGMA mmap_size=268435456');
        if ($createdNew) {
            $this->initSchema();
        } else {
            $this->pdo->exec(
                'CREATE INDEX IF NOT EXISTS tiles_xyz_idx ON tiles (zoom_level, tile_column, tile_row)'
            );
        }
    }

    public static function isAvailable(): bool
    {
        return in_array('sqlite', PDO::getAvailableDrivers(), true);
    }

    public function path(): string
    {
        return $this->path;
    }

    private function initSchema(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS metadata (name TEXT PRIMARY KEY, value TEXT);
             CREATE TABLE IF NOT EXISTS tiles (
               zoom_level INTEGER NOT NULL,
               tile_column INTEGER NOT NULL,
               tile_row INTEGER NOT NULL,
               tile_data BLOB,
               PRIMARY KEY (zoom_level, tile_column, tile_row)
             );'
        );
        $this->setMeta('name', 'libya-postal-tiles');
        $this->setMeta('format', 'png');
        $this->setMeta('minzoom', '0');
        $this->setMeta('maxzoom', '18');
        $this->setMeta('bounds', '9.20,19.40,25.15,33.45');
        $this->setMeta('center', '17.18,26.30,6');
        $this->setMeta('type', 'baselayer');
    }

    public function setMeta(string $name, string $value): void
    {
        $st = $this->pdo->prepare('INSERT OR REPLACE INTO metadata (name, value) VALUES (:n, :v)');
        $st->execute(['n' => $name, 'v' => $value]);
    }

    public function meta(string $name): ?string
    {
        $st = $this->pdo->prepare('SELECT value FROM metadata WHERE name = :n LIMIT 1');
        $st->execute(['n' => $name]);
        $v = $st->fetchColumn();
        return $v === false ? null : (string) $v;
    }

    /** XYZ coordinates (Leaflet default). Internal conversion to TMS. */
    public function getTileXYZ(int $z, int $x, int $y): ?string
    {
        $tmsY = ((1 << $z) - 1) - $y;
        return $this->getTileTMS($z, $x, $tmsY);
    }

    public function getTileTMS(int $z, int $x, int $tmsY): ?string
    {
        if ($this->getTileStmt === null) {
            $this->getTileStmt = $this->pdo->prepare(
                'SELECT tile_data FROM tiles
                 WHERE zoom_level = :z AND tile_column = :x AND tile_row = :y
                 LIMIT 1'
            );
        }
        $this->getTileStmt->bindValue(':z', $z, PDO::PARAM_INT);
        $this->getTileStmt->bindValue(':x', $x, PDO::PARAM_INT);
        $this->getTileStmt->bindValue(':y', $tmsY, PDO::PARAM_INT);
        $this->getTileStmt->execute();
        $blob = $this->getTileStmt->fetchColumn();
        if ($blob === false || $blob === null) {
            return null;
        }
        return is_string($blob) ? $blob : (string) $blob;
    }

    public function putTileXYZ(int $z, int $x, int $y, string $data): void
    {
        $tmsY = ((1 << $z) - 1) - $y;
        $this->putTileTMS($z, $x, $tmsY, $data);
    }

    public function putTileTMS(int $z, int $x, int $tmsY, string $data): void
    {
        $st = $this->pdo->prepare(
            'INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data)
             VALUES (:z, :x, :y, :d)'
        );
        $st->bindValue(':z', $z, PDO::PARAM_INT);
        $st->bindValue(':x', $x, PDO::PARAM_INT);
        $st->bindValue(':y', $tmsY, PDO::PARAM_INT);
        $st->bindValue(':d', $data, PDO::PARAM_LOB);
        $st->execute();
    }

    /** @return array{tiles:int,zooms:array<int,int>,size_bytes:int} */
    public function stats(): array
    {
        $tiles = (int) $this->pdo->query('SELECT COUNT(*) FROM tiles')->fetchColumn();
        $zooms = [];
        $rs = $this->pdo->query('SELECT zoom_level, COUNT(*) AS c FROM tiles GROUP BY zoom_level ORDER BY zoom_level');
        while (($r = $rs->fetch(PDO::FETCH_ASSOC)) !== false) {
            $zooms[(int) $r['zoom_level']] = (int) $r['c'];
        }
        $size = is_file($this->path) ? (int) (filesize($this->path) ?: 0) : 0;
        return ['tiles' => $tiles, 'zooms' => $zooms, 'size_bytes' => $size];
    }
}
