<?php
/**
 * One-shot: update wilayah/shabiya boundary colors in DB.
 * B برقة = red, T طرابلس = green, F فزان = light gray.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use App\Database;

const COLORS = [
    'B' => '#ef4444',
    'T' => '#22c55e',
    'F' => '#cbd5e1',
];

$pdo = Database::getInstance()->getPdo();

$stateStmt = $pdo->query('SELECT id, code FROM states ORDER BY id ASC');
$stateCount = 0;
while ($row = $stateStmt->fetch(PDO::FETCH_ASSOC)) {
    $letter = strtoupper(trim((string) ($row['code'] ?? '')));
    if (!isset(COLORS[$letter])) {
        continue;
    }
    $color = COLORS[$letter];
    $id = (int) $row['id'];
    $upd = $pdo->prepare(
        'UPDATE boundaries SET color = :color WHERE level = "state" AND entity_id = :id'
    );
    $upd->execute(['color' => $color, 'id' => $id]);
    if ($upd->rowCount() > 0) {
        $stateCount += $upd->rowCount();
        echo "state #{$id} ({$letter}) → {$color}\n";
    } else {
        echo "state #{$id} ({$letter}): no boundary row (skipped)\n";
    }
}

$regionStmt = $pdo->query(
    'SELECT b.id, b.entity_id, COALESCE(b.code, r.code) AS code
     FROM boundaries b
     INNER JOIN regions r ON r.id = b.entity_id
     WHERE b.level = "region"'
);
$regionCount = 0;
$updRegion = $pdo->prepare('UPDATE boundaries SET color = :color WHERE id = :id');
while ($row = $regionStmt->fetch(PDO::FETCH_ASSOC)) {
    $code = strtoupper(trim((string) ($row['code'] ?? '')));
    $letter = $code !== '' ? $code[0] : '';
    if (!isset(COLORS[$letter])) {
        continue;
    }
    $color = COLORS[$letter];
    $updRegion->execute(['color' => $color, 'id' => (int) $row['id']]);
    if ($updRegion->rowCount() > 0) {
        $regionCount++;
        echo "region boundary #{$row['entity_id']} ({$code}) → {$color}\n";
    }
}

echo "\nDone: {$stateCount} state(s), {$regionCount} region(s) updated.\n";
