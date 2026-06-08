<?php
/**
 * Street (شارع): optional polyline tied to an area (neighborhood).
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use PDO;
use RuntimeException;

final class Street
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly int $areaId,
        public readonly ?string $code = null,
        public readonly ?string $areaName = null,
    ) {
    }

    /**
     * @param array{area_id?:int} $filter
     * @return list<self>
     */
    public static function all(array $filter = []): array
    {
        $sql = 'SELECT s.id, s.name, s.area_id, s.code, a.name AS area_name
                FROM streets s LEFT JOIN areas a ON a.id = s.area_id';
        $where = [];
        $params = [];
        if (isset($filter['area_id']) && (int) $filter['area_id'] > 0) {
            $where[] = 's.area_id = :aid';
            $params['aid'] = (int) $filter['area_id'];
        }
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY s.id ASC';
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
                (int) $r['area_id'],
                $r['code'] !== null ? (string) $r['code'] : null,
                isset($r['area_name']) ? (string) $r['area_name'] : null,
            );
        }
        return $out;
    }

    public static function create(string $name, int $areaId, ?string $code, ?int $createdBy): int
    {
        $name = self::sanitize($name);
        if ($areaId < 1 || Area::find($areaId) === null) {
            throw new RuntimeException('المنطقة (الحي) المرتبطة غير صالحة.');
        }
        if ($code !== null && $code !== '' && !preg_match('/^[A-Za-z0-9]{1,8}$/', $code)) {
            throw new RuntimeException('رمز الشارع يقبل 1–8 خانات أبجدرقمية فقط.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare(
            'INSERT INTO streets (name, area_id, code, created_by) VALUES (:n, :a, :c, :u)'
        );
        $st->execute([
            'n' => $name,
            'a' => $areaId,
            'c' => ($code === null || $code === '') ? null : strtoupper($code),
            'u' => $createdBy,
        ]);
        return (int) $pdo->lastInsertId();
    }

    public static function update(int $id, string $name, int $areaId, ?string $code): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف الشارع غير صالح.');
        }
        $name = self::sanitize($name);
        if ($areaId < 1 || Area::find($areaId) === null) {
            throw new RuntimeException('المنطقة (الحي) المرتبطة غير صالحة.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('UPDATE streets SET name = :n, area_id = :a, code = :c WHERE id = :id');
        $st->execute([
            'n' => $name,
            'a' => $areaId,
            'c' => ($code === null || $code === '') ? null : strtoupper($code),
            'id' => $id,
        ]);
    }

    public static function delete(int $id): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف الشارع غير صالح.');
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('DELETE FROM streets WHERE id = :id');
        $st->execute(['id' => $id]);
    }

    private static function sanitize(string $name): string
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 160) {
            throw new RuntimeException('اسم الشارع مطلوب (حتى 160 حرفاً).');
        }
        return $name;
    }
}
