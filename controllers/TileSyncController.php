<?php
/**
 * Admin: manual sync of OSM tiles into local MBTiles for offline use.
 *
 *   GET  index.php?r=tile_sync         → admin UI
 *   POST index.php?r=tile_sync_run     → kick off a sync job (synchronous, with budget cap)
 *   GET  index.php?r=tile_sync_status  → JSON: { stats, recent_logs }
 *   POST index.php?r=tile_sync_cancel  → marks the latest running job as cancelled
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Csrf;
use App\Database;
use App\Flash;
use App\MBTilesService;
use App\SessionAuth;
use PDO;

final class TileSyncController extends BaseController
{
    /* Safety cap to keep a single request bounded — avoids unbounded XAMPP runtime. */
    private const HARD_TILE_LIMIT = 1500;

    public function index(): void
    {
        $this->requireAnyRole(['admin']);
        $map = require dirname(__DIR__) . '/config/map.php';
        $stats = ['tiles' => 0, 'zooms' => [], 'size_bytes' => 0];
        $available = MBTilesService::isAvailable();
        if ($available) {
            try { $stats = (new MBTilesService())->stats(); } catch (\Throwable) {}
        }
        $logs = $this->recentLogs(20);
        $this->render('admin/sync/index.php', [
            'title'         => 'مزامنة بلاطات الخريطة',
            'navCurrent'    => 'tile_sync',
            'userName'      => SessionAuth::userName(),
            'userRole'      => SessionAuth::userRole(),
            'csrf'          => Csrf::getToken(),
            'flash'         => Flash::getAndClear(),
            'bounds'        => $map['libya_bounds'],
            'available'     => $available,
            'stats'         => $stats,
            'logs'          => $logs,
            'hardLimit'     => self::HARD_TILE_LIMIT,
            'appShellClass' => 'app-shell--wide',
        ]);
    }

    public function run(): void
    {
        $this->requireAnyRole(['admin']);
        header('Content-Type: application/json; charset=utf-8');
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            http_response_code(405);
            echo json_encode(['ok' => false, 'message' => 'POST required.']);
            return;
        }
        if (!Csrf::validate($_POST['csrf_token'] ?? null)) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'message' => 'CSRF.']);
            return;
        }
        if (!MBTilesService::isAvailable()) {
            http_response_code(503);
            echo json_encode(['ok' => false, 'message' => 'PDO_SQLite غير مفعّل في PHP.']);
            return;
        }

        $south = (float) ($_POST['south'] ?? 19.4);
        $west  = (float) ($_POST['west']  ?? 9.2);
        $north = (float) ($_POST['north'] ?? 33.45);
        $east  = (float) ($_POST['east']  ?? 25.15);
        $zmin  = max(0, min(18, (int) ($_POST['zmin'] ?? 5)));
        $zmax  = max($zmin, min(18, (int) ($_POST['zmax'] ?? 10)));
        $source = (string) ($_POST['source'] ?? 'osm');
        $sourceTmpl = $this->resolveSourceTemplate($source);

        if (!is_finite($south) || !is_finite($west) || !is_finite($north) || !is_finite($east)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'إحداثيات BBox غير صالحة.']);
            return;
        }
        if ($south >= $north || $west >= $east) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'BBox مقلوب — south<north و west<east.']);
            return;
        }

        $tilesToFetch = $this->enumerateTiles($south, $west, $north, $east, $zmin, $zmax, self::HARD_TILE_LIMIT + 1);
        $total = count($tilesToFetch);
        if ($total > self::HARD_TILE_LIMIT) {
            http_response_code(400);
            echo json_encode([
                'ok' => false,
                'message' => 'الكمية المطلوبة (' . $total . ' بلاطة) تجاوزت الحد الأقصى لكل عملية (' . self::HARD_TILE_LIMIT . '). قلّل نطاق التكبير أو حجم BBox.',
            ], JSON_UNESCAPED_UNICODE);
            return;
        }

        $logId = $this->startLog($zmin, $zmax, ['s' => $south, 'w' => $west, 'n' => $north, 'e' => $east], $source, $total);

        $mb = new MBTilesService();
        $downloaded = 0;
        $failed = 0;
        $skipped = 0;

        $hardDeadline = microtime(true) + 110.0; /* ~110s budget; XAMPP default max_execution_time = 30s, callers usually raise this */
        @set_time_limit(120);

        $mh = curl_multi_init();
        $batches = array_chunk($tilesToFetch, 8);
        foreach ($batches as $batch) {
            if (microtime(true) > $hardDeadline) { break; }
            $this->isCancelled($logId) and $batch = [];
            $handles = [];
            foreach ($batch as $t) {
                /* If we already have it, skip. */
                if ($mb->getTileXYZ($t[0], $t[1], $t[2]) !== null) {
                    $skipped++;
                    continue;
                }
                $url = $this->buildUrl($sourceTmpl, $t[0], $t[1], $t[2]);
                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 20,
                    CURLOPT_CONNECTTIMEOUT => 6,
                    CURLOPT_USERAGENT => 'LibyaPostal/1.0 (offline-sync; admin tool)',
                    CURLOPT_FOLLOWLOCATION => true,
                    CURLOPT_MAXREDIRS => 3,
                ]);
                curl_multi_add_handle($mh, $ch);
                $handles[(int) $ch] = ['ch' => $ch, 't' => $t];
            }
            if (!$handles) { continue; }
            $running = null;
            do {
                curl_multi_exec($mh, $running);
                curl_multi_select($mh, 0.5);
            } while ($running > 0);

            foreach ($handles as $h) {
                $code = (int) curl_getinfo($h['ch'], CURLINFO_HTTP_CODE);
                $body = (string) curl_multi_getcontent($h['ch']);
                if ($code === 200 && strlen($body) > 64) {
                    $mb->putTileXYZ($h['t'][0], $h['t'][1], $h['t'][2], $body);
                    $downloaded++;
                } else {
                    $failed++;
                }
                curl_multi_remove_handle($mh, $h['ch']);
                curl_close($h['ch']);
            }
            $this->updateLogProgress($logId, $downloaded, $failed);
        }
        curl_multi_close($mh);

        $status = $this->isCancelled($logId) ? 'cancelled' : 'done';
        $this->finalizeLog($logId, $downloaded, $failed, $status);

        echo json_encode([
            'ok'               => true,
            'tiles_requested'  => $total,
            'tiles_downloaded' => $downloaded,
            'tiles_skipped'    => $skipped,
            'tiles_failed'     => $failed,
            'status'           => $status,
            'log_id'           => $logId,
        ], JSON_UNESCAPED_UNICODE);
    }

    public function status(): void
    {
        $this->requireAnyRole(['admin']);
        header('Content-Type: application/json; charset=utf-8');
        $stats = ['tiles' => 0, 'zooms' => [], 'size_bytes' => 0];
        if (MBTilesService::isAvailable()) {
            try { $stats = (new MBTilesService())->stats(); } catch (\Throwable) {}
        }
        echo json_encode([
            'ok'    => true,
            'stats' => $stats,
            'logs'  => $this->recentLogs(20),
        ], JSON_UNESCAPED_UNICODE);
    }

    public function cancel(): void
    {
        $this->requireAnyRole(['admin']);
        header('Content-Type: application/json; charset=utf-8');
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            http_response_code(405);
            echo json_encode(['ok' => false, 'message' => 'POST required.']);
            return;
        }
        if (!Csrf::validate($_POST['csrf_token'] ?? null)) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'message' => 'CSRF.']);
            return;
        }
        $pdo = Database::getInstance()->getPdo();
        $pdo->exec("UPDATE tile_sync_log SET status = 'cancelled', finished_at = NOW() WHERE status = 'running'");
        echo json_encode(['ok' => true]);
    }

    /* -------------------------------------------------------------------- */

    private function resolveSourceTemplate(string $source): string
    {
        return match ($source) {
            'osm'       => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            'osm-de'    => 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
            'esri-sat'  => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            default     => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        };
    }

    private function buildUrl(string $tmpl, int $z, int $x, int $y): string
    {
        return strtr($tmpl, ['{z}' => (string) $z, '{x}' => (string) $x, '{y}' => (string) $y]);
    }

    /**
     * Convert a bbox + zoom range into XYZ tile coordinates.
     *
     * @return list<array{0:int,1:int,2:int}> array of [z, x, y]
     */
    private function enumerateTiles(float $south, float $west, float $north, float $east, int $zmin, int $zmax, int $cap): array
    {
        $tiles = [];
        for ($z = $zmin; $z <= $zmax; $z++) {
            $n = (1 << $z);
            $xMin = (int) floor(($west + 180) / 360 * $n);
            $xMax = (int) floor(($east + 180) / 360 * $n);
            $latNorthRad = deg2rad($north);
            $latSouthRad = deg2rad($south);
            $yMin = (int) floor((1 - log(tan($latNorthRad) + 1 / cos($latNorthRad)) / M_PI) / 2 * $n);
            $yMax = (int) floor((1 - log(tan($latSouthRad) + 1 / cos($latSouthRad)) / M_PI) / 2 * $n);
            for ($x = max(0, $xMin); $x <= min($n - 1, $xMax); $x++) {
                for ($y = max(0, $yMin); $y <= min($n - 1, $yMax); $y++) {
                    $tiles[] = [$z, $x, $y];
                    if (count($tiles) >= $cap) { return $tiles; }
                }
            }
        }
        return $tiles;
    }

    private function startLog(int $zmin, int $zmax, array $bbox, string $source, int $requested): int
    {
        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare(
            'INSERT INTO tile_sync_log (zmin, zmax, bbox_json, source, status, tiles_requested, created_by)
             VALUES (:zmin, :zmax, :bb, :src, "running", :req, :uid)'
        );
        $st->execute([
            'zmin' => $zmin,
            'zmax' => $zmax,
            'bb'   => json_encode($bbox, JSON_UNESCAPED_UNICODE),
            'src'  => $source,
            'req'  => $requested,
            'uid'  => SessionAuth::userId() ?: null,
        ]);
        return (int) $pdo->lastInsertId();
    }

    private function updateLogProgress(int $id, int $downloaded, int $failed): void
    {
        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare(
            'UPDATE tile_sync_log SET tiles_downloaded = :d, tiles_failed = :f WHERE id = :id'
        );
        $st->execute(['d' => $downloaded, 'f' => $failed, 'id' => $id]);
    }

    private function finalizeLog(int $id, int $downloaded, int $failed, string $status): void
    {
        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare(
            'UPDATE tile_sync_log SET tiles_downloaded = :d, tiles_failed = :f, status = :s, finished_at = NOW() WHERE id = :id'
        );
        $st->execute(['d' => $downloaded, 'f' => $failed, 's' => $status, 'id' => $id]);
    }

    private function isCancelled(int $id): bool
    {
        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare('SELECT status FROM tile_sync_log WHERE id = :id LIMIT 1');
        $st->execute(['id' => $id]);
        return ((string) $st->fetchColumn()) === 'cancelled';
    }

    /** @return list<array<string,mixed>> */
    private function recentLogs(int $limit): array
    {
        try {
            $pdo = Database::getInstance()->getPdo();
            $st = $pdo->prepare(
                'SELECT id, started_at, finished_at, zmin, zmax, source, status,
                        tiles_requested, tiles_downloaded, tiles_failed
                 FROM tile_sync_log ORDER BY id DESC LIMIT :lim'
            );
            $st->bindValue(':lim', $limit, PDO::PARAM_INT);
            $st->execute();
            $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable) {
            return [];
        }
        return $rows;
    }
}
