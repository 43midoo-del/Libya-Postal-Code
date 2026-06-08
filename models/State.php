<?php
/**
 * State (الولاية): top administrative division.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use PDO;
use RuntimeException;

final class State
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly string $code,
    ) {
    }

    /** @return list<self> */
    public static function all(): array
    {
        $pdo = Database::getInstance()->getPdo();
        $rows = $pdo->query('SELECT id, name, code FROM states ORDER BY id ASC')
            ->fetchAll(PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) {
            $out[] = new self((int) $r['id'], (string) $r['name'], (string) $r['code']);
        }
        return $out;
    }

    public static function find(int $id): ?self
    {
        if ($id < 1) {
            return null;
        }
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('SELECT id, name, code FROM states WHERE id = :id LIMIT 1');
        $st->execute(['id' => $id]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if ($r === false) {
            return null;
        }
        return new self((int) $r['id'], (string) $r['name'], (string) $r['code']);
    }

    public static function create(string $name, string $code): int
    {
        [$name, $code] = self::sanitize($name, $code);
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('INSERT INTO states (name, code) VALUES (:n, :c)');
        try {
            $st->execute(['n' => $name, 'c' => $code]);
        } catch (\PDOException $e) {
            throw self::translatePdoError($e);
        }
        return (int) $pdo->lastInsertId();
    }

    public static function update(int $id, string $name, string $code): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف الولاية غير صالح.');
        }
        [$name, $code] = self::sanitize($name, $code);
        $pdo = Database::getInstance()->getPdo();
        $st  = $pdo->prepare('UPDATE states SET name = :n, code = :c WHERE id = :id');
        try {
            $st->execute(['n' => $name, 'c' => $code, 'id' => $id]);
        } catch (\PDOException $e) {
            throw self::translatePdoError($e);
        }
    }

    public static function delete(int $id): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف الولاية غير صالح.');
        }
        $pdo = Database::getInstance()->getPdo();
        try {
            $st  = $pdo->prepare('DELETE FROM states WHERE id = :id');
            $st->execute(['id' => $id]);
            if ($st->rowCount() < 1) {
                throw new RuntimeException('الولاية غير موجودة.');
            }
        } catch (\PDOException $e) {
            throw new RuntimeException('لا يمكن حذف ولاية لها شعبيات/مناطق مرتبطة.', 0, $e);
        }
    }

    /**
     * @return array{0:string,1:string}
     */
    private static function sanitize(string $name, string $code): array
    {
        $name = trim($name);
        $code = strtoupper(trim($code));
        if ($name === '' || mb_strlen($name) > 120) {
            throw new RuntimeException('اسم الولاية مطلوب (حتى 120 حرفاً).');
        }
        if ($code === '' || strlen($code) > 5) {
            throw new RuntimeException('رمز الولاية مطلوب (حتى 5 خانات لاتينية).');
        }
        return [$name, $code];
    }

    private static function translatePdoError(\PDOException $e): RuntimeException
    {
        $msg = $e->getMessage();
        if (str_contains($msg, 'uk_states_name')) {
            return new RuntimeException('اسم الولاية مستخدم مسبقاً.', 0, $e);
        }
        if (str_contains($msg, 'uk_states_code')) {
            return new RuntimeException('رمز الولاية مستخدم مسبقاً.', 0, $e);
        }
        return new RuntimeException('تعذّر حفظ الولاية.', 0, $e);
    }
}
