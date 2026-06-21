<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$pdo = new PDO('sqlite:' . (new App\MBTilesService())->path());
$st = $pdo->query(
    'SELECT zoom_level, COUNT(*) AS c FROM tiles WHERE length(tile_data) BETWEEN 5500 AND 5999 GROUP BY zoom_level ORDER BY zoom_level'
);
while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
    echo 'z' . $r['zoom_level'] . ': ' . $r['c'] . PHP_EOL;
}
