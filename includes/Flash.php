<?php
/**
 * One-time flash in session: message + type for styled alerts.
 */
declare(strict_types=1);

namespace App;

final class Flash
{
    public const KEY = '_app_flash';
    public const OK   = 'ok';
    public const ERR  = 'err';
    public const INFO = 'info';

    public static function set(string $message, string $type = self::INFO): void
    {
        if (!in_array($type, [self::OK, self::ERR, self::INFO], true)) {
            $type = self::INFO;
        }
        $_SESSION[self::KEY] = [
            'm' => $message,
            't' => $type,
        ];
    }

    /**
     * @return array{m: string, t: 'ok'|'err'|'info'}|null
     */
    public static function getAndClear(): ?array
    {
        if (empty($_SESSION[self::KEY])) {
            return null;
        }
        $raw = $_SESSION[self::KEY];
        unset($_SESSION[self::KEY]);
        if (is_string($raw)) {
            return ['m' => $raw, 't' => self::OK];
        }
        if (!is_array($raw) || !isset($raw['m'])) {
            return null;
        }
        $t = (string) ($raw['t'] ?? self::INFO);
        if (!in_array($t, [self::OK, self::ERR, self::INFO], true)) {
            $t = self::INFO;
        }
        return [
            'm' => (string) $raw['m'],
            't' => $t,
        ];
    }
}
