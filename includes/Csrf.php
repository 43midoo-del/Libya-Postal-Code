<?php
/**
 * CSRF token generation and validation for simple HTML forms.
 */
declare(strict_types=1);

namespace App;

final class Csrf
{
    public const SESSION_KEY = '_csrf_token';

    public static function init(): void
    {
        // Session is normally started in bootstrap; avoid calling session_name after start.
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        if (empty($_SESSION[self::SESSION_KEY])) {
            self::regenerate();
        }
    }

    public static function regenerate(): void
    {
        $_SESSION[self::SESSION_KEY] = bin2hex(random_bytes(32));
    }

    public static function getToken(): string
    {
        self::init();
        return (string) $_SESSION[self::SESSION_KEY];
    }

    public static function validate(?string $token): bool
    {
        self::init();
        if ($token === null || $token === '' || !isset($_SESSION[self::SESSION_KEY])) {
            return false;
        }
        return hash_equals((string) $_SESSION[self::SESSION_KEY], $token);
    }
}
