<?php
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use App\Database;
use App\SessionAuth;

SessionAuth::start();
$_SESSION['auth_user_id'] = 1;
$_SESSION['auth_user_name'] = 'Test';
$_SESSION['auth_user_email'] = 'test@test.com';
$_SESSION['auth_user_role'] = 'admin';

$pdo = Database::getInstance()->getPdo();

// Simulate fetchEntityRows logic
$hasBoundaries = false;
try {
    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = :t'
    );
    $st->execute(['t' => 'boundaries']);
    $hasBoundaries = (int) $st->fetchColumn() > 0;
} catch (Throwable $e) {
    echo "tableExists ERR: " . $e->getMessage() . PHP_EOL;
}

echo "hasBoundaries: " . ($hasBoundaries ? 'yes' : 'no') . PHP_EOL;

$bCount = $hasBoundaries
    ? '(SELECT COUNT(*) FROM boundaries b WHERE b.level = \'state\' AND b.entity_id = s.id) AS has_boundary'
    : '0 AS has_boundary';

try {
    $rows = $pdo->query(
        'SELECT s.id, s.name, s.code, NULL AS parent_id, ' . $bCount . '
         FROM states s ORDER BY s.id ASC'
    )->fetchAll(PDO::FETCH_ASSOC) ?: [];
    echo 'state rows: ' . count($rows) . PHP_EOL;
    echo json_encode($rows, JSON_UNESCAPED_UNICODE) . PHP_EOL;
} catch (Throwable $e) {
    echo 'state query ERR: ' . $e->getMessage() . PHP_EOL;
}

// apiOverview output size
ob_start();
(new \App\Controllers\BoundaryEditorController())->apiOverview();
$out = ob_get_clean();
$data = json_decode($out, true);
echo 'overview ok: ' . (($data['ok'] ?? false) ? 'yes' : 'no') . PHP_EOL;
if (!($data['ok'] ?? false)) {
    echo 'overview msg: ' . ($data['message'] ?? 'unknown') . PHP_EOL;
    echo 'overview raw head: ' . substr($out, 0, 300) . PHP_EOL;
} else {
    $sf = count($data['states']['features'] ?? []);
    $rf = count($data['regions']['features'] ?? []);
    echo "state features: $sf, region features: $rf" . PHP_EOL;
}
