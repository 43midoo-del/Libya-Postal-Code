<?php
/** One-off: run `php scripts/test-db.php` to verify MySQL from project config. */
declare(strict_types=1);

$root = dirname(__DIR__);
require $root . '/includes/bootstrap.php';

try {
    $c = require $root . '/config/database.php';
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $c['host'],
        (int) $c['port'],
        $c['database'],
        $c['charset']
    );
    $pdo = new PDO($dsn, $c['username'], $c['password']);
    echo "Connection OK: {$c['database']} @ {$c['host']}:{$c['port']}\n";
} catch (Throwable $e) {
    fwrite(STDERR, "FAIL: " . $e->getMessage() . "\n");
    exit(1);
}
