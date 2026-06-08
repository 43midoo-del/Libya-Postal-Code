<?php
/**
 * Persist a postal address; coordinates in WGS84 (DECIMAL 10,7).
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use App\GeoBounds;
use App\GeoPoint;
use App\PostalCodeService;
use PDO;
use PDOException;
use RuntimeException;
use Throwable;

final class Address
{
    public const TYPES = ['residential', 'government', 'commercial'];

    private function __construct()
    {
    }

    /** Arabic label for UI; includes legacy DB values for display. */
    public static function typeLabelAr(string $type): string
    {
        return match ($type) {
            'residential' => 'سكني',
            'government'  => 'حكومي',
            'commercial'  => 'تجاري',
            'office'      => 'مكتب',
            'other'       => 'أخرى',
            default       => $type,
        };
    }

    /**
     * Compute non-blocking spatial warnings for a (lat,lng) about to be saved
     * under a given (province, pcArea, shabiya). Returns an array of Arabic
     * messages — empty array if everything checks out (or data is missing).
     *
     * Currently checks:
     *   - point is inside the polygon of the shabiya whose code = province+pcArea
     *
     * @return string[]
     */
    public static function spatialWarnings(
        string $provinceCode,
        int $pcArea,
        float $lat,
        float $lng
    ): array {
        $warnings = [];
        $code = strtoupper(trim($provinceCode)) . (string) $pcArea;
        $verdict = GeoPoint::inShabiyaCode($code, $lat, $lng);
        if ($verdict === false) {
            $warnings[] = 'تحذير: الموقع المُحدّد يقع خارج حدود الشعبية ' . $code
                . '. تأكّد من رمز المحافظة/الشعبية أو من اختيار النقطة الصحيحة على الخريطة.';
        }
        return $warnings;
    }

    /**
     * @return array{postalCode: string, id: int, warnings: string[]}
     */
    public static function create(
        int $userId,
        int $areaId,
        ?string $holderName,
        string $type,
        float $latitude,
        float $longitude,
        ?string $apartment,
        string $provinceCode,
        int $pcArea,
        int $pcCity,
        string $pcSector,
        ?string $shabiya,
        ?string $locality,
        ?string $streetNumber
    ): array {
        $holderName = $holderName === null ? '' : trim($holderName);
        if (strlen($holderName) > 200) {
            throw new RuntimeException('اسم الحامل طويل جداً (حتى 200 حرف).');
        }
        $holderDb = $holderName === '' ? null : $holderName;
        if (!in_array($type, self::TYPES, true)) {
            throw new RuntimeException('نوع العنوان غير صالح.');
        }
        PostalCodeService::validateAreaCity($pcArea, $pcCity);
        $province = PostalCodeService::normalizeProvince($provinceCode);
        $sectorNorm = PostalCodeService::normalizeSector($pcSector);
        $wilayah = PostalCodeService::wilayahKeyFromProvince($province);
        $shabiya = $shabiya === null ? '' : trim($shabiya);
        if ($shabiya !== '' && !LibyaAdmin::isShabiyaInWilayah($wilayah, $shabiya)) {
            throw new RuntimeException('يرجى اختيار شعبية تابعة للولاية المطابقة لرمز المحافظة.');
        }
        $locality = $locality === null ? '' : trim($locality);
        $streetNumber = $streetNumber === null ? '' : trim($streetNumber);
        if ($locality !== '' && strlen($locality) > 200) {
            throw new RuntimeException('حقل المنطقة/المدينة طويل جداً.');
        }
        if ($streetNumber !== '' && strlen($streetNumber) > 32) {
            throw new RuntimeException('حقل الرقم طويل جداً.');
        }
        if (!GeoBounds::isInLibya($latitude, $longitude)) {
            throw new RuntimeException('الإحداثيّات خارج نطاق ليبيا في الإعدادات الحالية. اختر موقعاً داخل الصندوق على الخريطة.');
        }
        $warnings = self::spatialWarnings($province, $pcArea, $latitude, $longitude);
        $pdo = Database::getInstance()->getPdo();
        $id     = 0;
        $postal = null;
        $pdo->beginTransaction();
        try {
            $reserved = PostalCodeService::reserveNextProperty($pdo, $province, $pcArea, $pcCity, $sectorNorm);
            $postal   = (string) $reserved['code'];
            $latS = self::roundDecimal7($latitude);
            $lngS = self::roundDecimal7($longitude);
            $ins  = $pdo->prepare(
                'INSERT INTO `addresses` (
                    `owner_name`, `type`, `latitude`, `longitude`, `postal_code`,
                    `pc_province`, `pc_area`, `pc_city`, `pc_sector`, `pc_property`,
                    `apartment_number`, `created_by`, `area_id`,
                    `wilayah`, `shabiya`, `locality`, `street_number`
                 ) VALUES (
                    :o, :t, :lat, :lng, :p,
                    :pp, :pa, :pc, :ps, :prop,
                    :apt, :uid, :aid,
                    :w, :sh, :loc, :sn
                 )'
            );
            $ins->execute([
                'o'     => $holderDb,
                't'     => $type,
                'lat'   => $latS,
                'lng'   => $lngS,
                'p'     => $postal,
                'pp'    => $reserved['province'],
                'pa'    => $reserved['area'],
                'pc'    => $reserved['city'],
                'ps'    => $reserved['sector'],
                'prop'  => $reserved['property'],
                'apt'   => $apartment === null || $apartment === '' ? null : trim($apartment),
                'uid'   => $userId,
                'aid'   => $areaId,
                'w'     => $wilayah,
                'sh'    => $shabiya === '' ? null : $shabiya,
                'loc'   => $locality === '' ? null : $locality,
                'sn'    => $streetNumber === '' ? null : $streetNumber,
            ]);
            $id = (int) $pdo->lastInsertId();
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            if ($e instanceof PDOException) {
                $msg = $e->getMessage();
                if (str_contains($msg, 'uk_addresses_coords') || (str_contains($msg, 'Duplicate') && str_contains($msg, 'latitude'))) {
                    throw new RuntimeException('هذا الموقع مسجّل مسبقاً (إحداثيات مكررة).', 0, $e);
                }
                if (str_contains($msg, 'uk_addresses_postal')) {
                    throw new RuntimeException('تعارض في الكود البريدي. أعد المحاولة.', 0, $e);
                }
            }
            if ($e instanceof RuntimeException) {
                throw $e;
            }
            throw new RuntimeException('تعذّر حفظ العنوان. تحقق من الاتصال بقاعدة البيانات والجداول.', 0, $e);
        }
        return [
            'postalCode' => (string) $postal,
            'id'         => (int) $id,
            'warnings'   => $warnings,
        ];
    }

    /**
     * @return array{
     *   id: int, postal_code: string, owner_name: string|null, type: string,
     *   latitude: string, longitude: string, apartment_number: string|null, area_id: int,
     *   wilayah: string|null, shabiya: string|null, locality: string|null, street_number: string|null,
     *   pc_province: string|null, pc_area: int|null, pc_city: int|null, pc_sector: string|null, pc_property: int|null
     * }|null
     */
    public static function findById(int $id): ?array
    {
        if ($id < 1) {
            return null;
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare(
            'SELECT a.`id`, a.`postal_code`, a.`owner_name`, a.`type`, a.`latitude`, a.`longitude`, a.`apartment_number`, a.`area_id`,
                    a.`wilayah`, a.`shabiya`, a.`locality`, a.`street_number`,
                    a.`pc_province`, a.`pc_area`, a.`pc_city`, a.`pc_sector`, a.`pc_property`
             FROM `addresses` a WHERE a.`id` = :id LIMIT 1'
        );
        $st->execute(['id' => $id]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if ($r === false) {
            return null;
        }
        return [
            'id'                 => (int) $r['id'],
            'postal_code'        => (string) $r['postal_code'],
            'owner_name'         => $r['owner_name'] !== null ? (string) $r['owner_name'] : null,
            'type'               => (string) $r['type'],
            'latitude'           => (string) $r['latitude'],
            'longitude'          => (string) $r['longitude'],
            'apartment_number'  => $r['apartment_number'] !== null ? (string) $r['apartment_number'] : null,
            'area_id'            => (int) $r['area_id'],
            'wilayah'            => isset($r['wilayah']) && $r['wilayah'] !== null ? (string) $r['wilayah'] : null,
            'shabiya'            => isset($r['shabiya']) && $r['shabiya'] !== null ? (string) $r['shabiya'] : null,
            'locality'           => isset($r['locality']) && $r['locality'] !== null ? (string) $r['locality'] : null,
            'street_number'      => isset($r['street_number']) && $r['street_number'] !== null ? (string) $r['street_number'] : null,
            'pc_province'        => isset($r['pc_province']) && $r['pc_province'] !== null ? (string) $r['pc_province'] : null,
            'pc_area'            => isset($r['pc_area']) && $r['pc_area'] !== null ? (int) $r['pc_area'] : null,
            'pc_city'            => isset($r['pc_city']) && $r['pc_city'] !== null ? (int) $r['pc_city'] : null,
            'pc_sector'          => isset($r['pc_sector']) && $r['pc_sector'] !== null ? (string) $r['pc_sector'] : null,
            'pc_property'        => isset($r['pc_property']) && $r['pc_property'] !== null ? (int) $r['pc_property'] : null,
        ];
    }

    /**
     * Full update: location + postal parts + metadata. Recomputes postal code only
     * when one of (province, area, city, sector) changes; otherwise keeps existing
     * postal_code and pc_property.
     *
     * @param array{
     *   owner_name?: string|null, type?: string, apartment_number?: string|null,
     *   latitude?: float|string|null, longitude?: float|string|null,
     *   pc_province?: string, pc_area?: int|string, pc_city?: int|string, pc_sector?: string,
     *   wilayah?: string|null, shabiya?: string|null, locality?: string|null, street_number?: string|null
     * } $data
     */
    public static function update(int $id, array $data): void
    {
        $cur = self::findById($id);
        if ($cur === null) {
            throw new RuntimeException('العنوان غير موجود.');
        }

        $owner = array_key_exists('owner_name', $data)
            ? ($data['owner_name'] === null ? null : trim((string) $data['owner_name']))
            : $cur['owner_name'];
        if ($owner !== null && strlen($owner) > 200) {
            throw new RuntimeException('اسم الحامل طويل جداً.');
        }
        if ($owner === '') {
            $owner = null;
        }

        $type = array_key_exists('type', $data) ? (string) $data['type'] : $cur['type'];
        if (!in_array($type, self::TYPES, true)) {
            throw new RuntimeException('نوع العنوان غير صالح.');
        }

        $apt = array_key_exists('apartment_number', $data)
            ? ($data['apartment_number'] === null || $data['apartment_number'] === '' ? null : trim((string) $data['apartment_number']))
            : $cur['apartment_number'];
        if ($apt !== null && strlen($apt) > 32) {
            throw new RuntimeException('حقل بيان إضافي طويل جداً.');
        }

        $lat = array_key_exists('latitude', $data) && $data['latitude'] !== null && $data['latitude'] !== ''
            ? (float) $data['latitude']
            : (float) $cur['latitude'];
        $lng = array_key_exists('longitude', $data) && $data['longitude'] !== null && $data['longitude'] !== ''
            ? (float) $data['longitude']
            : (float) $cur['longitude'];
        if (!GeoBounds::isInLibya($lat, $lng)) {
            throw new RuntimeException('الإحداثيّات خارج نطاق ليبيا.');
        }

        $province = array_key_exists('pc_province', $data) && $data['pc_province'] !== ''
            ? PostalCodeService::normalizeProvince((string) $data['pc_province'])
            : (string) ($cur['pc_province'] ?? '');
        if ($province === '') {
            throw new RuntimeException('رمز الولاية مطلوب.');
        }

        $pcArea = array_key_exists('pc_area', $data) && $data['pc_area'] !== '' && $data['pc_area'] !== null
            ? (int) $data['pc_area']
            : (int) ($cur['pc_area'] ?? 0);
        $pcCity = array_key_exists('pc_city', $data) && $data['pc_city'] !== '' && $data['pc_city'] !== null
            ? (int) $data['pc_city']
            : (int) ($cur['pc_city'] ?? 0);
        PostalCodeService::validateAreaCity($pcArea, $pcCity);

        $sector = array_key_exists('pc_sector', $data) && $data['pc_sector'] !== ''
            ? PostalCodeService::normalizeSector((string) $data['pc_sector'])
            : (string) ($cur['pc_sector'] ?? '');
        if ($sector === '') {
            throw new RuntimeException('رمز القطاع مطلوب.');
        }

        $wilayahKey = PostalCodeService::wilayahKeyFromProvince($province);

        $shabiya = array_key_exists('shabiya', $data)
            ? ($data['shabiya'] === null ? null : trim((string) $data['shabiya']))
            : $cur['shabiya'];
        if ($shabiya !== null && $shabiya !== '' && !LibyaAdmin::isShabiyaInWilayah($wilayahKey, $shabiya)) {
            throw new RuntimeException('الشعبية غير تابعة للولاية المحدّدة.');
        }
        if ($shabiya === '') { $shabiya = null; }

        $locality = array_key_exists('locality', $data)
            ? ($data['locality'] === null ? null : trim((string) $data['locality']))
            : $cur['locality'];
        if ($locality !== null && strlen($locality) > 200) {
            throw new RuntimeException('حقل المنطقة/المدينة طويل جداً.');
        }
        if ($locality === '') { $locality = null; }

        $streetNumber = array_key_exists('street_number', $data)
            ? ($data['street_number'] === null ? null : trim((string) $data['street_number']))
            : $cur['street_number'];
        if ($streetNumber !== null && strlen($streetNumber) > 32) {
            throw new RuntimeException('حقل رقم القطعة طويل جداً.');
        }
        if ($streetNumber === '') { $streetNumber = null; }

        $segChanged = (
            ((string) ($cur['pc_province'] ?? '')) !== $province ||
            (int) ($cur['pc_area'] ?? 0) !== $pcArea ||
            (int) ($cur['pc_city'] ?? 0) !== $pcCity ||
            ((string) ($cur['pc_sector'] ?? '')) !== $sector
        );

        $pdo = Database::getInstance()->getPdo();
        $pdo->beginTransaction();
        try {
            $postal = (string) $cur['postal_code'];
            $pcProperty = (int) ($cur['pc_property'] ?? 0);
            if ($segChanged) {
                $reserved = PostalCodeService::reserveNextProperty($pdo, $province, $pcArea, $pcCity, $sector);
                $postal     = (string) $reserved['code'];
                $pcProperty = (int) $reserved['property'];
            }

            $latS = self::roundDecimal7($lat);
            $lngS = self::roundDecimal7($lng);

            $st = $pdo->prepare(
                'UPDATE `addresses` SET
                    `owner_name` = :o,
                    `type` = :t,
                    `latitude` = :lat,
                    `longitude` = :lng,
                    `postal_code` = :pc,
                    `pc_province` = :pp,
                    `pc_area` = :pa,
                    `pc_city` = :pcc,
                    `pc_sector` = :ps,
                    `pc_property` = :prop,
                    `apartment_number` = :apt,
                    `wilayah` = :w,
                    `shabiya` = :sh,
                    `locality` = :loc,
                    `street_number` = :sn
                 WHERE `id` = :id'
            );
            $st->execute([
                'o'    => $owner,
                't'    => $type,
                'lat'  => $latS,
                'lng'  => $lngS,
                'pc'   => $postal,
                'pp'   => $province,
                'pa'   => $pcArea,
                'pcc'  => $pcCity,
                'ps'   => $sector,
                'prop' => $pcProperty,
                'apt'  => $apt,
                'w'    => $wilayahKey,
                'sh'   => $shabiya,
                'loc'  => $locality,
                'sn'   => $streetNumber,
                'id'   => $id,
            ]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            if ($e instanceof PDOException) {
                $msg = $e->getMessage();
                if (str_contains($msg, 'uk_addresses_coords')) {
                    throw new RuntimeException('هذا الموقع مسجّل مسبقاً لعنوان آخر.', 0, $e);
                }
                if (str_contains($msg, 'uk_addresses_postal')) {
                    throw new RuntimeException('الكود البريدي المُولّد مستخدم. أعد المحاولة.', 0, $e);
                }
            }
            if ($e instanceof RuntimeException) {
                throw $e;
            }
            throw new RuntimeException('تعذّر حفظ تعديلات العنوان.', 0, $e);
        }
    }

    public static function ownerIdOf(int $id): ?int
    {
        if ($id < 1) {
            return null;
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('SELECT created_by FROM addresses WHERE id = :id LIMIT 1');
        $st->execute(['id' => $id]);
        $v = $st->fetchColumn();
        return $v === false ? null : (int) $v;
    }

    public static function updateMeta(int $id, ?string $ownerName, string $type, ?string $apartment): void
    {
        $ownerName = $ownerName === null ? '' : trim($ownerName);
        if (strlen($ownerName) > 200) {
            throw new RuntimeException('اسم المالك/الحامل طويل جداً (حتى 200 حرف).');
        }
        $ownerDb = $ownerName === '' ? null : $ownerName;
        if (!in_array($type, self::TYPES, true)) {
            throw new RuntimeException('نوع العنوان غير صالح.');
        }
        $apt = $apartment === null || $apartment === '' ? null : trim($apartment);
        if ($apt !== null && strlen($apt) > 32) {
            throw new RuntimeException('حقل بيان إضافي طويل جداً.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare(
            'UPDATE `addresses` SET `owner_name` = :o, `type` = :t, `apartment_number` = :a WHERE `id` = :id'
        );
        if (self::findById($id) === null) {
            throw new RuntimeException('العنوان غير موجود.');
        }
        $st->execute([
            'o'   => $ownerDb,
            't'   => $type,
            'a'   => $apt,
            'id'  => $id,
        ]);
    }

    public static function deleteById(int $id): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف العنوان غير صالح.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('DELETE FROM `addresses` WHERE `id` = :id');
        $st->execute(['id' => $id]);
        if ($st->rowCount() < 1) {
            throw new RuntimeException('العنوان غير موجود أو حُذف مسبقاً.');
        }
    }

    private static function roundDecimal7(float $v): string
    {
        return number_format($v, 7, '.', '');
    }
}
