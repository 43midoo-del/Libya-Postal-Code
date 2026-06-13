<?php
/**
 * Restore Derna neighborhood seed lat/lng (names unchanged).
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

const SEEDS = [
    ['name' => 'الجبيلة',         'lat' => 32.7668, 'lng' => 22.6342],
    ['name' => 'شيحا الغربية',    'lat' => 32.7620, 'lng' => 22.6100],
    ['name' => 'شيحا الشرقية',    'lat' => 32.7618, 'lng' => 22.6520],
    ['name' => 'البلاد',          'lat' => 32.7640, 'lng' => 22.6490],
    ['name' => 'المغار',          'lat' => 32.7650, 'lng' => 22.6360],
    ['name' => 'أبو منصور',       'lat' => 32.7685, 'lng' => 22.6425],
    ['name' => 'الفتايح',         'lat' => 32.7530, 'lng' => 22.6580],
    ['name' => 'الظهور',          'lat' => 32.7568, 'lng' => 22.6315],
    ['name' => 'البطن',           'lat' => 32.7608, 'lng' => 22.6275],
    ['name' => 'العطبة',          'lat' => 32.7638, 'lng' => 22.6385],
    ['name' => 'العليوة',         'lat' => 32.7540, 'lng' => 22.6465],
    ['name' => 'بن ناصر',         'lat' => 32.7672, 'lng' => 22.6405],
    ['name' => 'الشعبية',         'lat' => 32.7598, 'lng' => 22.6355],
    ['name' => 'الوادي',          'lat' => 32.7572, 'lng' => 22.6418],
    ['name' => 'المدينة القديمة', 'lat' => 32.7615, 'lng' => 22.6378],
    ['name' => 'وسط الساحل',      'lat' => 32.7585, 'lng' => 22.6445],
    ['name' => 'حي الخديجة',      'lat' => 32.7675, 'lng' => 22.6305],
];

$pdo = App\Database::getInstance()->getPdo();
$cityId = (int) $pdo->query(
    "SELECT c.id FROM cities c JOIN regions r ON r.id = c.region_id
     WHERE c.name = 'درنة' AND r.code = 'B2' LIMIT 1"
)->fetchColumn();

if ($cityId < 1) {
    fwrite(STDERR, "Derna city not found\n");
    exit(1);
}

$st = $pdo->prepare('UPDATE areas SET lat = :lat, lng = :lng WHERE city_id = :cid AND name = :name');
$n = 0;
foreach (SEEDS as $seed) {
    $st->execute([
        'lat'  => $seed['lat'],
        'lng'  => $seed['lng'],
        'cid'  => $cityId,
        'name' => $seed['name'],
    ]);
    $n += $st->rowCount();
}
echo "Restored coordinates for $n areas in city id=$cityId\n";
