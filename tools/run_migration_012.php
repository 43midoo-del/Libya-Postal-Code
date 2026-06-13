<?php
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use App\Database;

$pdo = Database::getInstance()->getPdo();
$sql = file_get_contents(dirname(__DIR__) . '/database/migrations/012_areas_parent_area.sql');
$parts = preg_split('/;\s*\n/', $sql) ?: [];
foreach ($parts as $chunk) {
    $q = trim($chunk);
    if ($q === '' || str_starts_with($q, 'USE ') || str_contains($q, 'PREPARE stmt')) {
        continue;
    }
    if (str_starts_with($q, 'SET @')) {
        continue;
    }
    try {
        $pdo->exec($q);
        echo 'OK: ' . substr(str_replace("\n", ' ', $q), 0, 80) . PHP_EOL;
    } catch (Throwable $e) {
        echo 'ERR: ' . $e->getMessage() . PHP_EOL;
    }
}

// Manual migration steps (idempotent)
try {
    $pdo->exec(
        'ALTER TABLE areas
         ADD COLUMN parent_area_id INT UNSIGNED NULL DEFAULT NULL AFTER city_id,
         ADD KEY idx_areas_parent_area (parent_area_id)'
    );
    echo 'ALTER OK' . PHP_EOL;
} catch (Throwable $e) {
    echo 'ALTER: ' . $e->getMessage() . PHP_EOL;
}

try {
    $pdo->exec(
        'UPDATE areas mg
         INNER JOIN areas bl ON bl.city_id = mg.city_id AND bl.code = \'BL\'
         SET mg.parent_area_id = bl.id
         WHERE mg.code = \'MG\' AND mg.name = \'المغار\' AND mg.parent_area_id IS NULL'
    );
    echo 'UPDATE MG OK' . PHP_EOL;
} catch (Throwable $e) {
    echo 'UPDATE: ' . $e->getMessage() . PHP_EOL;
}

$st = $pdo->query(
    'SELECT mg.id, mg.name, mg.code, mg.parent_area_id, bl.name AS parent_name
     FROM areas mg LEFT JOIN areas bl ON bl.id = mg.parent_area_id
     WHERE mg.code = \'MG\' LIMIT 1'
);
$row = $st->fetch(PDO::FETCH_ASSOC);
echo json_encode($row, JSON_UNESCAPED_UNICODE) . PHP_EOL;
