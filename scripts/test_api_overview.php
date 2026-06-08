<?php
declare(strict_types=1);
require dirname(__DIR__) . '/includes/bootstrap.php';

$pdo = App\Database::getInstance()->getPdo();

try {
    $pdo->query('SELECT id, name, state_id, code FROM regions LIMIT 1')->fetch();
    echo "regions.code query: OK\n";
} catch (Throwable $e) {
    echo "regions.code query FAIL: " . $e->getMessage() . "\n";
}

$path = dirname(__DIR__) . '/data/libya-shabiyat.geojson';
echo 'geojson: ' . (is_file($path) ? 'yes' : 'NO') . "\n";
