<?php
declare(strict_types=1);

$out = __DIR__ . '/../data/tiles/sea-256.png';
if (!function_exists('imagecreatetruecolor')) {
    fwrite(STDERR, "GD extension required\n");
    exit(1);
}
$im = imagecreatetruecolor(256, 256);
/* Flat OSM-style sea colour (#aad3df) for the vector offline base map only. */
$col = imagecolorallocate($im, 170, 211, 223);
imagefilledrectangle($im, 0, 0, 255, 255, $col);
imagepng($im, $out);
imagedestroy($im);
echo 'written ' . filesize($out) . ' bytes to ' . $out . PHP_EOL;
