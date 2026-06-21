<?php
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use App\Database;

$pdo = Database::getInstance()->getPdo();
$sql = file_get_contents(dirname(__DIR__) . '/database/migrations/014_address_parcel.sql');
$parts = preg_split('/;\s*\n/', $sql) ?: [];
foreach ($parts as $chunk) {
    $q = trim($chunk);
    if ($q === '' || str_starts_with($q, 'USE ')) {
        continue;
    }
    try {
        $pdo->exec($q);
        echo 'OK: ' . substr(str_replace("\n", ' ', $q), 0, 90) . PHP_EOL;
    } catch (Throwable $e) {
        echo 'ERR: ' . $e->getMessage() . PHP_EOL;
    }
}

$st = $pdo->query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'addresses\'
       AND COLUMN_NAME IN (\'parcel_geojson\', \'parcel_desc\')'
);
echo 'Columns: ' . json_encode($st->fetchAll(PDO::FETCH_COLUMN)) . PHP_EOL;
