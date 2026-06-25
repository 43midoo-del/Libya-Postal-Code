<?php
/**
 * Offline-first map settings.
 * Tiles are served from data/tiles/libya.mbtiles via index.php?r=tile.
 */
declare(strict_types=1);

return [
    /** Use local MBTiles as the default base layer (no remote tile servers). */
    'prefer_offline'     => true,
    /** Allow switching to remote OSM/Esri when the browser reports online. */
    'allow_remote_tiles' => false,
    /** When false, new-address page opens on full Libya (not focus_center). */
    'focus_on_load'      => false,
    /** Optional fly-to target when selecting Derna / pilot area in UI. */
    'focus_center'       => [32.7558, 22.6478],
    'focus_zoom'         => 14,
    /** Max zoom exposed on the offline layer (match seeded MBTiles). */
    'offline_max_zoom'   => 17,
    /** Offline satellite (Esri) — separate MBTiles file. */
    'sat_mbtiles_path'   => 'data/tiles/libya-sat.mbtiles',
    'offline_sat_max_zoom' => 16,
    /** Esri reference overlays (roads + place names) for offline satellite. */
    'labels_transport_mbtiles_path' => 'data/tiles/libya-labels-transport.mbtiles',
    'labels_places_mbtiles_path'   => 'data/tiles/libya-labels-places.mbtiles',
    'offline_labels_max_zoom'      => 16,
    /** Leaflet performance tuning for low-end / offline use. */
    'tile_keep_buffer'   => 0,
    'tile_update_idle'   => true,
    /**
     * Offline MBTiles coverage (must match scripts/seed_derna_tiles.php zones).
     * Used client-side to clamp panning so the viewport stays on loaded tiles.
     */
    'tile_zones' => [
        ['zmin' => 5, 'zmax' => 8, 'south' => 19.4, 'west' => 9.2, 'north' => 33.45, 'east' => 25.15],
        ['zmin' => 9, 'zmax' => 12, 'south' => 30.79, 'west' => 21.92, 'north' => 33.08, 'east' => 23.35],
        ['zmin' => 13, 'zmax' => 16, 'south' => 32.68, 'west' => 22.48, 'north' => 32.88, 'east' => 22.84],
        ['zmin' => 17, 'zmax' => 17, 'south' => 32.728, 'west' => 22.595, 'north' => 32.792, 'east' => 22.725],
    ],
];
