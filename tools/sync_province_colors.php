<?php
/**
 * Apply migration 011 + sync province colors to states and boundaries.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use App\Database;
use App\Models\Boundary;

$pdo = Database::getInstance()->getPdo();
$sql = file_get_contents(dirname(__DIR__) . '/database/migrations/011_states_color.sql');
if ($sql !== false) {
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
        if ($stmt === '' || stripos($stmt, 'USE ') === 0) {
            continue;
        }
        try {
            $pdo->exec($stmt);
        } catch (Throwable $e) {
            echo "SQL note: {$e->getMessage()}\n";
        }
    }
}

$defaults = Boundary::defaultProvinceColors();
foreach ($pdo->query('SELECT id, code FROM states ORDER BY id ASC') as $row) {
    $letter = strtoupper(trim((string) ($row['code'] ?? '')));
    if ($letter === '' || !isset($defaults[$letter])) {
        continue;
    }
    Boundary::setProvinceColor((int) $row['id'], $defaults[$letter]);
    echo "Synced state {$letter} → {$defaults[$letter]}\n";
}

echo "Done. Current colors: " . json_encode(Boundary::provinceColors(), JSON_UNESCAPED_UNICODE) . "\n";
