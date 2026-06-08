<?php
/**
 * Wilayat / Shabiyat lookups.
 *
 * Source-of-truth resolution order (first one that succeeds wins):
 *   1) Database tables `states` + `regions` (preferred). The static PHP file
 *      is still consulted to fill in the wilayah ↔ letter mapping that the DB
 *      schema does not store directly.
 *   2) The hard-coded `config/libya_admin.php` file.
 *
 * Results are cached per-request in a static field. Call `clearCache()` to
 * invalidate (e.g. after a bulk geo-admin update from `AdminGeoController`).
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use PDO;
use Throwable;

final class LibyaAdmin
{
    /**
     * @var array{
     *   wilayah: array<string, string>,
     *   wilayah_province: array<string, string>,
     *   shabiyat: list<array{name: string, wilayah: string, code?: string}>
     * }|null
     */
    private static ?array $cache = null;

    public static function clearCache(): void
    {
        self::$cache = null;
    }

    /**
     * @return array{
     *   wilayah: array<string, string>,
     *   wilayah_province: array<string, string>,
     *   shabiyat: list<array{name: string, wilayah: string, code?: string}>
     * }
     */
    public static function definitions(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        /** @var array{wilayah: array<string, string>, wilayah_province: array<string, string>, shabiyat: list<array{name: string, wilayah: string, code?: string}>} $file */
        $file = require dirname(__DIR__) . '/config/libya_admin.php';

        $db = self::tryLoadFromDb($file);
        self::$cache = $db ?? $file;
        return self::$cache;
    }

    /**
     * Attempt to load wilayat/shabiyat from `states` + `regions`. Returns
     * NULL if the DB is empty or unavailable.
     *
     * `wilayah_province` (key → letter) is taken from the PHP file because the
     * schema does not currently store the letter mapping in `states`.
     *
     * @param array{wilayah: array<string, string>, wilayah_province: array<string, string>, shabiyat: list<array{name: string, wilayah: string, code?: string}>} $fallback
     * @return array{
     *   wilayah: array<string, string>,
     *   wilayah_province: array<string, string>,
     *   shabiyat: list<array{name: string, wilayah: string, code?: string}>
     * }|null
     */
    private static function tryLoadFromDb(array $fallback): ?array
    {
        try {
            $pdo = Database::getInstance()->getPdo();
            $states = $pdo->query('SELECT id, name, code FROM `states`')->fetchAll(PDO::FETCH_ASSOC);
            if (!is_array($states) || $states === []) {
                return null;
            }
            $regions = $pdo->query('SELECT name, state_id, code FROM `regions`')->fetchAll(PDO::FETCH_ASSOC);
            if (!is_array($regions) || $regions === []) {
                return null;
            }

            /* Map DB state letter (B/T/F) → wilayah key (barqa/tripolitania/fezzan)
             * by reversing the PHP file's wilayah_province table. */
            $letterToKey = [];
            foreach ($fallback['wilayah_province'] as $key => $letter) {
                $letterToKey[strtoupper((string) $letter)] = $key;
            }

            $wilayah = [];
            $wilayahByStateId = [];
            foreach ($states as $row) {
                $stId = (int) ($row['id'] ?? 0);
                $name = (string) ($row['name'] ?? '');
                $code = strtoupper((string) ($row['code'] ?? ''));
                $key  = $letterToKey[$code] ?? null;
                if ($key === null) {
                    /* Unknown letter: derive a slug-safe key. */
                    $key = 'state_' . $stId;
                }
                $wilayah[$key] = $name;
                $wilayahByStateId[$stId] = $key;
            }
            if ($wilayah === []) {
                return null;
            }

            $shabiyat = [];
            foreach ($regions as $row) {
                $stId = (int) ($row['state_id'] ?? 0);
                $key = $wilayahByStateId[$stId] ?? null;
                if ($key === null) {
                    continue;
                }
                $shabiyat[] = [
                    'name'    => (string) ($row['name'] ?? ''),
                    'wilayah' => $key,
                    'code'    => (string) ($row['code'] ?? ''),
                ];
            }
            if ($shabiyat === []) {
                return null;
            }

            return [
                'wilayah'          => $wilayah,
                'wilayah_province' => $fallback['wilayah_province'],
                'shabiyat'         => $shabiyat,
            ];
        } catch (Throwable) {
            return null;
        }
    }

    public static function isValidWilayah(string $key): bool
    {
        return isset(self::definitions()['wilayah'][$key]);
    }

    public static function wilayahLabel(string $key): string
    {
        return self::definitions()['wilayah'][$key] ?? $key;
    }

    /** حرف المحافظة B / T / F المرتبط بالولاية التقليدية. */
    public static function wilayahProvinceLetter(string $key): string
    {
        $p = self::definitions()['wilayah_province'][$key] ?? '';

        return $p;
    }

    /** نص خيار القائمة: الاسم العربي + الحرف بين أقواس (قيمة الحقل تبقى المفتاح اللاتيني). */
    public static function wilayahSelectLabel(string $key): string
    {
        $ar = self::wilayahLabel($key);
        $p = self::wilayahProvinceLetter($key);

        return $p !== '' ? $ar . ' (' . $p . ')' : $ar;
    }

    public static function isShabiyaInWilayah(string $wilayahKey, string $shabiyaName): bool
    {
        $shabiyaName = trim($shabiyaName);
        if ($shabiyaName === '' || !self::isValidWilayah($wilayahKey)) {
            return false;
        }
        foreach (self::definitions()['shabiyat'] as $row) {
            if ($row['wilayah'] === $wilayahKey && $row['name'] === $shabiyaName) {
                return true;
            }
        }

        return false;
    }

    /**
     * بحث اسم الشعبية بالعربية كما يظهر في النموذج والخريطة.
     *
     * @return array{name: string, wilayah: string, code?: string}|null
     */
    public static function shabiyaRowByArabicName(string $name): ?array
    {
        $trim = trim($name);
        if ($trim === '') {
            return null;
        }
        foreach (self::definitions()['shabiyat'] as $row) {
            if (($row['name'] ?? '') === $trim) {
                return $row;
            }
        }

        return null;
    }
}
