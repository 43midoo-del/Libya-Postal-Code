<?php
declare(strict_types=1);

$g = json_decode(file_get_contents(dirname(__DIR__) . '/data/libya-shabiyat.geojson'), true);
foreach (['B2', 'B5'] as $code) {
    foreach ($g['features'] as $f) {
        if (($f['properties']['code'] ?? '') !== $code) {
            continue;
        }
        $coords = $f['geometry']['coordinates'][0];
        $lats = [];
        $lngs = [];
        foreach ($coords as $c) {
            $lngs[] = $c[0];
            $lats[] = $c[1];
        }
        $latSpan = max($lats) - min($lats);
        $lngSpan = max($lngs) - min($lngs);
        echo $code . ' ' . ($f['properties']['name'] ?? '') . PHP_EOL;
        echo '  lat ' . min($lats) . '..' . max($lats) . ' span=' . round($latSpan, 3) . PHP_EOL;
        echo '  lng ' . min($lngs) . '..' . max($lngs) . ' span=' . round($lngSpan, 3) . PHP_EOL;
        echo '  maxSpan=' . round(max($latSpan, $lngSpan), 3) . PHP_EOL;
        break;
    }
}
