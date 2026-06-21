<?php
foreach (['libya-mask-inner-ring.geojson', 'libya-visible-mask-ring.geojson'] as $name) {
    $path = dirname(__DIR__) . '/data/' . $name;
    $g = json_decode((string) file_get_contents($path), true);
    $c = $g['geometry']['coordinates'][0];
    $maxLng = -999;
    $minLng = 999;
    foreach ($c as $pt) {
        $lng = (float) $pt[0];
        $maxLng = max($maxLng, $lng);
        $minLng = min($minLng, $lng);
    }
    echo $name . ': minLng=' . $minLng . ' maxLng=' . $maxLng . PHP_EOL;
}
