<?php
/**
 * Region (الشعبية / المنطقة الإدارية): second level, belongs to a state.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use PDO;
use RuntimeException;

final class Region
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly int $stateId,
        public readonly ?string $stateName = null,
    ) {
    }

    /**
     * @param array{state_id?:int} $filter
     * @return list<self>
     */
    public static function all(array $filter = []): array
    {
        $sql = 'SELECT r.id, r.name, r.state_id, s.name AS state_name
                FROM regions r
                LEFT JOIN states s ON s.id = r.state_id';
        $where = [];
        $params = [];
        if (isset($filter['state_id']) && (int) $filter['state_id'] > 0) {
            $where[] = 'r.state_id = :sid';
            $params['sid'] = (int) $filter['state_id'];
        }
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY r.id ASC';
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
                (int) $r['state_id'],
                isset($r['state_name']) ? (string) $r['state_name'] : null,
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
            'SELECT r.id, r.name, r.state_id, s.name AS state_name
             FROM regions r LEFT JOIN states s ON s.id = r.state_id WHERE r.id = :id LIMIT 1'
        );
        $st->execute(['id' => $id]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if ($r === false) {
            return null;
        }
        return new self(
            (int) $r['id'],
            (string) $r['name'],
            (int) $r['state_id'],
            isset($r['state_name']) ? (string) $r['state_name'] : null,
        );
    }

    public static function create(string $name, int $stateId): int
    {
        $name = self::sanitize($name);
        if ($stateId < 1 || State::find($stateId) === null) {
            throw new RuntimeException('الولاية المرتبطة غير صالحة.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('INSERT INTO regions (name, state_id) VALUES (:n, :s)');
        $st->execute(['n' => $name, 's' => $stateId]);
        return (int) $pdo->lastInsertId();
    }

    public static function update(int $id, string $name, int $stateId): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف الشعبية غير صالح.');
        }
        $name = self::sanitize($name);
        if ($stateId < 1 || State::find($stateId) === null) {
            throw new RuntimeException('الولاية المرتبطة غير صالحة.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('UPDATE regions SET name = :n, state_id = :s WHERE id = :id');
        $st->execute(['n' => $name, 's' => $stateId, 'id' => $id]);
    }

    public static function delete(int $id): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف الشعبية غير صالح.');
        }
        $pdo = Database::getInstance()->getPdo();
        try {
            $st  = $pdo->prepare('DELETE FROM regions WHERE id = :id');
            $st->execute(['id' => $id]);
            if ($st->rowCount() < 1) {
                throw new RuntimeException('الشعبية غير موجودة.');
            }
        } catch (\PDOException $e) {
            throw new RuntimeException('لا يمكن حذف شعبية لها مدن مرتبطة.', 0, $e);
        }
    }

    private static function sanitize(string $name): string
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 120) {
            throw new RuntimeException('اسم الشعبية مطلوب (حتى 120 حرفاً).');
        }
        return $name;
    }
}
