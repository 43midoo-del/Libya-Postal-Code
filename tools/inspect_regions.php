<?php
declare(strict_types=1);
require dirname(__DIR__) . '/includes/bootstrap.php';
$pdo = App\Database::getInstance()->getPdo();
echo "=== region boundaries count by state ===\n";
foreach ($pdo->query('SELECT s.code, COUNT(b.id) AS cnt FROM states s LEFT JOIN regions r ON r.state_id=s.id LEFT JOIN boundaries b ON b.level="region" AND b.entity_id=r.id GROUP BY s.id, s.code') as $r) {
    echo json_encode($r) . "\n";
}
echo "=== sample region colors for T ===\n";
foreach ($pdo->query('SELECT r.id, r.code, b.color FROM regions r LEFT JOIN boundaries b ON b.level="region" AND b.entity_id=r.id WHERE r.state_id=1 LIMIT 5') as $r) {
    echo json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
}
