<?php
declare(strict_types=1);

/** Flat + subtle gradient sea tile matching Esri World Imagery ocean tone. */
$out = __DIR__ . '/../data/tiles/sea-sat-256.png';
if (!function_exists('imagecreatetruecolor')) {
    fwrite(STDERR, "GD extension required\n");
    exit(1);
}
$im = imagecreatetruecolor(256, 256);
for ($y = 0; $y < 256; $y++) {
    $t = $y / 255.0;
    $r = (int) (8 + 18 * (1 - $t));
    $g = (int) (28 + 55 * (1 - $t));
    $b = (int) (58 + 95 * (1 - $t));
    $col = imagecolorallocate($im, $r, $g, $b);
    imageline($im, 0, $y, 255, $y, $col);
}
imagepng($im, $out);
imagedestroy($im);
echo 'written ' . filesize($out) . ' bytes to ' . $out . PHP_EOL;
