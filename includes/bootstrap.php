<?php
/**
 * Application bootstrap: paths + minimal PSR-4-like autoloader for App\ classes under /includes.
 */
declare(strict_types=1);

if (!defined('APP_ROOT')) {
    define('APP_ROOT', dirname(__DIR__));
}

spl_autoload_register(static function (string $class): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    if (str_starts_with($relative, 'Models\\')) {
        $path = substr($relative, strlen('Models\\'));
        $file = APP_ROOT . '/models/' . str_replace('\\', '/', $path) . '.php';
    } elseif (str_starts_with($relative, 'Controllers\\')) {
        $path = substr($relative, strlen('Controllers\\'));
        $file = APP_ROOT . '/controllers/' . str_replace('\\', '/', $path) . '.php';
    } else {
        $file = APP_ROOT . '/includes/' . str_replace('\\', '/', $relative) . '.php';
    }
    if (is_file($file)) {
        require $file;
    }
});

$appConfig = require APP_ROOT . '/config/app.php';
if (session_status() === PHP_SESSION_NONE) {
    session_name((string) ($appConfig['session_name'] ?? 'LIBYA_POSTAL_SESSID'));
    session_start();
}
