<?php
/**
 * @var string $appName
 * @var string $title
 * @var string $appShellClass
 */
$title = $title ?? $appName;
$appShellClass = $appShellClass ?? '';
$bodyClass = $bodyClass ?? '';
$swJsPath = dirname(__DIR__, 2) . '/public/sw.js';
$swJsVer = is_file($swJsPath) ? (string) filemtime($swJsPath) : '3';
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0f1419">
    <meta name="description" content="نظام عناوين بريدية — ليبيا (Leaflet + PHP)">
    <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?> — <?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?></title>
    <link rel="manifest" href="public/manifest.webmanifest">
    <link rel="icon" type="image/svg+xml" href="public/icon.svg">
    <link rel="stylesheet" href="css/app.css">
    <?php
    if (!empty($extraHead) && is_string($extraHead)) {
        echo $extraHead; // e.g. Leaflet CSS (trusted from controller/views only)
    }
    ?>
    <script>
    (function () {
      if (!('serviceWorker' in navigator)) { return; }
      var swUrl = 'public/sw.js?v=<?= htmlspecialchars($swJsVer, ENT_QUOTES, 'UTF-8') ?>';
      window.addEventListener('load', function () {
        navigator.serviceWorker.register(swUrl, { scope: '.' }).then(function (reg) {
          reg.update();
          if (reg.waiting) {
            reg.waiting.postMessage({ action: 'skipWaiting' });
          }
        }).catch(function () {});
      });
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (reloaded) { return; }
        reloaded = true;
        window.location.reload();
      });
    })();
    </script>
</head>
<body<?= $bodyClass !== '' ? ' class="' . htmlspecialchars($bodyClass, ENT_QUOTES, 'UTF-8') . '"' : '' ?>>
<a class="skip-link" href="#main-content">تخطٍ إلى المحتوى</a>
<div class="app-shell<?= $appShellClass !== '' ? ' ' . htmlspecialchars($appShellClass, ENT_QUOTES, 'UTF-8') : '' ?>">
