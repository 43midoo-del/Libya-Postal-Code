<?php
/**
 * مدن وأماكن مرتبطة بالشعبية الإدارية (مصدر محلي — أسرع من Overpass عند تشغيل XAMPP).
 */
declare(strict_types=1);

namespace App\Models;

use PDO;

final class ShabiyaCity
{
    private function __construct()
    {
    }

    /**
     * @return list<array{name: string, lat: float, lng: float, type: string}>
     */
    public static function listByArabicShabiyaName(PDO $pdo, string $shabiyaArabic): array
    {
        $name = trim($shabiyaArabic);
        if ($name === '') {
            return [];
        }
        $stmt = $pdo->prepare(
            'SELECT place_name, lat, lng, place_kind FROM shabiya_city_places
             WHERE shabiya_name = :sn
             ORDER BY sort_order ASC, place_name ASC'
        );
        $stmt->execute([':sn' => $name]);

        return self::normalizePlaceRows($stmt);
    }

    /**
     * @return list<array{name: string, lat: float, lng: float, type: string}>
     */
    public static function listByShabiyaCode(PDO $pdo, string $code): array
    {
        $c = trim(strtoupper($code));
        if ($c === '') {
            return [];
        }
        $stmt = $pdo->prepare(
            'SELECT place_name, lat, lng, place_kind FROM shabiya_city_places
             WHERE UPPER(TRIM(shabiya_code)) = :sc
             ORDER BY sort_order ASC, place_name ASC'
        );
        $stmt->execute([':sc' => $c]);

        return self::normalizePlaceRows($stmt);
    }

    /**
     * All places grouped for client-side map lookup (no external API).
     *
     * @return array{
     *   byCode: array<string, list<array{name: string, lat: float, lng: float, type: string}>>,
     *   byName: array<string, list<array{name: string, lat: float, lng: float, type: string}>>
     * }
     */
    public static function listAllGrouped(PDO $pdo): array
    {
        $stmt = $pdo->query(
            'SELECT shabiya_code, shabiya_name, place_name, lat, lng, place_kind
             FROM shabiya_city_places
             ORDER BY sort_order ASC, place_name ASC'
        );
        if ($stmt === false) {
            return ['byCode' => [], 'byName' => []];
        }

        /** @var array<string, list<array{name: string, lat: float, lng: float, type: string}>> $byCode */
        $byCode = [];
        /** @var array<string, list<array{name: string, lat: float, lng: float, type: string}>> $byName */
        $byName = [];

        while (($row = $stmt->fetch(PDO::FETCH_ASSOC)) !== false) {
            $place = [
                'name' => (string) $row['place_name'],
                'lat'  => (float) $row['lat'],
                'lng'  => (float) $row['lng'],
                'type' => (string) ($row['place_kind'] !== '' ? $row['place_kind'] : 'town'),
            ];
            $code = strtoupper(trim((string) ($row['shabiya_code'] ?? '')));
            $name = trim((string) ($row['shabiya_name'] ?? ''));
            if ($code !== '') {
                $byCode[$code][] = $place;
            }
            if ($name !== '') {
                $byName[$name][] = $place;
            }
        }

        return ['byCode' => $byCode, 'byName' => $byName];
    }

    /** @phpstan-return list<array{name: string, lat: float, lng: float, type: string}> */
    private static function normalizePlaceRows(\PDOStatement $statement): array
    {
        /** @var list<array{name: string, lat: float, lng: float, type: string}> $out */
        $out = [];
        while (($row = $statement->fetch(PDO::FETCH_ASSOC)) !== false) {
            $out[] = [
                'name' => (string) $row['place_name'],
                'lat'  => (float) $row['lat'],
                'lng'  => (float) $row['lng'],
                'type' => (string) ($row['place_kind'] !== '' ? $row['place_kind'] : 'town'),
            ];
        }

        return $out;
    }
}
