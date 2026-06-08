<?php
/**
 * Five-part Libyan smart postal code: [Province] [Area]-[City]-[Sector] [Property]
 * Example: B 2-1-S 9 — reserves `property` in postal_property_counters (caller handles transaction).
 */
declare(strict_types=1);

namespace App;

use PDO;
use RuntimeException;

final class PostalCodeService
{
    public const PROVINCE_CODES = ['B', 'T', 'F'];

    /** @var int Maximum property serial per sector bucket */
    public const MAX_PROPERTY = 999999;

    /** HTML5 pattern attribute for sector input (1-2 alphanumeric). */
    public const SECTOR_PATTERN = '[A-Za-z0-9]{1,2}';

    public static function formatCode(string $province, int $area, int $city, string $sector, int $property): string
    {
        $p = self::normalizeProvince($province);
        $sectorU = self::normalizeSector($sector);
        return $p . ' ' . $area . '-' . $city . '-' . $sectorU . ' ' . $property;
    }

    public static function normalizeProvince(string $code): string
    {
        $c = strtoupper(trim($code));
        if (!in_array($c, self::PROVINCE_CODES, true)) {
            throw new RuntimeException('رمز الولاية يجب أن يكون B أو T أو F.');
        }

        return $c;
    }

    public static function normalizeSector(string $sector): string
    {
        $s = trim($sector);
        if ($s === '') {
            throw new RuntimeException('رمز القطاع الداخلي مطلوب (1–2 خانة أبجدرقمية، مثل S، SA، A1، 9).');
        }
        if (!preg_match('/^[A-Za-z0-9]{1,2}$/', $s)) {
            throw new RuntimeException('رمز القطاع يقبل خانة أو خانتين أبجدرقميتين (A–Z أو 0–9)، مثل: S، SA، A1، 9.');
        }

        return strtoupper($s);
    }

    /**
     * @return array{code: string, province: string, area: int, city: int, sector: string, property: int}
     */
    public static function reserveNextProperty(
        PDO $pdo,
        string $province,
        int $area,
        int $city,
        string $sector
    ): array {
        $p = self::normalizeProvince($province);
        self::validateAreaCity($area, $city);
        $sec = self::normalizeSector($sector);

        $sel = $pdo->prepare(
            'SELECT `last_property` FROM `postal_property_counters`
             WHERE `province_code` = :p AND `area_num` = :a AND `city_num` = :c AND `sector_code` = :s
             FOR UPDATE'
        );
        $sel->execute(['p' => $p, 'a' => $area, 'c' => $city, 's' => $sec]);
        $row = $sel->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            $ins = $pdo->prepare(
                'INSERT INTO `postal_property_counters` (`province_code`, `area_num`, `city_num`, `sector_code`, `last_property`)
                 VALUES (:p, :a, :c, :s, 1)'
            );
            $ins->execute(['p' => $p, 'a' => $area, 'c' => $city, 's' => $sec]);
            $n = 1;
        } else {
            $n = (int) $row['last_property'] + 1;
            if ($n > self::MAX_PROPERTY) {
                throw new RuntimeException('تم استنفاد أرقام العقارات لهذا القطاع.');
            }
            $upd = $pdo->prepare(
                'UPDATE `postal_property_counters` SET `last_property` = :n
                 WHERE `province_code` = :p AND `area_num` = :a AND `city_num` = :c AND `sector_code` = :s'
            );
            $upd->execute(['n' => $n, 'p' => $p, 'a' => $area, 'c' => $city, 's' => $sec]);
        }

        $code = self::formatCode($p, $area, $city, $sec, $n);

        return [
            'code'     => $code,
            'province' => $p,
            'area'     => $area,
            'city'     => $city,
            'sector'   => $sec,
            'property' => $n,
        ];
    }

    public static function validateAreaCity(int $area, int $city): void
    {
        if ($area < 1 || $area > 999) {
            throw new RuntimeException('رقم المنطقة يجب أن يكون بين 1 و 999.');
        }
        if ($city < 1 || $city > 999) {
            throw new RuntimeException('رقم المدينة/القرية يجب أن يكون بين 1 و 999.');
        }
    }

    /**
     * Map province letter to wilayah key used elsewhere in the app.
     */
    public static function wilayahKeyFromProvince(string $province): string
    {
        $p = self::normalizeProvince($province);

        return match ($p) {
            'B' => 'barqa',
            'T' => 'tripolitania',
            'F' => 'fezzan',
        };
    }
}
