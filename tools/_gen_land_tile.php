<?php
declare(strict_types=1);

$out = __DIR__ . '/../data/tiles/land-256.png';
if (!function_exists('imagecreatetruecolor')) {
    fwrite(STDERR, "GD extension required\n");
    exit(1);
}
$im = imagecreatetruecolor(256, 256);
$base = imagecolorallocate($im, 242, 239, 233);
$noise = imagecolorallocate($im, 236, 233, 226);
imagefilledrectangle($im, 0, 0, 255, 255, $base);
for ($i = 0; $i < 1200; $i++) {
    $x = random_int(0, 255);
    $y = random_int(0, 255);
    imagesetpixel($im, $x, $y, $noise);
}
imagepng($im, $out);
imagedestroy($im);
echo 'written ' . filesize($out) . ' bytes to ' . $out . PHP_EOL;
