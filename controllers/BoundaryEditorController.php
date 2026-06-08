<?php
/**
 * Admin Boundary Editor:
 *   - GET ?r=boundary_editor          → editor UI
 *   - GET ?r=boundary_list             &level=&parent_id=
 *   - GET ?r=boundary_entities         &level=&parent_id=     (drop-down feed)
 *   - POST ?r=boundary_save            (CSRF) — upsert (level, entity_id) → geojson
 *   - POST ?r=boundary_delete          (CSRF)
 *   - POST ?r=boundary_entity_create   (CSRF) — create new (region|city|area|street) under a parent
 *   - POST ?r=boundary_entity_add_grid (CSRF) — create area|street + grid cell at map click
 *   - GET  ?r=boundary_export          &level=    → writes data/libya-{level}s.geojson
 */
declare(strict_types=1);

namespace App\Controllers;

use App\CityGrid;
use App\Csrf;
use App\Database;
use App\Flash;
use App\GeoBounds;
use App\GeoPoint;
use App\Models\Area;
use App\Models\Boundary;
use App\Models\City;
use App\Models\Region;
use App\Models\State;
use App\Models\ShabiyaCity;
use App\Models\Street;
use App\SessionAuth;
use PDO;
use RuntimeException;

final class BoundaryEditorController extends BaseController
{
    public function index(): void
    {
        $this->requireAnyRole(['admin', 'employee']);
        $map = require dirname(__DIR__) . '/config/map.php';
        $this->render('admin/boundary/index.php', [
            'title'          => 'محرر الحدود الجغرافية',
            'navCurrent'     => 'boundary_editor',
            'userName'       => SessionAuth::userName(),
            'userRole'       => SessionAuth::userRole(),
            'csrf'           => Csrf::getToken(),
            'flash'          => Flash::getAndClear(),
            'bounds'         => $map['libya_bounds'],
            'center'         => $map['default_center'],
            'zoom'           => (int) $map['default_zoom'],
            'minZoom'        => (int) $map['min_zoom'],
            'maxZoom'        => (int) $map['max_zoom'],
            'appShellClass'  => 'app-shell--wide',
        ]);
    }

    /**
     * Boot map: 3 state envelopes + 22 shabiyat polygons with DB entity ids.
     */
    public function apiOverview(): void
    {
        $this->requireApiAnyRole(['admin', 'employee']);
        header('Content-Type: application/json; charset=utf-8');

        $pdo = Database::getInstance()->getPdo();
        /** @var array<string, array{id:int,name:string,code:string}> $statesByLetter */
        $statesByLetter = [];
        foreach ($pdo->query('SELECT id, name, code FROM states ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $letter = strtoupper(trim((string) ($row['code'] ?? '')));
            if ($letter !== '') {
                $statesByLetter[$letter] = $row;
            }
        }

        /** @var array<int, array{id:int,name:string,state_id:int,code:?string}> $regionsById */
        $regionsById = [];
        foreach ($pdo->query('SELECT id, name, state_id, code FROM regions ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $regionsById[(int) $row['id']] = $row;
        }

        $path = dirname(__DIR__) . '/data/libya-shabiyat.geojson';
        if (!is_file($path)) {
            echo json_encode(['ok' => false, 'message' => 'ملف الشعبيات غير موجود.'], JSON_UNESCAPED_UNICODE);

            return;
        }
        $geo = json_decode((string) file_get_contents($path), true);
        if (!is_array($geo) || ($geo['type'] ?? '') !== 'FeatureCollection') {
            echo json_encode(['ok' => false, 'message' => 'GeoJSON الشعبيات غير صالح.'], JSON_UNESCAPED_UNICODE);

            return;
        }

        /** @var array<string, list<list<list<float>>>> $provincePolys */
        $provincePolys = ['B' => [], 'T' => [], 'F' => []];
        $regionFeatures = [];

        foreach ($geo['features'] as $feature) {
            if (!is_array($feature)) {
                continue;
            }
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            $n = (int) ($props['n'] ?? 0);
            $prov = strtoupper(trim((string) ($props['province'] ?? '')));
            $regionRow = $regionsById[$n] ?? $regionsById[(int) ($props['n'] ?? 0)] ?? null;
            $entityId = $regionRow !== null ? (int) $regionRow['id'] : $n;
            $stateId = $regionRow !== null ? (int) $regionRow['state_id'] : (int) ($statesByLetter[$prov]['id'] ?? 0);
            $geom = $feature['geometry'] ?? null;
            if (is_array($geom)) {
                $gType = (string) ($geom['type'] ?? '');
                $coords = $geom['coordinates'] ?? null;
                if ($prov !== '' && isset($provincePolys[$prov]) && is_array($coords)) {
                    if ($gType === 'Polygon') {
                        $provincePolys[$prov][] = $coords;
                    } elseif ($gType === 'MultiPolygon') {
                        foreach ($coords as $poly) {
                            if (is_array($poly)) {
                                $provincePolys[$prov][] = $poly;
                            }
                        }
                    }
                }
            }

            $regionFeatures[] = [
                'type'       => 'Feature',
                'properties' => [
                    'entity_id' => $entityId,
                    'level'     => 'region',
                    'parent_id' => $stateId > 0 ? $stateId : null,
                    'name'      => (string) ($regionRow['name'] ?? $props['name'] ?? ''),
                    'code'      => (string) ($props['code'] ?? $regionRow['code'] ?? ''),
                    'province'  => $prov,
                    'n'         => $n,
                ],
                'geometry'   => $geom,
            ];
        }

        $stateFeatures = [];
        foreach (['B', 'T', 'F'] as $letter) {
            $st = $statesByLetter[$letter] ?? null;
            if ($st === null) {
                continue;
            }
            $stId = (int) $st['id'];
            $saved = Boundary::find('state', $stId);
            if ($saved !== null) {
                $geom = json_decode($saved['geojson'], true);
                if (is_array($geom) && ($geom['type'] ?? '') === 'Feature') {
                    $geom = $geom['geometry'] ?? null;
                }
            } else {
                $polys = $provincePolys[$letter] ?? [];
                $geom = $polys === [] ? null : ['type' => 'MultiPolygon', 'coordinates' => $polys];
            }
            if (!is_array($geom)) {
                continue;
            }
            $stateFeatures[] = [
                'type'       => 'Feature',
                'properties' => [
                    'entity_id' => $stId,
                    'level'     => 'state',
                    'name'      => (string) $st['name'],
                    'code'      => $letter,
                    'province'  => $letter,
                    'color'     => $saved['color'] ?? null,
                ],
                'geometry'   => $geom,
            ];
        }

        echo json_encode([
            'ok'      => true,
            'states'  => ['type' => 'FeatureCollection', 'features' => $stateFeatures],
            'regions' => ['type' => 'FeatureCollection', 'features' => $regionFeatures],
        ], JSON_UNESCAPED_UNICODE);
    }

    /**
     * Center / bounds for map zoom when an entity is picked (with or without saved boundary).
     */
    public function apiEntityLoc(): void
    {
        $this->requireApiAnyRole(['admin', 'employee']);
        header('Content-Type: application/json; charset=utf-8');
        $level = (string) ($_GET['level'] ?? '');
        $entityId = (int) ($_GET['entity_id'] ?? 0);
        if (!in_array($level, Boundary::LEVELS, true) || $entityId < 1) {
            echo json_encode(['ok' => false, 'message' => 'معاملات غير صالحة.'], JSON_UNESCAPED_UNICODE);

            return;
        }
        $loc = $this->resolveEntityLocation($level, $entityId);
        if ($loc === null) {
            echo json_encode(['ok' => false, 'message' => 'لا توجد إحداثيات لهذا الكيان.'], JSON_UNESCAPED_UNICODE);

            return;
        }
        echo json_encode(['ok' => true] + $loc, JSON_UNESCAPED_UNICODE);
    }

    public function apiList(): void
    {
        $this->requireApiAnyRole(['admin', 'employee']);
        header('Content-Type: application/json; charset=utf-8');
        $level = (string) ($_GET['level'] ?? 'region');
        $parentId = isset($_GET['parent_id']) && $_GET['parent_id'] !== '' ? (int) $_GET['parent_id'] : null;
        $fc = Boundary::asFeatureCollection($level, $parentId);
        if ($level === 'state' && empty($fc['features'])) {
            $fc = $this->stateGeoJsonFallback();
        }
        if ($level === 'region' && empty($fc['features'])) {
            $fc = $this->regionGeoJsonFallback($parentId);
        }
        if ($level === 'city' && $parentId !== null) {
            $fc = $this->cityListWithGrid($parentId);
        }
        if ($level === 'area' && $parentId !== null) {
            $fc = $this->areaListWithGrid($parentId);
        }
        if ($level === 'street' && $parentId !== null) {
            $fc = $this->streetListWithGrid($parentId);
        }
        echo json_encode($fc, JSON_UNESCAPED_UNICODE);
    }

    /** @return array{type:string, features:list<array<string,mixed>>} */
    private function stateGeoJsonFallback(): array
    {
        $pdo = Database::getInstance()->getPdo();
        /** @var array<string, array{id:int,name:string,code:string}> $statesByLetter */
        $statesByLetter = [];
        foreach ($pdo->query('SELECT id, name, code FROM states ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $letter = strtoupper(trim((string) ($row['code'] ?? '')));
            if ($letter !== '') {
                $statesByLetter[$letter] = $row;
            }
        }
        $path = dirname(__DIR__) . '/data/libya-shabiyat.geojson';
        if (!is_file($path)) {
            return ['type' => 'FeatureCollection', 'features' => []];
        }
        $geo = json_decode((string) file_get_contents($path), true);
        if (!is_array($geo) || ($geo['type'] ?? '') !== 'FeatureCollection') {
            return ['type' => 'FeatureCollection', 'features' => []];
        }
        /** @var array<string, list<list<list<float>>>> $provincePolys */
        $provincePolys = ['B' => [], 'T' => [], 'F' => []];
        foreach ($geo['features'] as $feature) {
            if (!is_array($feature)) {
                continue;
            }
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            $prov = strtoupper(trim((string) ($props['province'] ?? '')));
            $geom = $feature['geometry'] ?? null;
            if (!is_array($geom) || $prov === '' || !isset($provincePolys[$prov])) {
                continue;
            }
            $gType = (string) ($geom['type'] ?? '');
            $coords = $geom['coordinates'] ?? null;
            if (!is_array($coords)) {
                continue;
            }
            if ($gType === 'Polygon') {
                $provincePolys[$prov][] = $coords;
            } elseif ($gType === 'MultiPolygon') {
                foreach ($coords as $poly) {
                    if (is_array($poly)) {
                        $provincePolys[$prov][] = $poly;
                    }
                }
            }
        }
        $features = [];
        foreach (['B', 'T', 'F'] as $letter) {
            $st = $statesByLetter[$letter] ?? null;
            if ($st === null) {
                continue;
            }
            $saved = Boundary::find('state', (int) $st['id']);
            if ($saved !== null) {
                $geom = json_decode($saved['geojson'], true);
                if (is_array($geom) && ($geom['type'] ?? '') === 'Feature') {
                    $geom = $geom['geometry'] ?? null;
                }
            } else {
                $polys = $provincePolys[$letter] ?? [];
                $geom = $polys === [] ? null : ['type' => 'MultiPolygon', 'coordinates' => $polys];
            }
            if (!is_array($geom)) {
                continue;
            }
            $features[] = [
                'type'       => 'Feature',
                'properties' => [
                    'entity_id' => (int) $st['id'],
                    'level'     => 'state',
                    'name'      => (string) $st['name'],
                    'code'      => $letter,
                    'province'  => $letter,
                    'color'     => $saved['color'] ?? null,
                ],
                'geometry'   => $geom,
            ];
        }

        return ['type' => 'FeatureCollection', 'features' => $features];
    }

    /** @return array{type:string, features:list<array<string,mixed>>} */
    private function regionGeoJsonFallback(?int $parentId): array
    {
        $path = dirname(__DIR__) . '/data/libya-shabiyat.geojson';
        if (!is_file($path)) {
            return ['type' => 'FeatureCollection', 'features' => []];
        }
        $raw = json_decode((string) file_get_contents($path), true);
        if (!is_array($raw) || ($raw['type'] ?? '') !== 'FeatureCollection') {
            return ['type' => 'FeatureCollection', 'features' => []];
        }
        $pdo = Database::getInstance()->getPdo();
        /** @var array<int, array{id:int,name:string,code:?string}> $regionsByN */
        $regionsByN = [];
        foreach ($pdo->query('SELECT id, name, code FROM regions ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $regionsByN[(int) $row['id']] = $row;
        }
        $stateLetter = null;
        if ($parentId !== null) {
            $st = $pdo->prepare('SELECT code FROM states WHERE id = :id LIMIT 1');
            $st->execute(['id' => $parentId]);
            $stateLetter = strtoupper(trim((string) ($st->fetchColumn() ?: '')));
        }
        $features = [];
        foreach ($raw['features'] as $feature) {
            if (!is_array($feature)) {
                continue;
            }
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            if ($stateLetter !== null && strtoupper((string) ($props['province'] ?? '')) !== $stateLetter) {
                continue;
            }
            $n = (int) ($props['n'] ?? 0);
            $regionRow = $regionsByN[$n] ?? null;
            $entityId = $regionRow !== null ? (int) $regionRow['id'] : $n;
            $features[] = [
                'type'       => 'Feature',
                'properties' => [
                    'entity_id' => $entityId,
                    'level'     => 'region',
                    'name'      => (string) ($regionRow['name'] ?? $props['name'] ?? ''),
                    'code'      => (string) ($props['code'] ?? $regionRow['code'] ?? ''),
                    'province'  => (string) ($props['province'] ?? ''),
                ],
                'geometry'   => $feature['geometry'] ?? null,
            ];
        }

        return ['type' => 'FeatureCollection', 'features' => $features];
    }

    /** @return array{type:string, features:list<array<string,mixed>>} */
    private function cityListWithGrid(int $regionId): array
    {
        $saved = Boundary::asFeatureCollection('city', $regionId);
        $grid = $this->cityGridFallback($regionId);
        $gridById = [];
        foreach ($grid['features'] as $feature) {
            $gridById[(int) ($feature['properties']['entity_id'] ?? 0)] = $feature;
        }

        $out = [];
        $used = [];
        foreach ($saved['features'] as $feature) {
            $eid = (int) ($feature['properties']['entity_id'] ?? 0);
            $geom = is_array($feature['geometry'] ?? null) ? $feature['geometry'] : null;
            if ($geom !== null && $this->geometrySpanTooLarge('city', $geom)) {
                if ($eid > 0 && isset($gridById[$eid])) {
                    $out[] = $gridById[$eid];
                    $used[$eid] = true;
                }
                continue;
            }
            if ($eid > 0) {
                $used[$eid] = true;
            }
            $out[] = $feature;
        }
        foreach ($grid['features'] as $feature) {
            $eid = (int) ($feature['properties']['entity_id'] ?? 0);
            if ($eid > 0 && !isset($used[$eid])) {
                $out[] = $feature;
            }
        }

        return ['type' => 'FeatureCollection', 'features' => $out];
    }

    /** @return array{type:string, features:list<array<string,mixed>>} */
    private function areaListWithGrid(int $cityId): array
    {
        $saved = Boundary::asFeatureCollection('area', $cityId);
        $savedIds = [];
        foreach ($saved['features'] as $feature) {
            $savedIds[(int) ($feature['properties']['entity_id'] ?? 0)] = true;
        }
        foreach ($this->areaGridFallback($cityId)['features'] as $feature) {
            $eid = (int) ($feature['properties']['entity_id'] ?? 0);
            if ($eid > 0 && !isset($savedIds[$eid])) {
                $saved['features'][] = $feature;
            }
        }

        return $saved;
    }

    /** @return array{type:string, features:list<array<string,mixed>>} */
    private function streetListWithGrid(int $areaId): array
    {
        $saved = Boundary::asFeatureCollection('street', $areaId);
        $savedIds = [];
        foreach ($saved['features'] as $feature) {
            $savedIds[(int) ($feature['properties']['entity_id'] ?? 0)] = true;
        }
        foreach ($this->streetGridFallback($areaId)['features'] as $feature) {
            $eid = (int) ($feature['properties']['entity_id'] ?? 0);
            if ($eid > 0 && !isset($savedIds[$eid])) {
                $saved['features'][] = $feature;
            }
        }

        return $saved;
    }

    /** @return array{type:string, features:list<array<string,mixed>>} */
    private function streetGridFallback(int $areaId): array
    {
        $points = $this->collectStreetSeedPoints($areaId);
        if ($points === []) {
            return ['type' => 'FeatureCollection', 'features' => []];
        }
        $areaPolys = $this->areaBoundaryPolygons($areaId);
        if ($areaPolys === null || $areaPolys === []) {
            return ['type' => 'FeatureCollection', 'features' => []];
        }

        return [
            'type'     => 'FeatureCollection',
            'features' => CityGrid::buildFeatures($areaPolys, $points, [
                'level'     => 'street',
                'parent_id' => $areaId,
            ]),
        ];
    }

    /**
     * @return array{id:int,message:string,feature:array<string,mixed>,hierarchy:array<string,array{id:int,name:string,code?:?string}>}>
     */
    private function createAreaWithGrid(
        int $cityId,
        string $name,
        ?string $code,
        ?string $color,
        float $lat,
        float $lng
    ): array {
        $pdo = Database::getInstance()->getPdo();
        $cityPolys = $this->cityBoundaryPolygons($cityId);
        if ($cityPolys === null || $cityPolys === []) {
            throw new RuntimeException('لا توجد حدود للمدينة الأب — ارسم حدود المدينة أولاً.');
        }
        if (!$this->pointInsidePolygonSets($lat, $lng, $cityPolys)) {
            throw new RuntimeException('النقطة خارج حدود المدينة المختارة.');
        }

        $newId = Area::createWithCoords($name, $cityId, $lat, $lng, $code);
        $siblings = $this->collectAreaSeedPoints($cityId, $newId);
        $point = ['entity_id' => $newId, 'name' => $name, 'lat' => $lat, 'lng' => $lng];
        $feature = CityGrid::buildSingleCell($cityPolys, $point, $siblings, [
            'level'     => 'area',
            'parent_id' => $cityId,
        ]);
        if ($feature === null) {
            Area::delete($newId);
            throw new RuntimeException('تعذّر توليد خلية الشبكة لهذا الموقع.');
        }

        $geom = $feature['geometry'] ?? null;
        if (!is_array($geom)) {
            Area::delete($newId);
            throw new RuntimeException('هندسة الشبكة غير صالحة.');
        }
        Boundary::save('area', $newId, json_encode($geom, JSON_UNESCAPED_UNICODE), $code, $color, SessionAuth::userId());
        $feature['properties']['is_grid'] = false;
        $feature['properties']['entity_id'] = $newId;
        $feature['properties']['level'] = 'area';
        $feature['properties']['parent_id'] = $cityId;
        $feature['properties']['name'] = $name;
        if ($code !== null && $code !== '') {
            $feature['properties']['code'] = $code;
        }

        return [
            'id'         => $newId,
            'message'    => 'أُضيف الحي وحُفظت شبكته.',
            'feature'    => $feature,
            'hierarchy'  => $this->resolveHierarchyForArea($pdo, $newId),
        ];
    }

    /**
     * @return array{id:int,message:string,feature:array<string,mixed>,hierarchy:array<string,array{id:int,name:string,code?:?string}>}>
     */
    private function createStreetWithGrid(
        int $areaId,
        string $name,
        ?string $code,
        ?string $color,
        float $lat,
        float $lng
    ): array {
        $pdo = Database::getInstance()->getPdo();
        $areaPolys = $this->areaBoundaryPolygons($areaId);
        if ($areaPolys === null || $areaPolys === []) {
            throw new RuntimeException('لا توجد حدود للحي الأب — ارسم حدود الحي أولاً.');
        }
        if (!$this->pointInsidePolygonSets($lat, $lng, $areaPolys)) {
            throw new RuntimeException('النقطة خارج حدود الحي المختار.');
        }

        $newId = Street::create($name, $areaId, $code, SessionAuth::userId());
        $siblings = $this->collectStreetSeedPoints($areaId, $newId);
        $point = ['entity_id' => $newId, 'name' => $name, 'lat' => $lat, 'lng' => $lng];
        $feature = CityGrid::buildSingleCell($areaPolys, $point, $siblings, [
            'level'     => 'street',
            'parent_id' => $areaId,
        ]);
        if ($feature === null) {
            Street::delete($newId);
            throw new RuntimeException('تعذّر توليد خلية الشبكة لهذا الموقع.');
        }

        $geom = $feature['geometry'] ?? null;
        if (!is_array($geom)) {
            Street::delete($newId);
            throw new RuntimeException('هندسة الشبكة غير صالحة.');
        }
        Boundary::save('street', $newId, json_encode($geom, JSON_UNESCAPED_UNICODE), $code, $color, SessionAuth::userId());
        $feature['properties']['is_grid'] = false;
        $feature['properties']['entity_id'] = $newId;
        $feature['properties']['level'] = 'street';
        $feature['properties']['parent_id'] = $areaId;
        $feature['properties']['name'] = $name;
        if ($code !== null && $code !== '') {
            $feature['properties']['code'] = $code;
        }

        return [
            'id'         => $newId,
            'message'    => 'أُضيف الشارع وحُفظت شبكته.',
            'feature'    => $feature,
            'hierarchy'  => $this->resolveHierarchyForStreet($pdo, $newId),
        ];
    }

    /**
     * @return list<array{entity_id:int,name:string,lat:float,lng:float}>
     */
    private function collectAreaSeedPoints(int $cityId, int $excludeId = 0): array
    {
        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare(
            'SELECT id, name, lat, lng FROM areas WHERE city_id = :cid ORDER BY id ASC'
        );
        $st->execute(['cid' => $cityId]);
        $out = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $id = (int) ($row['id'] ?? 0);
            if ($id < 1 || $id === $excludeId) {
                continue;
            }
            $lat = $row['lat'] !== null ? (float) $row['lat'] : null;
            $lng = $row['lng'] !== null ? (float) $row['lng'] : null;
            if ($lat === null || $lng === null) {
                $cent = $this->boundaryCentroid('area', $id);
                if ($cent === null) {
                    continue;
                }
                $lat = $cent[0];
                $lng = $cent[1];
            }
            $out[] = [
                'entity_id' => $id,
                'name'      => (string) ($row['name'] ?? ''),
                'lat'       => $lat,
                'lng'       => $lng,
            ];
        }

        return $out;
    }

    /**
     * @return list<array{entity_id:int,name:string,lat:float,lng:float}>
     */
    private function collectStreetSeedPoints(int $areaId, int $excludeId = 0): array
    {
        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare('SELECT id, name FROM streets WHERE area_id = :aid ORDER BY id ASC');
        $st->execute(['aid' => $areaId]);
        $out = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $id = (int) ($row['id'] ?? 0);
            if ($id < 1 || $id === $excludeId) {
                continue;
            }
            $cent = $this->boundaryCentroid('street', $id);
            if ($cent === null) {
                continue;
            }
            $out[] = [
                'entity_id' => $id,
                'name'      => (string) ($row['name'] ?? ''),
                'lat'       => $cent[0],
                'lng'       => $cent[1],
            ];
        }

        return $out;
    }

    /**
     * @return array{0:float,1:float}|null [lat, lng]
     */
    private function boundaryCentroid(string $level, int $entityId): ?array
    {
        $saved = Boundary::find($level, $entityId);
        if ($saved === null) {
            return null;
        }
        $geom = json_decode($saved['geojson'], true);
        if (is_array($geom) && ($geom['type'] ?? '') === 'Feature') {
            $geom = $geom['geometry'] ?? null;
        }
        if (!is_array($geom)) {
            return null;
        }
        $box = $this->geometryBounds($geom);
        if ($box === null) {
            return null;
        }

        return [($box[0] + $box[2]) / 2, ($box[1] + $box[3]) / 2];
    }

    /**
     * @return array<int, array<int, array<int, array<int, float>>>>|null
     */
    private function areaBoundaryPolygons(int $areaId): ?array
    {
        $saved = Boundary::find('area', $areaId);
        if ($saved !== null) {
            $geom = json_decode($saved['geojson'], true);
            if (is_array($geom) && ($geom['type'] ?? '') === 'Feature') {
                $geom = $geom['geometry'] ?? null;
            }
            if (is_array($geom)) {
                return $this->geometryToPolygonSets($geom);
            }
        }

        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare('SELECT city_id FROM areas WHERE id = :id LIMIT 1');
        $st->execute(['id' => $areaId]);
        $cityId = (int) ($st->fetchColumn() ?: 0);
        if ($cityId < 1) {
            return null;
        }
        $grid = $this->areaGridFallback($cityId);
        foreach ($grid['features'] as $feature) {
            if (!is_array($feature)) {
                continue;
            }
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            if ((int) ($props['entity_id'] ?? 0) !== $areaId) {
                continue;
            }
            $geom = $feature['geometry'] ?? null;
            if (is_array($geom)) {
                return $this->geometryToPolygonSets($geom);
            }
        }

        return null;
    }

    /**
     * @param array<int, array<int, array<int, array<int, float>>>> $polys
     */
    private function pointInsidePolygonSets(float $lat, float $lng, array $polys): bool
    {
        foreach ($polys as $poly) {
            if (GeoPoint::pointInPolygon($lat, $lng, $poly)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<string, array{id:int,name:string,code?:?string}>
     */
    private function resolveHierarchyForArea(PDO $pdo, int $areaId): array
    {
        $st = $pdo->prepare(
            'SELECT a.id AS area_id, a.name AS area_name, a.code AS area_code,
                    c.id AS city_id, c.name AS city_name, c.code AS city_code,
                    r.id AS region_id, r.name AS region_name, r.code AS region_code,
                    s.id AS state_id, s.name AS state_name, s.code AS state_code
             FROM areas a
             JOIN cities c ON c.id = a.city_id
             JOIN regions r ON r.id = c.region_id
             JOIN states s ON s.id = r.state_id
             WHERE a.id = :id LIMIT 1'
        );
        $st->execute(['id' => $areaId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return [];
        }

        return [
            'state'  => ['id' => (int) $row['state_id'], 'name' => (string) $row['state_name'], 'code' => $row['state_code']],
            'region' => ['id' => (int) $row['region_id'], 'name' => (string) $row['region_name'], 'code' => $row['region_code']],
            'city'   => ['id' => (int) $row['city_id'], 'name' => (string) $row['city_name'], 'code' => $row['city_code']],
            'area'   => ['id' => (int) $row['area_id'], 'name' => (string) $row['area_name'], 'code' => $row['area_code']],
        ];
    }

    /**
     * @return array<string, array{id:int,name:string,code?:?string}>
     */
    private function resolveHierarchyForStreet(PDO $pdo, int $streetId): array
    {
        $st = $pdo->prepare(
            'SELECT st.id AS street_id, st.name AS street_name, st.code AS street_code,
                    a.id AS area_id, a.name AS area_name, a.code AS area_code,
                    c.id AS city_id, c.name AS city_name, c.code AS city_code,
                    r.id AS region_id, r.name AS region_name, r.code AS region_code,
                    s.id AS state_id, s.name AS state_name, s.code AS state_code
             FROM streets st
             JOIN areas a ON a.id = st.area_id
             JOIN cities c ON c.id = a.city_id
             JOIN regions r ON r.id = c.region_id
             JOIN states s ON s.id = r.state_id
             WHERE st.id = :id LIMIT 1'
        );
        $st->execute(['id' => $streetId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return [];
        }

        $hierarchy = $this->resolveHierarchyForArea($pdo, (int) $row['area_id']);
        $hierarchy['street'] = [
            'id'   => (int) $row['street_id'],
            'name' => (string) $row['street_name'],
            'code' => $row['street_code'],
        ];

        return $hierarchy;
    }

    /** @return array{type:string, features:list<array<string,mixed>>} */
    private function cityGridFallback(int $regionId): array
    {
        $points = $this->cityPointsFallback($regionId);
        $features = $points['features'] ?? [];
        if ($features === []) {
            return ['type' => 'FeatureCollection', 'features' => []];
        }

        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare('SELECT id, name, code FROM regions WHERE id = :id LIMIT 1');
        $st->execute(['id' => $regionId]);
        $region = $st->fetch(PDO::FETCH_ASSOC);
        if ($region === false) {
            return ['type' => 'FeatureCollection', 'features' => []];
        }
        $regionCode = $this->resolveRegionCode($region);
        $regionPolys = $regionCode !== '' ? GeoPoint::shabiyaPolygons($regionCode) : null;
        if ($regionPolys === null || $regionPolys === []) {
            return $points;
        }

        $cities = [];
        foreach ($features as $feature) {
            if (!is_array($feature)) {
                continue;
            }
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            $geom = $feature['geometry'] ?? null;
            if (!is_array($geom) || ($geom['type'] ?? '') !== 'Point') {
                continue;
            }
            $coords = $geom['coordinates'] ?? null;
            if (!is_array($coords) || count($coords) < 2) {
                continue;
            }
            $cities[] = [
                'entity_id' => (int) ($props['entity_id'] ?? 0),
                'name'      => (string) ($props['name'] ?? ''),
                'lat'       => (float) $coords[1],
                'lng'       => (float) $coords[0],
            ];
        }
        if ($cities === []) {
            return $points;
        }

        return [
            'type'     => 'FeatureCollection',
            'features' => CityGrid::buildFeatures($regionPolys, $cities, [
                'level'     => 'city',
                'parent_id' => $regionId,
            ]),
        ];
    }

    /** @return array{type:string, features:list<array<string,mixed>>} */
    private function areaGridFallback(int $cityId): array
    {
        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare(
            'SELECT a.id, a.name, a.lat, a.lng
             FROM areas a
             WHERE a.city_id = :cid
             ORDER BY a.id ASC'
        );
        $st->execute(['cid' => $cityId]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        if ($rows === []) {
            return ['type' => 'FeatureCollection', 'features' => []];
        }

        $cityPolys = $this->cityBoundaryPolygons($cityId);
        if ($cityPolys === null || $cityPolys === []) {
            return ['type' => 'FeatureCollection', 'features' => []];
        }

        $areas = [];
        foreach ($rows as $row) {
            $lat = $row['lat'] !== null ? (float) $row['lat'] : null;
            $lng = $row['lng'] !== null ? (float) $row['lng'] : null;
            if ($lat === null || $lng === null) {
                continue;
            }
            $areas[] = [
                'entity_id' => (int) $row['id'],
                'name'      => (string) ($row['name'] ?? ''),
                'lat'       => $lat,
                'lng'       => $lng,
            ];
        }
        if ($areas === []) {
            return ['type' => 'FeatureCollection', 'features' => []];
        }

        return [
            'type'     => 'FeatureCollection',
            'features' => CityGrid::buildFeatures($cityPolys, $areas, [
                'level'     => 'area',
                'parent_id' => $cityId,
            ]),
        ];
    }

    /**
     * @return array<int, array<int, array<int, array<int, float>>>>|null
     */
    private function cityBoundaryPolygons(int $cityId): ?array
    {
        $saved = Boundary::find('city', $cityId);
        if ($saved !== null) {
            $geom = json_decode($saved['geojson'], true);
            if (is_array($geom) && ($geom['type'] ?? '') === 'Feature') {
                $geom = $geom['geometry'] ?? null;
            }
            if (is_array($geom)) {
                return $this->geometryToPolygonSets($geom);
            }
        }

        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare(
            'SELECT c.region_id, r.name AS region_name, r.code AS region_code
             FROM cities c JOIN regions r ON r.id = c.region_id
             WHERE c.id = :id LIMIT 1'
        );
        $st->execute(['id' => $cityId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        $regionId = (int) ($row['region_id'] ?? 0);
        if ($regionId < 1) {
            return null;
        }
        $grid = $this->cityGridFallback($regionId);
        foreach ($grid['features'] as $feature) {
            if (!is_array($feature)) {
                continue;
            }
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            if ((int) ($props['entity_id'] ?? 0) !== $cityId) {
                continue;
            }
            $geom = $feature['geometry'] ?? null;
            if (is_array($geom)) {
                return $this->geometryToPolygonSets($geom);
            }
        }

        return null;
    }

    /**
     * @param array<string,mixed> $geom
     * @return array<int, array<int, array<int, array<int, float>>>>
     */
    private function geometryToPolygonSets(array $geom): array
    {
        $type = (string) ($geom['type'] ?? '');
        $coords = $geom['coordinates'] ?? null;
        if (!is_array($coords)) {
            return [];
        }
        if ($type === 'Polygon') {
            return [$coords];
        }
        if ($type === 'MultiPolygon') {
            $out = [];
            foreach ($coords as $poly) {
                if (is_array($poly)) {
                    $out[] = $poly;
                }
            }

            return $out;
        }

        return [];
    }

    /** @return array{type:string, features:list<array<string,mixed>>} */
    private function cityPointsFallback(int $regionId): array
    {
        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare('SELECT id, name, code FROM regions WHERE id = :id LIMIT 1');
        $st->execute(['id' => $regionId]);
        $region = $st->fetch(PDO::FETCH_ASSOC);
        if ($region === false) {
            return ['type' => 'FeatureCollection', 'features' => []];
        }
        $regionCode = $this->resolveRegionCode($region);

        $places = $regionCode !== ''
            ? ShabiyaCity::listByShabiyaCode($pdo, $regionCode)
            : [];
        if ($places === []) {
            $places = ShabiyaCity::listByArabicShabiyaName($pdo, (string) ($region['name'] ?? ''));
        }

        /** @var array<string, true> $seen */
        $seen = [];
        $features = [];
        foreach ($places as $place) {
            $name = trim((string) ($place['name'] ?? ''));
            if ($name === '' || isset($seen[$name])) {
                continue;
            }
            $seen[$name] = true;
            $entityId = $this->ensureCityRow($pdo, $regionId, $name);
            $features[] = [
                'type'       => 'Feature',
                'properties' => [
                    'entity_id' => $entityId,
                    'level'     => 'city',
                    'parent_id' => $regionId,
                    'name'      => $name,
                    'code'      => '',
                    'kind'      => (string) ($place['type'] ?? 'city'),
                    'is_point'  => true,
                ],
                'geometry'   => [
                    'type'        => 'Point',
                    'coordinates' => [(float) $place['lng'], (float) $place['lat']],
                ],
            ];
        }

        $path = dirname(__DIR__) . '/data/libya-cities.geojson';
        if (is_file($path)) {
            $raw = json_decode((string) file_get_contents($path), true);
            if (is_array($raw) && ($raw['type'] ?? '') === 'FeatureCollection') {
                foreach ($raw['features'] as $feature) {
                    if (!is_array($feature)) {
                        continue;
                    }
                    $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
                    $shCode = strtoupper(trim((string) ($props['shabiyaCode'] ?? '')));
                    if ($regionCode !== '' && strcasecmp($shCode, $regionCode) !== 0) {
                        continue;
                    }
                    $arName = trim((string) ($props['name_ar'] ?? ''));
                    if ($arName === '' || isset($seen[$arName])) {
                        continue;
                    }
                    $seen[$arName] = true;
                    $entityId = $this->ensureCityRow($pdo, $regionId, $arName);
                    $features[] = [
                        'type'       => 'Feature',
                        'properties' => [
                            'entity_id' => $entityId,
                            'level'     => 'city',
                            'parent_id' => $regionId,
                            'name'      => $arName,
                            'code'      => '',
                            'kind'      => (string) ($props['kind'] ?? 'city'),
                            'is_point'  => true,
                        ],
                        'geometry'   => $feature['geometry'] ?? null,
                    ];
                }
            }
        }

        $this->appendMissingDbCities($pdo, $regionId, $places, $seen, $features);

        return ['type' => 'FeatureCollection', 'features' => $features];
    }

    /**
     * Cities created manually in DB may lack a ShabiyaCity row — attach coordinates via name aliases.
     *
     * @param list<array{name:string,lat:float,lng:float,type:string}> $places
     * @param array<string, true> $seen
     * @param list<array<string,mixed>> $features
     */
    private function appendMissingDbCities(
        PDO $pdo,
        int $regionId,
        array $places,
        array &$seen,
        array &$features
    ): void {
        $st = $pdo->prepare('SELECT id, name, lat, lng FROM cities WHERE region_id = :rid ORDER BY id ASC');
        $st->execute(['rid' => $regionId]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

        /** @var array<int, true> $existingIds */
        $existingIds = [];
        foreach ($features as $feature) {
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            $eid = (int) ($props['entity_id'] ?? 0);
            if ($eid > 0) {
                $existingIds[$eid] = true;
            }
        }

        foreach ($rows as $row) {
            $entityId = (int) ($row['id'] ?? 0);
            if ($entityId < 1 || isset($existingIds[$entityId])) {
                continue;
            }
            $name = trim((string) ($row['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $lat = $row['lat'] !== null ? (float) $row['lat'] : null;
            $lng = $row['lng'] !== null ? (float) $row['lng'] : null;
            if ($lat === null || $lng === null) {
                $coords = $this->resolveCityCoordsByName($name, $places);
                if ($coords === null) {
                    continue;
                }
                $lat = $coords[0];
                $lng = $coords[1];
            }
            $seen[$name] = true;
            $features[] = [
                'type'       => 'Feature',
                'properties' => [
                    'entity_id' => $entityId,
                    'level'     => 'city',
                    'parent_id' => $regionId,
                    'name'      => $name,
                    'code'      => '',
                    'kind'      => 'city',
                    'is_point'  => true,
                ],
                'geometry'   => [
                    'type'        => 'Point',
                    'coordinates' => [$lng, $lat],
                ],
            ];
        }
    }

    /**
     * @param list<array{name:string,lat:float,lng:float,type:string}> $places
     * @return array{0:float,1:float}|null [lat, lng]
     */
    private function resolveCityCoordsByName(string $cityName, array $places): ?array
    {
        $aliases = array_values(array_unique(array_filter([
            trim($cityName),
            preg_replace('/^مركز\s+/u', '', trim($cityName)) ?: '',
        ])));
        foreach ($places as $place) {
            $pName = trim((string) ($place['name'] ?? ''));
            foreach ($aliases as $alias) {
                if ($alias === '') {
                    continue;
                }
                if ($pName === $alias || str_contains($pName, $alias) || str_contains($alias, $pName)) {
                    return [(float) $place['lat'], (float) $place['lng']];
                }
            }
        }

        return null;
    }

    /** @param array{name:string,code:?string} $region */
    private function resolveRegionCode(array $region): string
    {
        $regionCode = trim((string) ($region['code'] ?? ''));
        $admin = require dirname(__DIR__) . '/config/libya_admin.php';
        foreach ($admin['shabiyat'] as $sh) {
            if (($sh['name'] ?? '') === ($region['name'] ?? '')) {
                return (string) ($sh['code'] ?? $regionCode);
            }
        }

        return $regionCode;
    }

    private function ensureCityRow(PDO $pdo, int $regionId, string $name): int
    {
        $name = trim($name);
        $st = $pdo->prepare('SELECT id FROM cities WHERE region_id = :r AND name = :n LIMIT 1');
        $st->execute(['r' => $regionId, 'n' => $name]);
        $id = $st->fetchColumn();
        if ($id !== false) {
            return (int) $id;
        }

        return City::create($name, $regionId);
    }

    /**
     * Drop-down feed: entity_id, name, code, parent_id, has_boundary
     */
    public function apiEntities(): void
    {
        $this->requireApiAnyRole(['admin', 'employee']);
        header('Content-Type: application/json; charset=utf-8');
        $level = (string) ($_GET['level'] ?? 'region');
        $parentId = isset($_GET['parent_id']) && $_GET['parent_id'] !== '' ? (int) $_GET['parent_id'] : null;
        try {
            $rows = $this->fetchEntityRows($level, $parentId);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode([
                'ok'      => false,
                'message' => 'تعذّر تحميل القائمة: ' . $e->getMessage(),
                'rows'    => [],
            ], JSON_UNESCAPED_UNICODE);

            return;
        }
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id'           => (int) ($r['id'] ?? 0),
                'name'         => (string) ($r['name'] ?? ''),
                'code'         => $r['code'] ?? null,
                'parent_id'    => isset($r['parent_id']) && $r['parent_id'] !== null && $r['parent_id'] !== ''
                    ? (int) $r['parent_id'] : null,
                'kind'         => $r['kind'] ?? null,
                'has_boundary' => (bool) ((int) ($r['has_boundary'] ?? 0)),
            ];
        }
        echo json_encode(['ok' => true, 'level' => $level, 'rows' => $out], JSON_UNESCAPED_UNICODE);
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function fetchEntityRows(string $level, ?int $parentId): array
    {
        $pdo = Database::getInstance()->getPdo();
        $hasBoundaries = $this->tableExists($pdo, 'boundaries');
        $bCount = static function (string $lvl, string $idCol) use ($hasBoundaries): string {
            if (!$hasBoundaries) {
                return '0 AS has_boundary';
            }

            return '(SELECT COUNT(*) FROM boundaries b WHERE b.level = \'' . $lvl . '\' AND b.entity_id = ' . $idCol . ') AS has_boundary';
        };

        return match ($level) {
            'state' => $pdo->query(
                'SELECT s.id, s.name, s.code, NULL AS parent_id, ' . $bCount('state', 's.id') . '
                 FROM states s ORDER BY s.id ASC'
            )->fetchAll(PDO::FETCH_ASSOC) ?: [],
            'region' => $this->runEntityQuery(
                $pdo,
                'SELECT r.id, r.name, r.code, r.state_id AS parent_id, ' . $bCount('region', 'r.id') . '
                 FROM regions r',
                'r.state_id',
                $parentId
            ),
            'city' => $this->runEntityQuery(
                $pdo,
                'SELECT c.id, c.name, c.code, c.region_id AS parent_id, ' . $bCount('city', 'c.id') . '
                 FROM cities c',
                'c.region_id',
                $parentId
            ),
            'area' => $this->runEntityQuery(
                $pdo,
                'SELECT ' . $this->areasSelectColumns($pdo) . ', ' . $bCount('area', 'a.id') . '
                 FROM areas a',
                'a.city_id',
                $parentId
            ),
            'street' => $this->runEntityQuery(
                $pdo,
                'SELECT s.id, s.name, s.code, s.area_id AS parent_id, ' . $bCount('street', 's.id') . '
                 FROM streets s',
                's.area_id',
                $parentId
            ),
            default => [],
        };
    }

    private function tableExists(PDO $pdo, string $table): bool
    {
        $st = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = :t'
        );
        $st->execute(['t' => $table]);

        return (int) $st->fetchColumn() > 0;
    }

    private function columnExists(PDO $pdo, string $table, string $column): bool
    {
        $st = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c'
        );
        $st->execute(['t' => $table, 'c' => $column]);

        return (int) $st->fetchColumn() > 0;
    }

    private function areasSelectColumns(PDO $pdo): string
    {
        $cols = 'a.id, a.name, a.city_id AS parent_id';
        if ($this->columnExists($pdo, 'areas', 'code')) {
            $cols = 'a.id, a.name, a.code, a.city_id AS parent_id';
        }
        if ($this->columnExists($pdo, 'areas', 'kind')) {
            $cols .= ', a.kind';
        }

        return $cols;
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function runEntityQuery(PDO $pdo, string $baseSql, string $parentCol, ?int $parentId): array
    {
        $sql = $baseSql;
        if ($parentId !== null && $parentId > 0) {
            $sql .= ' WHERE ' . $parentCol . ' = :pid';
        }
        $sql .= ' ORDER BY 1 ASC';
        $st = $pdo->prepare($sql);
        if ($parentId !== null && $parentId > 0) {
            $st->execute(['pid' => $parentId]);
        } else {
            $st->execute();
        }

        return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function apiSave(): void
    {
        $this->guardPost();
        header('Content-Type: application/json; charset=utf-8');
        try {
            $level = (string) ($_POST['level'] ?? '');
            $entityId = (int) ($_POST['entity_id'] ?? 0);
            $geojson = (string) ($_POST['geojson'] ?? '');
            $code = isset($_POST['code']) ? (string) $_POST['code'] : null;
            $color = isset($_POST['color']) ? (string) $_POST['color'] : null;
            $name = isset($_POST['name']) ? trim((string) $_POST['name']) : null;

            Boundary::save($level, $entityId, $geojson, $code, $color, SessionAuth::userId());

            $this->propagateEntityMeta($level, $entityId, $name, $code, $color);

            echo json_encode(['ok' => true, 'message' => 'تم حفظ الحدود.'], JSON_UNESCAPED_UNICODE);
        } catch (RuntimeException $e) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'message' => 'فشل غير متوقع: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    public function apiDelete(): void
    {
        $this->guardPost();
        header('Content-Type: application/json; charset=utf-8');
        try {
            $level = (string) ($_POST['level'] ?? '');
            $entityId = (int) ($_POST['entity_id'] ?? 0);
            if (in_array($level, ['state', 'region'], true)) {
                throw new RuntimeException('لا يمكن حذف حدود الولاية أو الشعبية.');
            }
            Boundary::delete($level, $entityId);
            echo json_encode(['ok' => true, 'message' => 'تم حذف الحدود.'], JSON_UNESCAPED_UNICODE);
        } catch (\Throwable $e) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    /**
     * Create area or street at map click, assign a grid cell inside the parent boundary, save boundary.
     */
    public function apiEntityAddGrid(): void
    {
        $this->guardPost();
        header('Content-Type: application/json; charset=utf-8');
        try {
            $level = (string) ($_POST['level'] ?? '');
            $parentId = (int) ($_POST['parent_id'] ?? 0);
            $name = trim((string) ($_POST['name'] ?? ''));
            $code = isset($_POST['code']) ? strtoupper(trim((string) $_POST['code'])) : null;
            $color = isset($_POST['color']) ? trim((string) $_POST['color']) : null;
            $lat = (float) ($_POST['lat'] ?? 0);
            $lng = (float) ($_POST['lng'] ?? 0);

            if (!in_array($level, ['area', 'street'], true)) {
                throw new RuntimeException('يمكن إضافة حي أو شارع فقط من الخريطة.');
            }
            if ($parentId < 1 || $name === '') {
                throw new RuntimeException('الاسم والكيان الأب مطلوبان.');
            }
            if (abs($lat) < 0.0001 && abs($lng) < 0.0001) {
                throw new RuntimeException('انقر على الخريطة لتحديد موقع الكيان.');
            }
            if (!GeoBounds::isInLibya($lat, $lng)) {
                throw new RuntimeException('الموقع خارج نطاق ليبيا.');
            }

            $result = $level === 'area'
                ? $this->createAreaWithGrid($parentId, $name, $code, $color, $lat, $lng)
                : $this->createStreetWithGrid($parentId, $name, $code, $color, $lat, $lng);

            echo json_encode(['ok' => true] + $result, JSON_UNESCAPED_UNICODE);
        } catch (RuntimeException $e) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    public function apiEntityCreate(): void
    {
        $this->guardPost();
        header('Content-Type: application/json; charset=utf-8');
        try {
            $level = (string) ($_POST['level'] ?? '');
            $parentId = (int) ($_POST['parent_id'] ?? 0);
            $name = trim((string) ($_POST['name'] ?? ''));
            $code = isset($_POST['code']) ? strtoupper(trim((string) $_POST['code'])) : null;
            if ($name === '') {
                throw new RuntimeException('الاسم مطلوب.');
            }
            $newId = 0;
            switch ($level) {
                case 'region':
                    if ($parentId < 1) { throw new RuntimeException('اختر الولاية أولاً.'); }
                    $newId = Region::create($name, $parentId);
                    break;
                case 'city':
                    if ($parentId < 1) { throw new RuntimeException('اختر الشعبية أولاً.'); }
                    $newId = City::create($name, $parentId);
                    break;
                case 'area':
                    if ($parentId < 1) { throw new RuntimeException('اختر المدينة أولاً.'); }
                    $newId = Area::create($name, $parentId);
                    /* persist code on the new area */
                    if ($code !== null && $code !== '') {
                        $this->propagateEntityMeta('area', $newId, null, $code, null);
                    }
                    break;
                case 'street':
                    if ($parentId < 1) { throw new RuntimeException('اختر الحي أولاً.'); }
                    $newId = Street::create($name, $parentId, $code, SessionAuth::userId());
                    break;
                default:
                    throw new RuntimeException('لا يمكن إضافة هذا المستوى من المحرر.');
            }
            echo json_encode(['ok' => true, 'id' => $newId, 'message' => 'أُضيف الكيان.'], JSON_UNESCAPED_UNICODE);
        } catch (RuntimeException $e) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    /**
     * Write out a fresh GeoJSON file for the requested level (e.g. libya-cities.geojson).
     */
    public function apiExport(): void
    {
        $this->requireAnyRole(['admin']);
        $level = (string) ($_GET['level'] ?? 'region');
        $fc = Boundary::asFeatureCollection($level);
        $dir = dirname(__DIR__) . '/data';
        $fname = 'libya-' . $level . 's.geojson';
        $path = $dir . '/' . $fname;
        if (is_file($path)) {
            @copy($path, $path . '.bak-' . date('Ymd-His'));
        }
        $json = json_encode($fc, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        $written = $json !== false ? @file_put_contents($path, $json) : false;
        header('Content-Type: application/json; charset=utf-8');
        if ($written === false) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'message' => 'تعذّر كتابة الملف.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        echo json_encode([
            'ok'      => true,
            'file'    => 'data/' . $fname,
            'count'   => count($fc['features'] ?? []),
            'bytes'   => (int) $written,
        ], JSON_UNESCAPED_UNICODE);
    }

    private function propagateEntityMeta(string $level, int $entityId, ?string $name, ?string $code, ?string $color): void
    {
        unset($color);
        $pdo = Database::getInstance()->getPdo();
        $code = $code !== null && $code !== '' ? strtoupper(trim($code)) : null;
        $name = $name !== null && $name !== '' ? trim($name) : null;
        switch ($level) {
            case 'state':
                if ($name !== null) {
                    $pdo->prepare('UPDATE states SET name = :n WHERE id = :id')
                        ->execute(['n' => $name, 'id' => $entityId]);
                }
                break;
            case 'region':
                if ($name !== null) {
                    $pdo->prepare('UPDATE regions SET name = :n WHERE id = :id')
                        ->execute(['n' => $name, 'id' => $entityId]);
                }
                if ($code !== null) {
                    $pdo->prepare('UPDATE regions SET code = :c WHERE id = :id')
                        ->execute(['c' => $code, 'id' => $entityId]);
                }
                break;
            case 'city':
                if ($name !== null) {
                    $pdo->prepare('UPDATE cities SET name = :n WHERE id = :id')
                        ->execute(['n' => $name, 'id' => $entityId]);
                }
                if ($code !== null) {
                    $pdo->prepare('UPDATE cities SET code = :c WHERE id = :id')
                        ->execute(['c' => $code, 'id' => $entityId]);
                }
                break;
            case 'area':
                if ($name !== null) {
                    $pdo->prepare('UPDATE areas SET name = :n WHERE id = :id')
                        ->execute(['n' => $name, 'id' => $entityId]);
                }
                if ($code !== null) {
                    $pdo->prepare('UPDATE areas SET code = :c WHERE id = :id')
                        ->execute(['c' => $code, 'id' => $entityId]);
                }
                break;
            case 'street':
                if ($name !== null) {
                    $pdo->prepare('UPDATE streets SET name = :n WHERE id = :id')
                        ->execute(['n' => $name, 'id' => $entityId]);
                }
                if ($code !== null) {
                    $pdo->prepare('UPDATE streets SET code = :c WHERE id = :id')
                        ->execute(['c' => $code, 'id' => $entityId]);
                }
                break;
        }
    }

    /**
     * @return array{lat: float, lng: float, zoom?: int, bounds?: array{0:float,1:float,2:float,3:float}}|null
     */
    private function resolveEntityLocation(string $level, int $entityId): ?array
    {
        $saved = Boundary::find($level, $entityId);
        if ($saved !== null) {
            $geom = json_decode($saved['geojson'], true);
            if (is_array($geom) && ($geom['type'] ?? '') === 'Feature') {
                $geom = $geom['geometry'] ?? null;
            }
            if (is_array($geom)) {
                $box = $this->geometryBounds($geom);
                if ($box !== null) {
                    return $this->boundsToLocation($box);
                }
            }
        }

        $pdo = Database::getInstance()->getPdo();

        return match ($level) {
            'state'  => $this->stateLocationFallback($pdo, $entityId),
            'region' => $this->regionLocationFallback($pdo, $entityId),
            'city'   => $this->cityLocationFallback($pdo, $entityId),
            'area'   => $this->childLocationFallback($pdo, 'area', $entityId, 'city'),
            'street' => $this->childLocationFallback($pdo, 'street', $entityId, 'area'),
            default  => null,
        };
    }

    /** @return array{lat: float, lng: float, zoom?: int, bounds?: array{0:float,1:float,2:float,3:float}}|null */
    private function stateLocationFallback(PDO $pdo, int $entityId): ?array
    {
        $st = $pdo->prepare('SELECT code FROM states WHERE id = :id LIMIT 1');
        $st->execute(['id' => $entityId]);
        $letter = strtoupper(trim((string) ($st->fetchColumn() ?: '')));
        if ($letter === '') {
            return null;
        }
        $fc = $this->stateGeoJsonFallback();

        return $this->featureLocationByEntityId($fc['features'] ?? [], $entityId)
            ?? $this->featureLocationByProvince($fc['features'] ?? [], $letter);
    }

    /** @return array{lat: float, lng: float, zoom?: int, bounds?: array{0:float,1:float,2:float,3:float}}|null */
    private function regionLocationFallback(PDO $pdo, int $entityId): ?array
    {
        $st = $pdo->prepare('SELECT id, state_id FROM regions WHERE id = :id LIMIT 1');
        $st->execute(['id' => $entityId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        $fc = $this->regionGeoJsonFallback((int) ($row['state_id'] ?? 0) ?: null);

        return $this->featureLocationByEntityId($fc['features'] ?? [], $entityId);
    }

    /** @return array{lat: float, lng: float, zoom?: int, bounds?: array{0:float,1:float,2:float,3:float}}|null */
    private function cityLocationFallback(PDO $pdo, int $entityId): ?array
    {
        $st = $pdo->prepare(
            'SELECT c.id, c.name, c.lat, c.lng, c.region_id, r.name AS region_name, r.code AS region_code
             FROM cities c
             JOIN regions r ON r.id = c.region_id
             WHERE c.id = :id LIMIT 1'
        );
        $st->execute(['id' => $entityId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        $lat = $row['lat'] !== null ? (float) $row['lat'] : null;
        $lng = $row['lng'] !== null ? (float) $row['lng'] : null;
        if ($lat !== null && $lng !== null) {
            return ['lat' => $lat, 'lng' => $lng, 'zoom' => 11];
        }

        $cityName = trim((string) ($row['name'] ?? ''));
        $aliases = array_values(array_unique(array_filter([
            $cityName,
            preg_replace('/^مركز\s+/u', '', $cityName) ?: '',
        ])));

        $regionCode = $this->resolveRegionCode([
            'name' => (string) ($row['region_name'] ?? ''),
            'code' => $row['region_code'] ?? null,
        ]);
        $places = $regionCode !== ''
            ? ShabiyaCity::listByShabiyaCode($pdo, $regionCode)
            : ShabiyaCity::listByArabicShabiyaName($pdo, (string) ($row['region_name'] ?? ''));
        foreach ($places as $place) {
            $pName = trim((string) ($place['name'] ?? ''));
            foreach ($aliases as $alias) {
                if ($alias !== '' && ($pName === $alias || str_contains($pName, $alias) || str_contains($alias, $pName))) {
                    return [
                        'lat'  => (float) $place['lat'],
                        'lng'  => (float) $place['lng'],
                        'zoom' => 11,
                    ];
                }
            }
        }

        $regionId = (int) ($row['region_id'] ?? 0);
        if ($regionId > 0) {
            $fc = $this->cityListWithGrid($regionId);
            $hit = $this->featureLocationByEntityId($fc['features'] ?? [], $entityId);
            if ($hit !== null) {
                return $hit;
            }
        }

        return $this->cityLocationFromGeoJson($aliases, $regionCode);
    }

    /**
     * @param list<string> $aliases
     * @return array{lat: float, lng: float, zoom?: int}|null
     */
    private function cityLocationFromGeoJson(array $aliases, string $regionCode): ?array
    {
        $path = dirname(__DIR__) . '/data/libya-cities.geojson';
        if (!is_file($path)) {
            return null;
        }
        $raw = json_decode((string) file_get_contents($path), true);
        if (!is_array($raw) || ($raw['type'] ?? '') !== 'FeatureCollection') {
            return null;
        }
        foreach ($raw['features'] as $feature) {
            if (!is_array($feature)) {
                continue;
            }
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            if ($regionCode !== '' && strcasecmp((string) ($props['shabiyaCode'] ?? ''), $regionCode) !== 0) {
                continue;
            }
            $arName = trim((string) ($props['name_ar'] ?? ''));
            foreach ($aliases as $alias) {
                if ($alias !== '' && ($arName === $alias || str_contains($arName, $alias) || str_contains($alias, $arName))) {
                    $geom = $feature['geometry'] ?? null;
                    if (is_array($geom) && ($geom['type'] ?? '') === 'Point') {
                        $coords = $geom['coordinates'] ?? null;
                        if (is_array($coords) && count($coords) >= 2) {
                            return ['lat' => (float) $coords[1], 'lng' => (float) $coords[0], 'zoom' => 11];
                        }
                    }
                }
            }
        }

        return null;
    }

    /** @return array{lat: float, lng: float, zoom?: int, bounds?: array{0:float,1:float,2:float,3:float}}|null */
    private function childLocationFallback(PDO $pdo, string $level, int $entityId, string $parentLevel): ?array
    {
        if ($level === 'area') {
            $st = $pdo->prepare(
                'SELECT a.lat, a.lng, a.city_id, c.name AS city_name
                 FROM areas a JOIN cities c ON c.id = a.city_id WHERE a.id = :id LIMIT 1'
            );
        } else {
            $st = $pdo->prepare(
                'SELECT s.lat, s.lng, s.area_id, a.city_id
                 FROM streets s JOIN areas a ON a.id = s.area_id WHERE s.id = :id LIMIT 1'
            );
        }
        $st->execute(['id' => $entityId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        if ($row['lat'] !== null && $row['lng'] !== null) {
            return ['lat' => (float) $row['lat'], 'lng' => (float) $row['lng'], 'zoom' => 13];
        }
        if ($level === 'area' && isset($row['city_id'])) {
            return $this->cityLocationFallback($pdo, (int) $row['city_id']);
        }
        if ($level === 'street' && isset($row['city_id'])) {
            return $this->cityLocationFallback($pdo, (int) $row['city_id']);
        }

        return null;
    }

    /**
     * @param list<array<string,mixed>> $features
     * @return array{lat: float, lng: float, zoom?: int, bounds?: array{0:float,1:float,2:float,3:float}}|null
     */
    private function featureLocationByEntityId(array $features, int $entityId): ?array
    {
        foreach ($features as $feature) {
            if (!is_array($feature)) {
                continue;
            }
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            if ((int) ($props['entity_id'] ?? 0) !== $entityId) {
                continue;
            }
            $geom = $feature['geometry'] ?? null;
            if (!is_array($geom)) {
                continue;
            }
            $box = $this->geometryBounds($geom);
            if ($box !== null) {
                return $this->boundsToLocation($box);
            }
        }

        return null;
    }

    /**
     * @param list<array<string,mixed>> $features
     * @return array{lat: float, lng: float, zoom?: int, bounds?: array{0:float,1:float,2:float,3:float}}|null
     */
    private function featureLocationByProvince(array $features, string $letter): ?array
    {
        foreach ($features as $feature) {
            if (!is_array($feature)) {
                continue;
            }
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            if (strtoupper((string) ($props['province'] ?? $props['code'] ?? '')) !== $letter) {
                continue;
            }
            $geom = $feature['geometry'] ?? null;
            if (!is_array($geom)) {
                continue;
            }
            $box = $this->geometryBounds($geom);
            if ($box !== null) {
                return $this->boundsToLocation($box);
            }
        }

        return null;
    }

    /**
     * @param array<string,mixed> $geom
     * @return array{0:float,1:float,2:float,3:float}|null [south, west, north, east]
     */
    private function geometryBounds(array $geom): ?array
    {
        $type = (string) ($geom['type'] ?? '');
        $coords = $geom['coordinates'] ?? null;
        if (!is_array($coords)) {
            return null;
        }
        $minLat = 90.0;
        $maxLat = -90.0;
        $minLng = 180.0;
        $maxLng = -180.0;
        $walk = function (mixed $node) use (&$walk, &$minLat, &$maxLat, &$minLng, &$maxLng): void {
            if (!is_array($node)) {
                return;
            }
            if (count($node) >= 2 && is_numeric($node[0]) && is_numeric($node[1]) && !is_array($node[0])) {
                $lng = (float) $node[0];
                $lat = (float) $node[1];
                $minLat = min($minLat, $lat);
                $maxLat = max($maxLat, $lat);
                $minLng = min($minLng, $lng);
                $maxLng = max($maxLng, $lng);

                return;
            }
            foreach ($node as $child) {
                $walk($child);
            }
        };
        if ($type === 'Point') {
            $walk($coords);

            return [$minLat, $minLng, $maxLat, $maxLng];
        }
        if (in_array($type, ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'], true)) {
            $walk($coords);
            if ($minLat > $maxLat || $minLng > $maxLng) {
                return null;
            }

            return [$minLat, $minLng, $maxLat, $maxLng];
        }

        return null;
    }

    /**
     * @param array<string,mixed> $geom
     */
    private function geometrySpanTooLarge(string $level, array $geom): bool
    {
        $box = $this->geometryBounds($geom);
        if ($box === null) {
            return false;
        }
        [$south, $west, $north, $east] = $box;
        $latSpan = abs($north - $south);
        $lngSpan = abs($east - $west);
        $max = match ($level) {
            'city'   => 0.85,
            'area'   => 0.35,
            'street' => 0.12,
            default  => 2.5,
        };

        return $latSpan > $max || $lngSpan > $max;
    }

    /**
     * @param array{0:float,1:float,2:float,3:float} $box
     * @return array{lat: float, lng: float, zoom?: int, bounds: array{0:float,1:float,2:float,3:float}}
     */
    private function boundsToLocation(array $box): array
    {
        [$south, $west, $north, $east] = $box;
        $latSpan = abs($north - $south);
        $lngSpan = abs($east - $west);
        $isPoint = $latSpan < 0.0005 && $lngSpan < 0.0005;

        return [
            'lat'    => ($south + $north) / 2,
            'lng'    => ($west + $east) / 2,
            'zoom'   => $isPoint ? 11 : null,
            'bounds' => $box,
        ];
    }

    private function guardPost(): void
    {
        $this->requireAnyRole(['admin', 'employee']);
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            http_response_code(405);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['ok' => false, 'message' => 'POST required.']);
            exit;
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['ok' => false, 'message' => 'انتهت صلاحية الجلسة (CSRF).']);
            exit;
        }
    }
}
