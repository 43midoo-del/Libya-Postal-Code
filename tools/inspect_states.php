<?php
declare(strict_types=1);
require dirname(__DIR__) . '/includes/bootstrap.php';
$pdo = App\Database::getInstance()->getPdo();
echo "=== states ===\n";
foreach ($pdo->query('SELECT id, name, code, color FROM states ORDER BY id') as $r) {
    echo json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
}
echo "=== state boundaries ===\n";
foreach ($pdo->query("SELECT entity_id, code, LENGTH(geojson) AS gj_len, color FROM boundaries WHERE level='state'") as $r) {
    echo json_encode($r) . "\n";
}
