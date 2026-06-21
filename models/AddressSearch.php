<?php
/**
 * Search and list saved addresses with filters and pagination.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use PDO;

final class AddressSearch
{
    public const MAX_RESULTS = 100;
    public const DEFAULT_PER_PAGE = 25;
    public const MAX_PER_PAGE = 100;

    /**
     * Backward-compat: simple text search used by older callers.
     * @return list<array<string, mixed>>
     */
    public static function search(string $q, string $mode = 'all'): array
    {
        unset($mode);
        $q = trim($q);
        if ($q === '') {
            return [];
        }
        $res = self::query(['q' => $q], 1, self::MAX_RESULTS);

        return $res['rows'];
    }

    /**
     * Filtered, paginated query for the unified addresses list page.
     *
     * @param array{q?: string, wilayah?: string, shabiya?: string, locality?: string, type?: string} $filters
     * @return array{rows: list<array<string, mixed>>, total: int}
     */
    public static function query(array $filters, int $page = 1, int $perPage = self::DEFAULT_PER_PAGE): array
    {
        $page    = max(1, $page);
        $perPage = max(1, min(self::MAX_PER_PAGE, $perPage));
        $offset  = ($page - 1) * $perPage;

        $where  = [];
        $params = [];

        $q = isset($filters['q']) ? trim((string) $filters['q']) : '';
        if ($q !== '') {
            $search = self::buildSearchClause($q);
            if ($search !== null) {
                $where[] = $search['sql'];
                foreach ($search['params'] as $k => $v) {
                    $params[$k] = $v;
                }
            }
        }

        $wilayah = isset($filters['wilayah']) ? trim((string) $filters['wilayah']) : '';
        if ($wilayah !== '' && in_array($wilayah, ['barqa', 'tripolitania', 'fezzan'], true)) {
            $where[] = 'a.`wilayah` = :wilayah';
            $params['wilayah'] = $wilayah;
        }

        $shabiya = isset($filters['shabiya']) ? trim((string) $filters['shabiya']) : '';
        if ($shabiya !== '') {
            $where[] = 'a.`shabiya` = :shabiya';
            $params['shabiya'] = $shabiya;
        }

        $locality = isset($filters['locality']) ? trim((string) $filters['locality']) : '';
        if ($locality !== '') {
            $where[] = 'a.`locality` = :locality';
            $params['locality'] = $locality;
        }

        $type = isset($filters['type']) ? trim((string) $filters['type']) : '';
        if ($type !== '' && in_array($type, ['residential', 'government', 'commercial'], true)) {
            $where[] = 'a.`type` = :type';
            $params['type'] = $type;
        }

        $whereSql = $where === [] ? '' : (' WHERE ' . implode(' AND ', $where));

        $pdo = Database::getInstance()->getPdo();

        $countSt = $pdo->prepare('SELECT COUNT(*) AS c FROM `addresses` a' . $whereSql);
        foreach ($params as $k => $v) {
            $countSt->bindValue(':' . $k, $v, PDO::PARAM_STR);
        }
        $countSt->execute();
        $total = (int) ($countSt->fetchColumn() ?: 0);

        $sel = "SELECT a.`id`, a.`postal_code`, a.`owner_name`, a.`type`, a.`latitude`, a.`longitude`, a.`apartment_number`,
                       a.`wilayah`, a.`shabiya`, a.`locality`, a.`street_number`,
                       a.`pc_province`, a.`pc_area`, a.`pc_city`, a.`pc_sector`, a.`pc_property`,
                       a.`parcel_geojson`, a.`parcel_desc`,
                       a.`created_at`, a.`created_by`, u.`name` AS `created_by_name`
                FROM `addresses` a
                LEFT JOIN `users` u ON u.`id` = a.`created_by`"
            . $whereSql
            . ' ORDER BY a.`id` DESC LIMIT :lim OFFSET :off';

        $st = $pdo->prepare($sel);
        foreach ($params as $k => $v) {
            $st->bindValue(':' . $k, $v, PDO::PARAM_STR);
        }
        $st->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $st->bindValue(':off', $offset, PDO::PARAM_INT);
        $st->execute();

        $out = [];
        while (($r = $st->fetch(PDO::FETCH_ASSOC)) !== false) {
            $out[] = self::normalizeRow($r);
        }

        return ['rows' => $out, 'total' => $total];
    }

    /**
     * @param array<string, mixed> $r
     * @return array<string, mixed>
     */
    private static function normalizeRow(array $r): array
    {
        return [
            'id'                 => (int) $r['id'],
            'postal_code'        => (string) $r['postal_code'],
            'owner_name'         => (string) ($r['owner_name'] ?? ''),
            'type'               => (string) ($r['type'] ?? ''),
            'latitude'           => (string) $r['latitude'],
            'longitude'          => (string) $r['longitude'],
            'apartment_number'   => $r['apartment_number'] !== null ? (string) $r['apartment_number'] : null,
            'wilayah'            => isset($r['wilayah']) && $r['wilayah'] !== null ? (string) $r['wilayah'] : null,
            'shabiya'            => isset($r['shabiya']) && $r['shabiya'] !== null ? (string) $r['shabiya'] : null,
            'locality'           => isset($r['locality']) && $r['locality'] !== null ? (string) $r['locality'] : null,
            'street_number'      => isset($r['street_number']) && $r['street_number'] !== null ? (string) $r['street_number'] : null,
            'pc_province'        => isset($r['pc_province']) && $r['pc_province'] !== null ? (string) $r['pc_province'] : null,
            'pc_area'            => isset($r['pc_area']) && $r['pc_area'] !== null ? (int) $r['pc_area'] : null,
            'pc_city'            => isset($r['pc_city']) && $r['pc_city'] !== null ? (int) $r['pc_city'] : null,
            'pc_sector'          => isset($r['pc_sector']) && $r['pc_sector'] !== null ? (string) $r['pc_sector'] : null,
            'pc_property'        => isset($r['pc_property']) && $r['pc_property'] !== null ? (int) $r['pc_property'] : null,
            'created_at'         => isset($r['created_at']) ? (string) $r['created_at'] : null,
            'created_by'         => isset($r['created_by']) ? (int) $r['created_by'] : null,
            'created_by_name'    => isset($r['created_by_name']) && $r['created_by_name'] !== null
                ? (string) $r['created_by_name']
                : null,
            'parcel_geojson'     => isset($r['parcel_geojson']) && $r['parcel_geojson'] !== null && $r['parcel_geojson'] !== ''
                ? (string) $r['parcel_geojson']
                : null,
            'parcel_desc'        => isset($r['parcel_desc']) && $r['parcel_desc'] !== null && $r['parcel_desc'] !== ''
                ? (string) $r['parcel_desc']
                : null,
        ];
    }

    private static function stripLikeMetachars(string $s): string
    {
        return str_replace(['%', '_', '\\'], '', $s);
    }

    /**
     * Smart search: postal code, owner name, coordinate pair, or single lat/lng fragment.
     *
     * @return array{sql: string, params: array<string, float|string>}|null
     */
    private static function buildSearchClause(string $rawQ): ?array
    {
        $pair = self::parseCoordinatePair($rawQ);
        if ($pair !== null) {
            return [
                'sql' => '(ABS(a.`latitude` - :q_lat) <= :q_tol AND ABS(a.`longitude` - :q_lng) <= :q_tol)',
                'params' => [
                    'q_lat' => $pair['lat'],
                    'q_lng' => $pair['lng'],
                    'q_tol' => 0.02,
                ],
            ];
        }

        $single = self::parseSingleCoordinate($rawQ);
        if ($single !== null) {
            $like = '%' . self::stripLikeMetachars($single) . '%';

            return [
                'sql' => '(CAST(a.`latitude` AS CHAR) LIKE :q_coord OR CAST(a.`longitude` AS CHAR) LIKE :q_coord)',
                'params' => ['q_coord' => $like],
            ];
        }

        $q = self::stripLikeMetachars($rawQ);
        if ($q === '') {
            return null;
        }
        $like = '%' . $q . '%';

        return [
            'sql' => '(a.`postal_code` LIKE :q_code OR a.`owner_name` LIKE :q_name)',
            'params' => [
                'q_code' => $like,
                'q_name' => $like,
            ],
        ];
    }

    /** @return array{lat: float, lng: float}|null */
    private static function parseCoordinatePair(string $raw): ?array
    {
        $norm = str_replace(['،', ';'], ',', trim($raw));
        if (!preg_match('/(-?\d+(?:\.\d+)?)\s*[,]\s*(-?\d+(?:\.\d+)?)/', $norm, $m)) {
            if (!preg_match('/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/', $norm, $m)) {
                return null;
            }
        }
        $a = (float) $m[1];
        $b = (float) $m[2];

        return self::assignLatLng($a, $b);
    }

    private static function parseSingleCoordinate(string $raw): ?string
    {
        $norm = trim(str_replace(['،', ';'], ',', $raw));
        if (!preg_match('/^-?\d+(?:\.\d+)?$/', $norm)) {
            return null;
        }
        if (!str_contains($norm, '.') && strlen($norm) < 4) {
            return null;
        }

        return $norm;
    }

    /** @return array{lat: float, lng: float} */
    private static function assignLatLng(float $a, float $b): array
    {
        $inLat = static fn (float $v): bool => $v >= 18.0 && $v <= 34.0;
        $inLng = static fn (float $v): bool => $v >= 8.0 && $v <= 26.0;
        if ($inLat($a) && $inLng($b)) {
            return ['lat' => $a, 'lng' => $b];
        }
        if ($inLat($b) && $inLng($a)) {
            return ['lat' => $b, 'lng' => $a];
        }

        return ['lat' => $a, 'lng' => $b];
    }
}
