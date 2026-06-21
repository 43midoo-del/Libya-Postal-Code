<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

const BLOCKED_SHA1 = '0cfb5f443183efc5921f61005aaa7f341fcfd143';

$svc = new MBTilesService();
$pdo = new PDO('sqlite:' . $svc->path());
$st = $pdo->query('SELECT zoom_level, tile_column, tile_row, length(tile_data) AS len FROM tiles WHERE zoom_level BETWEEN 5 AND 8 ORDER BY zoom_level, tile_column, tile_row');

while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $z = (int) $row['zoom_level'];
    $x = (int) $row['tile_column'];
    $y = (int) $row['tile_row'];
    $len = (int) $row['len'];
    $blob = $svc->getTileXYZ($z, $x, $y);
    if (!is_string($blob)) {
        continue;
    }
    $sha = sha1($blob);
    if ($len === 6987 || $sha === BLOCKED_SHA1 || $len < 1000) {
        echo "BAD z{$z}/{$x}/{$y} len={$len} sha=" . substr($sha, 0, 10) . PHP_EOL;
    }
}
