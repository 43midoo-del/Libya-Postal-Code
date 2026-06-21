<?php
/**
 * Read-only aggregates for the dashboard. All queries are parameterless to keep
 * them safe and cacheable.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;
use PDO;

final class Statistics
{
    public static function countUsers(): int
    {
        return self::scalarCount('SELECT COUNT(*) AS c FROM users');
    }

    public static function countAddresses(): int
    {
        return self::scalarCount('SELECT COUNT(*) AS c FROM addresses');
    }

    public static function countStates(): int
    {
        return self::scalarCount('SELECT COUNT(*) AS c FROM states');
    }

    public static function countActiveShabiyat(): int
    {
        return self::scalarCount(
            "SELECT COUNT(DISTINCT shabiya) AS c FROM addresses WHERE shabiya IS NOT NULL AND shabiya <> ''"
        );
    }

    /**
     * @return list<array{key:string, label:string, count:int}>
     */
    public static function countByWilayah(): array
    {
        $labels = [
            'barqa'        => 'برقة',
            'tripolitania' => 'طرابلس',
            'fezzan'       => 'فزان',
        ];
        $pdo = Database::getInstance()->getPdo();
        $rows = $pdo->query(
            "SELECT wilayah AS k, COUNT(*) AS c
             FROM addresses
             WHERE wilayah IS NOT NULL AND wilayah <> ''
             GROUP BY wilayah ORDER BY c DESC"
        )->fetchAll(PDO::FETCH_ASSOC);
        $byKey = [];
        foreach ($rows as $r) {
            $byKey[(string) $r['k']] = (int) $r['c'];
        }
        $out = [];
        foreach ($labels as $key => $lbl) {
            $out[] = [
                'key'   => $key,
                'label' => $lbl,
                'count' => $byKey[$key] ?? 0,
            ];
        }
        return $out;
    }

    /**
     * @return list<array{name:string, count:int}>
     */
    public static function countByShabiya(): array
    {
        $pdo = Database::getInstance()->getPdo();
        $rows = $pdo->query(
            "SELECT shabiya AS n, COUNT(*) AS c
             FROM addresses
             WHERE shabiya IS NOT NULL AND shabiya <> ''
             GROUP BY shabiya
             ORDER BY c DESC"
        )->fetchAll(PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) {
            $out[] = ['name' => (string) $r['n'], 'count' => (int) $r['c']];
        }
        return $out;
    }

    /**
     * @return list<array{key:string, label:string, count:int}>
     */
    public static function countByType(): array
    {
        $labels = [
            'residential' => 'سكني',
            'government'  => 'حكومي',
            'commercial'  => 'تجاري',
        ];
        $pdo = Database::getInstance()->getPdo();
        $rows = $pdo->query(
            "SELECT type AS k, COUNT(*) AS c FROM addresses GROUP BY type"
        )->fetchAll(PDO::FETCH_ASSOC);
        $byKey = [];
        foreach ($rows as $r) {
            $byKey[(string) $r['k']] = (int) $r['c'];
        }
        $out = [];
        foreach ($labels as $k => $lbl) {
            $out[] = ['key' => $k, 'label' => $lbl, 'count' => $byKey[$k] ?? 0];
        }
        foreach ($byKey as $k => $c) {
            if (!isset($labels[$k])) {
                $out[] = ['key' => $k, 'label' => $k, 'count' => $c];
            }
        }
        return $out;
    }

    /**
     * Counts of addresses created during the last 7 days (inclusive of today).
     *
     * @return list<array{date:string, count:int}>
     */
    public static function last7DaysSeries(): array
    {
        $pdo = Database::getInstance()->getPdo();
        $stmt = $pdo->query(
            "SELECT DATE(created_at) AS d, COUNT(*) AS c
             FROM addresses
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY DATE(created_at)"
        );
        $byDate = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $byDate[(string) $r['d']] = (int) $r['c'];
        }
        $out = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime('-' . $i . ' day'));
            $out[] = ['date' => $date, 'count' => $byDate[$date] ?? 0];
        }
        return $out;
    }

    /**
     * @return list<array{name:string, count:int}>
     */
    public static function topShabiyat(int $n = 10): array
    {
        $n = max(1, min(50, $n));
        $rows = self::countByShabiya();
        return array_slice($rows, 0, $n);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function recentAddresses(int $limit = 5): array
    {
        $limit = max(1, min(20, $limit));
        $pdo = Database::getInstance()->getPdo();
        $stmt = $pdo->prepare(
            'SELECT a.id, a.postal_code, a.owner_name, a.type, a.wilayah, a.shabiya, a.locality, a.created_at,
                    u.name AS created_by_name
             FROM addresses a
             LEFT JOIN users u ON u.id = a.created_by
             ORDER BY a.id DESC LIMIT :lim'
        );
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $out = [];
        while (($r = $stmt->fetch(PDO::FETCH_ASSOC)) !== false) {
            $out[] = [
                'id'          => (int) $r['id'],
                'postal_code' => (string) $r['postal_code'],
                'owner_name'  => isset($r['owner_name']) ? (string) $r['owner_name'] : '',
                'type'        => (string) $r['type'],
                'wilayah'     => isset($r['wilayah']) ? (string) $r['wilayah'] : '',
                'shabiya'     => isset($r['shabiya']) ? (string) $r['shabiya'] : '',
                'locality'    => isset($r['locality']) ? (string) $r['locality'] : '',
                'created_at'  => isset($r['created_at']) ? (string) $r['created_at'] : '',
                'created_by_name' => isset($r['created_by_name']) && $r['created_by_name'] !== null
                    ? (string) $r['created_by_name']
                    : '',
            ];
        }
        return $out;
    }

    private static function scalarCount(string $sql): int
    {
        $pdo = Database::getInstance()->getPdo();
        $value = $pdo->query($sql)->fetchColumn();
        return (int) $value;
    }
}
