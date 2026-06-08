<?php
/**
 * Session user identity after successful login.
 */
declare(strict_types=1);

namespace App;

final class SessionAuth
{
    private const ID = 'auth_user_id';
    private const NAME = 'auth_user_name';
    private const EMAIL = 'auth_user_email';
    private const ROLE = 'auth_user_role';

    public static function start(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
    }

    public static function login(int $id, string $name, string $email, string $role): void
    {
        self::start();
        session_regenerate_id(true);
        $_SESSION[self::ID] = $id;
        $_SESSION[self::NAME] = $name;
        $_SESSION[self::EMAIL] = $email;
        $_SESSION[self::ROLE] = $role;
        Csrf::regenerate();
    }

    public static function logout(): void
    {
        self::start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
    }

    public static function isLoggedIn(): bool
    {
        self::start();
        return isset($_SESSION[self::ID]) && (int) $_SESSION[self::ID] > 0;
    }

    public static function userId(): int
    {
        self::start();
        return (int) ($_SESSION[self::ID] ?? 0);
    }

    public static function userName(): string
    {
        self::start();
        return (string) ($_SESSION[self::NAME] ?? '');
    }

    public static function userEmail(): string
    {
        self::start();
        return (string) ($_SESSION[self::EMAIL] ?? '');
    }

    public static function userRole(): string
    {
        self::start();
        return (string) ($_SESSION[self::ROLE] ?? '');
    }
}
