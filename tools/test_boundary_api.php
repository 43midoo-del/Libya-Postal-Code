<?php
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use App\Database;

$pdo = Database::getInstance()->getPdo();
echo "states: " . $pdo->query('SELECT COUNT(*) FROM states')->fetchColumn() . PHP_EOL;

try {
    $cols = $pdo->query('SHOW COLUMNS FROM regions')->fetchAll(PDO::FETCH_COLUMN);
    echo "regions cols: " . implode(', ', $cols) . PHP_EOL;
} catch (Throwable $e) {
    echo "regions ERR: " . $e->getMessage() . PHP_EOL;
}

$geoPath = dirname(__DIR__) . '/data/libya-shabiyat.geojson';
echo "geojson: " . (is_file($geoPath) ? 'ok' : 'MISSING') . PHP_EOL;
