<?php
/**
 * User model: identity object + CRUD used by user management & profile pages.
 *
 * Roles managed strictly server-side: admin | employee | citizen.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use PDO;
use RuntimeException;

final class User
{
    public const ROLES = ['admin', 'employee', 'citizen'];

    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly string $email,
        public readonly string $passwordHash,
        public readonly string $role,
        public readonly ?string $createdAt = null,
        public readonly ?string $updatedAt = null,
    ) {
    }

    public static function roleLabelAr(string $role): string
    {
        return match ($role) {
            'admin'    => 'مدير',
            'employee' => 'موظف',
            'citizen'  => 'مواطن',
            default    => $role,
        };
    }

    public static function findByEmail(string $email): ?self
    {
        $email = trim(strtolower($email));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return null;
        }
        $pdo = Database::getInstance()->getPdo();
        $stmt = $pdo->prepare(self::selectColumns() . ' FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        return self::fromRow($row);
    }

    public static function findById(int $id): ?self
    {
        if ($id < 1) {
            return null;
        }
        $pdo = Database::getInstance()->getPdo();
        $stmt = $pdo->prepare(self::selectColumns() . ' FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        return self::fromRow($row);
    }

    /**
     * Paginated list with optional role / search filter.
     *
     * @param array{role?: string, q?: string} $filter
     * @return list<self>
     */
    public static function all(array $filter = []): array
    {
        $pdo = Database::getInstance()->getPdo();
        $where  = [];
        $params = [];
        $role = isset($filter['role']) ? trim((string) $filter['role']) : '';
        if ($role !== '' && in_array($role, self::ROLES, true)) {
            $where[] = 'role = :role';
            $params['role'] = $role;
        }
        $q = isset($filter['q']) ? trim((string) $filter['q']) : '';
        if ($q !== '') {
            $like = '%' . str_replace(['%', '_', '\\'], '', $q) . '%';
            $where[] = '(name LIKE :q OR email LIKE :q)';
            $params['q'] = $like;
        }
        $whereSql = $where === [] ? '' : (' WHERE ' . implode(' AND ', $where));
        $sql = self::selectColumns() . ' FROM users' . $whereSql . ' ORDER BY id DESC';
        $stmt = $pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue(':' . $k, $v, PDO::PARAM_STR);
        }
        $stmt->execute();
        $out = [];
        while (($r = $stmt->fetch(PDO::FETCH_ASSOC)) !== false) {
            $out[] = self::fromRow($r);
        }
        return $out;
    }

    /**
     * Create a new user (password is hashed internally).
     */
    public static function create(string $name, string $email, string $plainPassword, string $role): int
    {
        $name  = trim($name);
        $email = trim(strtolower($email));
        $role  = trim($role);
        if ($name === '' || mb_strlen($name) > 120) {
            throw new RuntimeException('الاسم مطلوب (حتى 120 حرفاً).');
        }
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) {
            throw new RuntimeException('البريد الإلكتروني غير صالح.');
        }
        if (!in_array($role, self::ROLES, true)) {
            throw new RuntimeException('الدور المحدد غير صالح.');
        }
        if (strlen($plainPassword) < 6) {
            throw new RuntimeException('كلمة المرور قصيرة (6 خانات فأكثر).');
        }
        $pdo = Database::getInstance()->getPdo();
        if (self::emailExists($email)) {
            throw new RuntimeException('البريد الإلكتروني مستخدم مسبقاً.');
        }
        $hash = password_hash($plainPassword, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare(
            'INSERT INTO users (name, email, password, role) VALUES (:n, :e, :p, :r)'
        );
        $stmt->execute([
            'n' => $name,
            'e' => $email,
            'p' => $hash,
            'r' => $role,
        ]);
        return (int) $pdo->lastInsertId();
    }

    /**
     * Update name, email and role; optionally change password if plainPassword provided.
     */
    public static function update(int $id, string $name, string $email, string $role, ?string $plainPassword = null): void
    {
        $cur = self::findById($id);
        if ($cur === null) {
            throw new RuntimeException('المستخدم غير موجود.');
        }
        $name  = trim($name);
        $email = trim(strtolower($email));
        if ($name === '' || mb_strlen($name) > 120) {
            throw new RuntimeException('الاسم مطلوب (حتى 120 حرفاً).');
        }
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) {
            throw new RuntimeException('البريد الإلكتروني غير صالح.');
        }
        if (!in_array($role, self::ROLES, true)) {
            throw new RuntimeException('الدور المحدد غير صالح.');
        }
        if ($email !== $cur->email && self::emailExists($email)) {
            throw new RuntimeException('البريد الإلكتروني مستخدم مسبقاً.');
        }
        $pdo = Database::getInstance()->getPdo();
        if ($plainPassword !== null && $plainPassword !== '') {
            if (strlen($plainPassword) < 6) {
                throw new RuntimeException('كلمة المرور قصيرة (6 خانات فأكثر).');
            }
            $hash = password_hash($plainPassword, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare(
                'UPDATE users SET name = :n, email = :e, role = :r, password = :p WHERE id = :id'
            );
            $stmt->execute(['n' => $name, 'e' => $email, 'r' => $role, 'p' => $hash, 'id' => $id]);
        } else {
            $stmt = $pdo->prepare(
                'UPDATE users SET name = :n, email = :e, role = :r WHERE id = :id'
            );
            $stmt->execute(['n' => $name, 'e' => $email, 'r' => $role, 'id' => $id]);
        }
    }

    public static function delete(int $id): void
    {
        if ($id < 1) {
            throw new RuntimeException('مُعرف المستخدم غير صالح.');
        }
        $pdo = Database::getInstance()->getPdo();
        $stmt = $pdo->prepare('DELETE FROM users WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if ($stmt->rowCount() < 1) {
            throw new RuntimeException('المستخدم غير موجود أو حُذف مسبقاً.');
        }
    }

    public static function changePassword(int $id, string $currentPassword, string $newPassword): void
    {
        $user = self::findById($id);
        if ($user === null) {
            throw new RuntimeException('المستخدم غير موجود.');
        }
        if (!password_verify($currentPassword, $user->passwordHash)) {
            throw new RuntimeException('كلمة المرور الحالية غير صحيحة.');
        }
        if (strlen($newPassword) < 6) {
            throw new RuntimeException('كلمة المرور الجديدة قصيرة (6 خانات فأكثر).');
        }
        $pdo = Database::getInstance()->getPdo();
        $hash = password_hash($newPassword, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('UPDATE users SET password = :p WHERE id = :id');
        $stmt->execute(['p' => $hash, 'id' => $id]);
    }

    public static function updateOwnProfile(int $id, string $name, string $email): void
    {
        $cur = self::findById($id);
        if ($cur === null) {
            throw new RuntimeException('المستخدم غير موجود.');
        }
        self::update($id, $name, $email, $cur->role, null);
    }

    public static function emailExists(string $email): bool
    {
        $email = trim(strtolower($email));
        if ($email === '') {
            return false;
        }
        $pdo = Database::getInstance()->getPdo();
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :e LIMIT 1');
        $stmt->execute(['e' => $email]);
        return $stmt->fetch(PDO::FETCH_ASSOC) !== false;
    }

    /**
     * Build SELECT column list that includes updated_at only if the column exists.
     * Allows older installations (pre-Phase 1 migration) to keep working.
     */
    private static function selectColumns(): string
    {
        $hasUpdated = self::hasUpdatedAtColumn();
        $cols = 'id, name, email, password, role, created_at';
        $cols .= $hasUpdated ? ', updated_at' : ', NULL AS updated_at';
        return 'SELECT ' . $cols;
    }

    private static ?bool $hasUpdatedAt = null;

    private static function hasUpdatedAtColumn(): bool
    {
        if (self::$hasUpdatedAt !== null) {
            return self::$hasUpdatedAt;
        }
        try {
            $pdo = Database::getInstance()->getPdo();
            $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'updated_at'");
            self::$hasUpdatedAt = $stmt !== false && $stmt->fetch(PDO::FETCH_ASSOC) !== false;
        } catch (\Throwable) {
            self::$hasUpdatedAt = false;
        }
        return self::$hasUpdatedAt;
    }

    /**
     * @param array<string, mixed> $row
     */
    private static function fromRow(array $row): self
    {
        return new self(
            (int) $row['id'],
            (string) $row['name'],
            (string) $row['email'],
            (string) $row['password'],
            (string) $row['role'],
            isset($row['created_at']) ? (string) $row['created_at'] : null,
            isset($row['updated_at']) && $row['updated_at'] !== null ? (string) $row['updated_at'] : null,
        );
    }
}
