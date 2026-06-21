<?php
declare(strict_types=1);
require dirname(__DIR__) . '/includes/bootstrap.php';
$pdo = App\Database::getInstance()->getPdo();

foreach (['kind', 'parent_area_id', 'code', 'lat', 'lng'] as $col) {
    $st = $pdo->query("SHOW COLUMNS FROM areas LIKE '$col'");
    echo $col . ': ' . ($st->fetch() ? 'yes' : 'NO') . "\n";
}

try {
    $sql = 'SELECT a.id, a.name, a.code, a.city_id AS parent_id, a.kind, a.parent_area_id,
            (SELECT COUNT(*) FROM boundaries b WHERE b.level = \'area\' AND b.entity_id = a.id) AS has_boundary,
            (SELECT COUNT(*) FROM areas c WHERE c.parent_area_id = a.id) AS child_count
            FROM areas a WHERE a.city_id = 123 ORDER BY a.id ASC';
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    echo 'rows: ' . count($rows) . "\n";
} catch (Throwable $e) {
    echo 'ERR: ' . $e->getMessage() . "\n";
}
