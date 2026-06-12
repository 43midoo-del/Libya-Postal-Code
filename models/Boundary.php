<?php
/**
 * Boundary store: one (level, entity_id) → geojson Polygon/MultiPolygon.
 *  level in (state, region, city, area, street)
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use PDO;
use RuntimeException;

final class Boundary
{
    public const LEVELS = ['state', 'region', 'city', 'area', 'street'];

    /** @return array<int, array{id:int, entity_id:int, geojson:string, code:?string, color:?string, updated_at:string}> */
    public static function listByLevel(string $level): array
    {
        if (!in_array($level, self::LEVELS, true)) {
            return [];
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare(
            'SELECT id, entity_id, geojson, code, color, updated_at
             FROM boundaries WHERE level = :lvl ORDER BY entity_id ASC'
        );
        $st->execute(['lvl' => $level]);
        $out = [];
        while (($r = $st->fetch(PDO::FETCH_ASSOC)) !== false) {
            $out[] = [
                'id'         => (int) $r['id'],
                'entity_id'  => (int) $r['entity_id'],
                'geojson'    => (string) $r['geojson'],
                'code'       => $r['code'] !== null ? (string) $r['code'] : null,
                'color'      => $r['color'] !== null ? (string) $r['color'] : null,
                'updated_at' => (string) $r['updated_at'],
            ];
        }
        return $out;
    }

    /** @return array{id:int, level:string, entity_id:int, geojson:string, code:?string, color:?string}|null */
    public static function find(string $level, int $entityId): ?array
    {
        if (!in_array($level, self::LEVELS, true) || $entityId < 1) {
            return null;
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare(
            'SELECT id, level, entity_id, geojson, code, color
             FROM boundaries WHERE level = :lvl AND entity_id = :id LIMIT 1'
        );
        $st->execute(['lvl' => $level, 'id' => $entityId]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if ($r === false) {
            return null;
        }
        return [
            'id'        => (int) $r['id'],
            'level'     => (string) $r['level'],
            'entity_id' => (int) $r['entity_id'],
            'geojson'   => (string) $r['geojson'],
            'code'      => $r['code'] !== null ? (string) $r['code'] : null,
            'color'     => $r['color'] !== null ? (string) $r['color'] : null,
        ];
    }

    public static function save(
        string $level,
        int $entityId,
        string $geojson,
        ?string $code,
        ?string $color,
        ?int $updatedBy
    ): void {
        if (!in_array($level, self::LEVELS, true)) {
            throw new RuntimeException('Boundary level غير صالح.');
        }
        if ($entityId < 1) {
            throw new RuntimeException('معرّف الكيان غير صالح.');
        }
        $decoded = json_decode($geojson, true);
        if (!is_array($decoded) || !isset($decoded['type'])) {
            throw new RuntimeException('GeoJSON غير صالح.');
        }
        $type = (string) $decoded['type'];
        if (!in_array($type, ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString', 'Feature'], true)) {
            throw new RuntimeException('نوع GeoJSON غير مدعوم (Polygon / MultiPolygon / LineString فقط).');
        }
        $code = $code !== null ? trim($code) : null;
        if ($code !== null && $code !== '' && !preg_match('/^[A-Za-z0-9]{1,8}$/', $code)) {
            throw new RuntimeException('الرمز يجب أن يكون 1–8 خانات أبجدرقمية.');
        }
        if ($code === '') { $code = null; }
        $color = $color !== null ? trim($color) : null;
        if ($color !== null && $color !== '' && !preg_match('/^#?[0-9A-Fa-f]{3,8}$/', $color)) {
            $color = null;
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare(
            'INSERT INTO boundaries (level, entity_id, geojson, code, color, updated_by)
             VALUES (:lvl, :eid, :gj, :code, :color, :uid)
             ON DUPLICATE KEY UPDATE
               geojson    = VALUES(geojson),
               code       = VALUES(code),
               color      = VALUES(color),
               updated_by = VALUES(updated_by)'
        );
        $st->execute([
            'lvl'   => $level,
            'eid'   => $entityId,
            'gj'    => $geojson,
            'code'  => $code,
            'color' => $color,
            'uid'   => $updatedBy,
        ]);
    }

    public static function delete(string $level, int $entityId): void
    {
        if (!in_array($level, self::LEVELS, true)) {
            throw new RuntimeException('Boundary level غير صالح.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('DELETE FROM boundaries WHERE level = :lvl AND entity_id = :id');
        $st->execute(['lvl' => $level, 'id' => $entityId]);
    }

    /** @return array<string, string> Letter B/T/F → #hex */
    public static function defaultProvinceColors(): array
    {
        $path = dirname(__DIR__) . '/config/province_colors.php';
        if (!is_file($path)) {
            return ['B' => '#ef4444', 'T' => '#22c55e', 'F' => '#cbd5e1'];
        }
        $cfg = require $path;

        return is_array($cfg) ? $cfg : ['B' => '#ef4444', 'T' => '#22c55e', 'F' => '#cbd5e1'];
    }

    public static function normalizeColor(?string $color): ?string
    {
        if ($color === null) {
            return null;
        }
        $color = trim($color);
        if ($color === '' || !preg_match('/^#?[0-9A-Fa-f]{3,8}$/', $color)) {
            return null;
        }
        if ($color[0] !== '#') {
            $color = '#' . $color;
        }

        return strtolower($color);
    }

    /** @return array<string, string> */
    public static function provinceColors(): array
    {
        $out = self::defaultProvinceColors();
        try {
            $pdo = Database::getInstance()->getPdo();
            $rows = $pdo->query('SELECT code, color FROM states ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as $row) {
                $letter = strtoupper(trim((string) ($row['code'] ?? '')));
                $c = self::normalizeColor(isset($row['color']) ? (string) $row['color'] : null);
                if ($letter !== '' && $c !== null) {
                    $out[$letter] = $c;
                }
            }
        } catch (\Throwable $e) {
            // Column may not exist yet — defaults only.
        }

        return $out;
    }

    /** Persist wilayah color and propagate to all shabiyat boundaries in that state. */
    public static function setProvinceColor(int $stateId, string $color): void
    {
        $color = self::normalizeColor($color);
        if ($color === null || $stateId < 1) {
            return;
        }
        $pdo = Database::getInstance()->getPdo();
        $pdo->prepare('UPDATE states SET color = :c WHERE id = :id')
            ->execute(['c' => $color, 'id' => $stateId]);
        $pdo->prepare('UPDATE boundaries SET color = :c WHERE level = "state" AND entity_id = :id')
            ->execute(['c' => $color, 'id' => $stateId]);
        $pdo->prepare(
            'UPDATE boundaries b
             INNER JOIN regions r ON b.level = "region" AND b.entity_id = r.id
             SET b.color = :c
             WHERE r.state_id = :sid'
        )->execute(['c' => $color, 'sid' => $stateId]);
    }

    public static function colorForProvinceLetter(string $letter): string
    {
        $letter = strtoupper(trim($letter));
        $all    = self::provinceColors();

        return $all[$letter] ?? '#94a3b8';
    }

    /** Persist color (and optional code) without replacing GeoJSON geometry. */
    public static function saveMeta(
        string $level,
        int $entityId,
        ?string $code,
        ?string $color,
        ?int $updatedBy
    ): void {
        if (!in_array($level, self::LEVELS, true) || $entityId < 1) {
            throw new RuntimeException('Boundary level أو معرّف غير صالح.');
        }
        $color = self::normalizeColor($color);
        $code  = $code !== null ? trim($code) : null;
        if ($code !== null && $code !== '' && !preg_match('/^[A-Za-z0-9]{1,8}$/', $code)) {
            throw new RuntimeException('الرمز يجب أن يكون 1–8 خانات أبجدرقمية.');
        }
        if ($code === '') {
            $code = null;
        }

        $pdo = Database::getInstance()->getPdo();

        if ($level === 'state') {
            if ($color !== null) {
                self::setProvinceColor($entityId, $color);
            }
            $existing = self::find('state', $entityId);
            if ($existing !== null) {
                $pdo->prepare(
                    'UPDATE boundaries
                     SET color = COALESCE(:color, color),
                         code  = COALESCE(:code, code),
                         updated_by = :uid
                     WHERE level = "state" AND entity_id = :id'
                )->execute([
                    'color' => $color,
                    'code'  => $code,
                    'uid'   => $updatedBy,
                    'id'    => $entityId,
                ]);
            }

            return;
        }

        $existing = self::find($level, $entityId);
        if ($existing === null) {
            throw new RuntimeException(
                'لا توجد حدود محفوظة لهذا الكيان — ارسم المضلع ثم احفظ، أو غيّر لون الولاية من تبويب «ولاية».'
            );
        }
        $pdo->prepare(
            'UPDATE boundaries
             SET color = COALESCE(:color, color),
                 code  = COALESCE(:code, code),
                 updated_by = :uid
             WHERE level = :lvl AND entity_id = :id'
        )->execute([
            'color' => $color,
            'code'  => $code,
            'uid'   => $updatedBy,
            'lvl'   => $level,
            'id'    => $entityId,
        ]);
    }

    /**
     * Build a FeatureCollection joining boundaries to their parent entity metadata.
     *
     * @return array{type:string, features:list<array<string,mixed>>}
     */
    public static function asFeatureCollection(string $level, ?int $parentId = null): array
    {
        $features = [];
        $pdo = Database::getInstance()->getPdo();
        $sql = '';
        $params = [];
        switch ($level) {
            case 'state':
                $sql = 'SELECT b.id, b.entity_id, b.geojson, b.code, b.color, s.name AS entity_name
                        FROM boundaries b JOIN states s ON s.id = b.entity_id
                        WHERE b.level = "state"';
                break;
            case 'region':
                $sql = 'SELECT b.id, b.entity_id, b.geojson, b.code, b.color, r.name AS entity_name, r.state_id AS parent_id
                        FROM boundaries b JOIN regions r ON r.id = b.entity_id
                        WHERE b.level = "region"';
                if ($parentId !== null) { $sql .= ' AND r.state_id = :pid'; $params['pid'] = $parentId; }
                break;
            case 'city':
                $sql = 'SELECT b.id, b.entity_id, b.geojson, b.code, b.color, c.name AS entity_name, c.region_id AS parent_id
                        FROM boundaries b JOIN cities c ON c.id = b.entity_id
                        WHERE b.level = "city"';
                if ($parentId !== null) { $sql .= ' AND c.region_id = :pid'; $params['pid'] = $parentId; }
                break;
            case 'area':
                $sql = 'SELECT b.id, b.entity_id, b.geojson, b.code, b.color, a.name AS entity_name, a.city_id AS parent_id, a.kind
                        FROM boundaries b JOIN areas a ON a.id = b.entity_id
                        WHERE b.level = "area"';
                if ($parentId !== null) { $sql .= ' AND a.city_id = :pid'; $params['pid'] = $parentId; }
                break;
            case 'street':
                $sql = 'SELECT b.id, b.entity_id, b.geojson, b.code, b.color, st.name AS entity_name, st.area_id AS parent_id
                        FROM boundaries b JOIN streets st ON st.id = b.entity_id
                        WHERE b.level = "street"';
                if ($parentId !== null) { $sql .= ' AND st.area_id = :pid'; $params['pid'] = $parentId; }
                break;
        }
        if ($sql === '') {
            return ['type' => 'FeatureCollection', 'features' => []];
        }
        $st = $pdo->prepare($sql);
        $st->execute($params);
        while (($r = $st->fetch(PDO::FETCH_ASSOC)) !== false) {
            $geom = json_decode((string) $r['geojson'], true);
            /* Accept either a bare geometry or a wrapping Feature */
            if (is_array($geom) && ($geom['type'] ?? '') === 'Feature') {
                $geom = $geom['geometry'] ?? null;
            }
            if (!is_array($geom)) { continue; }
            $props = [
                'id'        => (int) $r['id'],
                'entity_id' => (int) $r['entity_id'],
                'name'      => (string) ($r['entity_name'] ?? ''),
                'code'      => $r['code'] !== null ? (string) $r['code'] : null,
                'color'     => $r['color'] !== null ? (string) $r['color'] : null,
                'level'     => $level,
            ];
            if (isset($r['parent_id'])) { $props['parent_id'] = (int) $r['parent_id']; }
            if (isset($r['kind']))      { $props['kind']      = (string) $r['kind']; }
            $features[] = [
                'type'       => 'Feature',
                'properties' => $props,
                'geometry'   => $geom,
            ];
        }
        return ['type' => 'FeatureCollection', 'features' => $features];
    }
}
