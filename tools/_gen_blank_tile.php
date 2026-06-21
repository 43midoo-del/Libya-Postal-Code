<?php
declare(strict_types=1);

$out = __DIR__ . '/../data/tiles/blank-256.png';
if (!function_exists('imagecreatetruecolor')) {
    fwrite(STDERR, "GD extension required\n");
    exit(1);
}
$im = imagecreatetruecolor(256, 256);
imagesavealpha($im, true);
imagealphablending($im, false);
$transparent = imagecolorallocatealpha($im, 0, 0, 0, 127);
imagefilledrectangle($im, 0, 0, 255, 255, $transparent);
imagepng($im, $out);
imagedestroy($im);
echo 'written ' . filesize($out) . ' bytes to ' . $out . PHP_EOL;
