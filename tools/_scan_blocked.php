<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

const BLOCKED_SHA1 = '0cfb5f443183efc5921f61005aaa7f341fcfd143';
const BLOCKED_LEN  = 6987;

$svc = new MBTilesService();
$pdo = new PDO('sqlite:' . $svc->path());
$st = $pdo->query('SELECT zoom_level, tile_column, tile_row, length(tile_data) AS len FROM tiles');

while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $z = (int) $row['zoom_level'];
    $x = (int) $row['tile_column'];
    $yTms = (int) $row['tile_row'];
    $len = (int) $row['len'];
    $y = ((1 << $z) - 1) - $yTms;
    $blob = $svc->getTileXYZ($z, $x, $y);
    if (!is_string($blob)) {
        continue;
    }
    $sha = sha1($blob);
    if ($len === BLOCKED_LEN || $sha === BLOCKED_SHA1 || ($len >= 6500 && $len <= 7200)) {
        echo "SUSPECT z{$z}/{$x}/{$y} len={$len} sha={$sha}\n";
    }
}
