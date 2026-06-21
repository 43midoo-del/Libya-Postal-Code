<?php
require dirname(__DIR__) . '/includes/bootstrap.php';

use App\MBTilesService;

$svc = new MBTilesService();
$samples = [
    [14, 9228, 6614],
    [14, 9230, 6610],
    [15, 18462, 13229],
    [13, 4615, 3305],
];

foreach ($samples as [$z, $x, $y]) {
    $t = $svc->getTileXYZ($z, $x, $y);
    if ($t === null) {
        echo "z{$z}/{$x}/{$y}: MISSING\n";
        continue;
    }
    $isPng = str_starts_with($t, "\x89PNG");
    $has403 = stripos($t, '403') !== false || stripos($t, 'blocked') !== false || stripos($t, 'Access blocked') !== false;
    echo "z{$z}/{$x}/{$y}: len=" . strlen($t) . ' png=' . ($isPng ? 'yes' : 'no') . ' blocked_text=' . ($has403 ? 'YES' : 'no') . "\n";
}

$pdo = new PDO('sqlite:' . $svc->path());
$bad = 0;
$total = 0;
$st = $pdo->query('SELECT zoom_level, tile_column, tile_row, length(tile_data) AS len, tile_data FROM tiles LIMIT 500');
while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $total++;
    $blob = $row['tile_data'];
    if (!is_string($blob)) {
        continue;
    }
    if (stripos($blob, 'Access blocked') !== false || stripos($blob, '403') !== false && stripos($blob, 'PNG') === false) {
        $bad++;
    }
}
echo "Sample scan first 500 rows: suspicious={$bad}/{$total}\n";
