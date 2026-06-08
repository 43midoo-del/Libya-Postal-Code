<?php
/**
 * City (المدينة): third level, belongs to a region.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use PDO;
use RuntimeException;

final class City
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly int $regionId,
        public readonly ?string $regionName = null,
    ) {
    }

    /**
     * @param array{region_id?:int} $filter
     * @return list<self>
     */
    public static function all(array $filter = []): array
    {
        $sql = 'SELECT c.id, c.name, c.region_id, r.name AS region_name
                FROM cities c LEFT JOIN regions r ON r.id = c.region_id';
        $where = [];
        $params = [];
        if (isset($filter['region_id']) && (int) $filter['region_id'] > 0) {
            $where[] = 'c.region_id = :rid';
            $params['rid'] = (int) $filter['region_id'];
        }
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY c.id ASC';
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
                (int) $r['region_id'],
                isset($r['region_name']) ? (string) $r['region_name'] : null,
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
            'SELECT c.id, c.name, c.region_id, r.name AS region_name
             FROM cities c LEFT JOIN regions r ON r.id = c.region_id WHERE c.id = :id LIMIT 1'
        );
        $st->execute(['id' => $id]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if ($r === false) {
            return null;
        }
        return new self(
            (int) $r['id'],
            (string) $r['name'],
            (int) $r['region_id'],
            isset($r['region_name']) ? (string) $r['region_name'] : null,
        );
    }

    public static function create(string $name, int $regionId): int
    {
        $name = self::sanitize($name);
        if ($regionId < 1 || Region::find($regionId) === null) {
            throw new RuntimeException('الشعبية المرتبطة غير صالحة.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('INSERT INTO cities (name, region_id) VALUES (:n, :r)');
        $st->execute(['n' => $name, 'r' => $regionId]);
        return (int) $pdo->lastInsertId();
    }

    public static function update(int $id, string $name, int $regionId): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف المدينة غير صالح.');
        }
        $name = self::sanitize($name);
        if ($regionId < 1 || Region::find($regionId) === null) {
            throw new RuntimeException('الشعبية المرتبطة غير صالحة.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('UPDATE cities SET name = :n, region_id = :r WHERE id = :id');
        $st->execute(['n' => $name, 'r' => $regionId, 'id' => $id]);
    }

    public static function delete(int $id): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف المدينة غير صالح.');
        }
        $pdo = Database::getInstance()->getPdo();
        try {
            $st  = $pdo->prepare('DELETE FROM cities WHERE id = :id');
            $st->execute(['id' => $id]);
            if ($st->rowCount() < 1) {
                throw new RuntimeException('المدينة غير موجودة.');
            }
        } catch (\PDOException $e) {
            throw new RuntimeException('لا يمكن حذف مدينة لها مناطق مرتبطة.', 0, $e);
        }
    }

    private static function sanitize(string $name): string
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 120) {
            throw new RuntimeException('اسم المدينة مطلوب (حتى 120 حرفاً).');
        }
        return $name;
    }
}
