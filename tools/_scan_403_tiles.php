<?php
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();
$pdo = new PDO('sqlite:' . $svc->path());
$st = $pdo->query('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles');

$blocked = 0;
$suspect = 0;
while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $blob = $row['tile_data'];
    if (!is_string($blob)) {
        continue;
    }
    $z = (int) $row['zoom_level'];
    $x = (int) $row['tile_column'];
    $yTms = (int) $row['tile_row'];
    $y = ((1 << $z) - 1) - $yTms;
    $len = strlen($blob);
    if (stripos($blob, 'Access blocked') !== false || stripos($blob, 'access blocked') !== false) {
        $blocked++;
        echo "BLOCKED-TEXT z{$z}/{$x}/{$y} len={$len}\n";
    } elseif ($len >= 6000 && $len <= 7200) {
        $suspect++;
        if ($suspect <= 15) {
            echo "SUSPECT-LEN z{$z}/{$x}/{$y} len={$len}\n";
        }
    }
}
echo "blocked_text={$blocked} suspect_len={$suspect}\n";
