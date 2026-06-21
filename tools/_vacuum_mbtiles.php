<?php
require dirname(__DIR__) . '/includes/bootstrap.php';
$p = (new App\MBTilesService())->path();
$db = new PDO('sqlite:' . $p);
$db->exec('VACUUM');
echo "Vacuumed: {$p}\n";
