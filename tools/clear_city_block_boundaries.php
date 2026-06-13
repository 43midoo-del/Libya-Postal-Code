<?php
/**
 * Remove all saved area/street boundary polygons for a city (keeps area/street names).
 * Clears seed lat/lng only when --clear-coords is passed.
 *
 * Usage: php tools/clear_city_block_boundaries.php [--city-id=123] [--city-name=درنة] [--clear-coords]
 *
 * Deletes only saved boundary polygons (grids). Area/street names and records are kept.
 * Coordinates (lat/lng) are kept by default so map zoom still works; pass --clear-coords to wipe them.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

$cityId = 0;
$cityName = 'درنة';
$keepCoords = true;

foreach ($argv ?? [] as $arg) {
    if (str_starts_with($arg, '--city-id=')) {
        $cityId = (int) substr($arg, 10);
    } elseif (str_starts_with($arg, '--city-name=')) {
        $cityName = substr($arg, 12);
    } elseif ($arg === '--clear-coords') {
        $keepCoords = false;
    }
}

$pdo = App\Database::getInstance()->getPdo();

if ($cityId < 1) {
    $st = $pdo->prepare(
        'SELECT c.id, c.name, r.code AS region_code
         FROM cities c JOIN regions r ON r.id = c.region_id
         WHERE c.name = :name
         ORDER BY CASE WHEN r.code = "B2" THEN 0 ELSE 1 END, c.id ASC
         LIMIT 1'
    );
    $st->execute(['name' => $cityName]);
    $city = $st->fetch(PDO::FETCH_ASSOC);
    if ($city === false) {
        fwrite(STDERR, "City not found: {$cityName}\n");
        exit(1);
    }
    $cityId = (int) $city['id'];
} else {
    $st = $pdo->prepare(
        'SELECT c.id, c.name, r.code AS region_code FROM cities c JOIN regions r ON r.id = c.region_id WHERE c.id = :id'
    );
    $st->execute(['id' => $cityId]);
    $city = $st->fetch(PDO::FETCH_ASSOC);
    if ($city === false) {
        fwrite(STDERR, "City id not found: {$cityId}\n");
        exit(1);
    }
}

echo "City: {$city['name']} (id={$cityId}, region={$city['region_code']})\n";

$stAreas = $pdo->prepare('SELECT id, name FROM areas WHERE city_id = :cid ORDER BY id');
$stAreas->execute(['cid' => $cityId]);
$areas = $stAreas->fetchAll(PDO::FETCH_ASSOC);
$areaIds = array_map(static fn(array $r): int => (int) $r['id'], $areas);

if ($areaIds === []) {
    echo "No areas for this city.\n";
    exit(0);
}

$inAreas = implode(',', $areaIds);

$stStreetIds = $pdo->query("SELECT id, name FROM streets WHERE area_id IN ($inAreas) ORDER BY id");
$streets = $stStreetIds->fetchAll(PDO::FETCH_ASSOC);
$streetIds = array_map(static fn(array $r): int => (int) $r['id'], $streets);

$pdo->beginTransaction();
try {
    $deletedStreets = 0;
    if ($streetIds !== []) {
        $inStreets = implode(',', $streetIds);
        $deletedStreets = (int) $pdo->exec(
            "DELETE FROM boundaries WHERE level = 'street' AND entity_id IN ($inStreets)"
        );
    }

    $deletedAreas = (int) $pdo->exec(
        "DELETE FROM boundaries WHERE level = 'area' AND entity_id IN ($inAreas)"
    );

    $clearedAreaCoords = 0;
    if (!$keepCoords) {
        $clearedAreaCoords = (int) $pdo->exec(
            "UPDATE areas SET lat = NULL, lng = NULL WHERE city_id = {$cityId} AND (lat IS NOT NULL OR lng IS NOT NULL)"
        );
    }

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, 'Failed: ' . $e->getMessage() . "\n");
    exit(1);
}

echo "Deleted area boundaries: {$deletedAreas}\n";
echo "Deleted street boundaries: {$deletedStreets}\n";
echo "Areas kept (names): " . count($areas) . "\n";
foreach ($areas as $a) {
    echo "  - {$a['name']} (id={$a['id']})\n";
}
echo "Streets kept (names): " . count($streets) . "\n";
foreach ($streets as $s) {
    echo "  - {$s['name']} (id={$s['id']})\n";
}
if (!$keepCoords) {
    echo "Cleared seed coordinates: {$clearedAreaCoords} areas (no auto Voronoi grid)\n";
}
echo "City boundary (level=city) was NOT touched.\n";
echo "Done.\n";
