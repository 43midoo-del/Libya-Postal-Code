<?php
/**
 * MySQL connection settings. Edit to match your local / server environment.
 * Never commit real production credentials to public repositories.
 *
 * On Windows, if you see "Access denied for user 'root'@'localhost' (using password: NO)",
 * set the real password here, or set the environment variable DB_PASSWORD before starting PHP
 * (see run-server.bat for an example line).
 */
declare(strict_types=1);

// Default password for local MySQL (XAMPP often uses empty; some installs require a value here).
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
