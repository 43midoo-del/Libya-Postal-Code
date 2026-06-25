<?php
declare(strict_types=1);

$z = 12;
$x = 2307;
$y = 1651;
$url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{$z}/{$y}/{$x}";
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_USERAGENT      => 'LibyaPostalOffline/1.0',
]);
$body = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
echo "code={$code} len=" . (is_string($body) ? strlen($body) : 0) . PHP_EOL;
