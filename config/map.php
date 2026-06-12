<?php
/**
 * Map defaults: bounds roughly covering Libya to restrict panning (not political precision).
 * Coordinates: WGS84 (same as GPS / Leaflet).
 */
declare(strict_types=1);

return [
    'libya_bounds' => [
        'south' => 19.40,
        'west'  => 9.20,
        /* مزيد من المساحة شمالاً لعرض الساحل والمياه الإقليمية على الخريطة */
        'north' => 33.45,
        'east'  => 25.15,
    ],
    'default_center' => [26.30, 17.18], // ~centroid of libya_bounds (country-wide framing)
    'default_zoom'   => 6,
    'min_zoom'           => 5,
    'max_zoom'           => 19,
    /* Esri World Imagery: آخر مستوى فعلي يختلف حسب المنطقة (غالباً 17 في ليبيا). */
    'max_zoom_satellite' => 17,
];
