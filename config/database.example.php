<?php
/**
 * Copy this file to database.php and adjust for your environment.
 * database.php is tracked with safe defaults; override secrets via DB_PASSWORD.
 */
declare(strict_types=1);

$password = '';
if (getenv('DB_PASSWORD') !== false) {
    $password = (string) getenv('DB_PASSWORD');
}

return [
    'host'     => '127.0.0.1',
    'port'     => 3306,
    'database' => 'libya_postal',
    'username' => 'root',
    'password' => $password,
    'charset'  => 'utf8mb4',
];
