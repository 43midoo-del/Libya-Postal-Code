<?php
/**
 * Area (المنطقة الصغرى): leaf of geo hierarchy; addresses link to one area_id.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use PDO;
use PDOException;
use RuntimeException;

final class Area
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly int $cityId,
        public readonly ?string $cityName = null,
    ) {
    }

    /**
     * @param array{city_id?:int} $filter
     * @return list<self>
     */
    public static function all(array $filter = []): array
    {
        $sql = 'SELECT a.id, a.name, a.city_id, c.name AS city_name
                FROM areas a LEFT JOIN cities c ON c.id = a.city_id';
        $where = [];
        $params = [];
        if (isset($filter['city_id']) && (int) $filter['city_id'] > 0) {
            $where[] = 'a.city_id = :cid';
            $params['cid'] = (int) $filter['city_id'];
        }
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY a.id ASC';
        $pdo = Database::getInstance()->getPdo();
        $st = $pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $st->bindValue(':' . $k, $v, PDO::PARAM_INT);
        }
        $st->execute();
        $out = [];
        while (($r = $st->fetch(PDO::FETCH_ASSOC)) !== false) {
            $out[] = new self(
                (int) $r['id'],
                (string) $r['name'],
                (int) $r['city_id'],
                isset($r['city_name']) ? (string) $r['city_name'] : null,
            );
        }
        return $out;
    }

    public static function find(int $id): ?self
    {
        if ($id < 1) {
            return null;
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare(
            'SELECT a.id, a.name, a.city_id, c.name AS city_name
             FROM areas a LEFT JOIN cities c ON c.id = a.city_id WHERE a.id = :id LIMIT 1'
        );
        $st->execute(['id' => $id]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if ($r === false) {
            return null;
        }
        return new self(
            (int) $r['id'],
            (string) $r['name'],
            (int) $r['city_id'],
            isset($r['city_name']) ? (string) $r['city_name'] : null,
        );
    }

    public static function create(string $name, int $cityId): int
    {
        return self::createWithCoords($name, $cityId, null, null, null);
    }

    public static function createWithCoords(
        string $name,
        int $cityId,
        ?float $lat,
        ?float $lng,
        ?string $code,
        string $kind = 'neighborhood'
    ): int {
        $name = self::sanitize($name);
        if ($cityId < 1 || City::find($cityId) === null) {
            throw new RuntimeException('المدينة المرتبطة غير صالحة.');
        }
        $code = $code !== null && $code !== '' ? strtoupper(trim($code)) : null;
        if ($code !== null && !preg_match('/^[A-Za-z0-9]{1,8}$/', $code)) {
            throw new RuntimeException('رمز الحي يقبل 1–8 خانات أبجدرقمية فقط.');
        }
        $kind = trim($kind) !== '' ? trim($kind) : 'neighborhood';
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('INSERT INTO areas (name, city_id) VALUES (:n, :c)');
        $st->execute(['n' => $name, 'c' => $cityId]);
        $id = (int) $pdo->lastInsertId();
        if ($id < 1) {
            throw new RuntimeException('تعذّر إنشاء الحي.');
        }
        $upd = $pdo->prepare(
            'UPDATE areas SET lat = :lat, lng = :lng, code = :code, kind = :k WHERE id = :id'
        );
        try {
            $upd->execute([
                'lat'  => $lat,
                'lng'  => $lng,
                'code' => $code,
                'k'    => $kind,
                'id'   => $id,
            ]);
        } catch (PDOException) {
            /* قواعد قديمة بلا أعمدة lat/lng — يبقى الربط الهرمي عبر city_id */
        }

        return $id;
    }

    public static function update(int $id, string $name, int $cityId): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف المنطقة غير صالح.');
        }
        $name = self::sanitize($name);
        if ($cityId < 1 || City::find($cityId) === null) {
            throw new RuntimeException('المدينة المرتبطة غير صالحة.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('UPDATE areas SET name = :n, city_id = :c WHERE id = :id');
        $st->execute(['n' => $name, 'c' => $cityId, 'id' => $id]);
    }

    public static function delete(int $id): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف المنطقة غير صالح.');
        }
        $pdo = Database::getInstance()->getPdo();
        try {
            $st  = $pdo->prepare('DELETE FROM areas WHERE id = :id');
            $st->execute(['id' => $id]);
            if ($st->rowCount() < 1) {
                throw new RuntimeException('المنطقة غير موجودة.');
            }
        } catch (\PDOException $e) {
            throw new RuntimeException('لا يمكن حذف منطقة مرتبطة بعناوين مسجّلة.', 0, $e);
        }
    }

    private static function sanitize(string $name): string
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 120) {
            throw new RuntimeException('اسم المنطقة مطلوب (حتى 120 حرفاً).');
        }
        return $name;
    }
}
