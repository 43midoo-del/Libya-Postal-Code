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
