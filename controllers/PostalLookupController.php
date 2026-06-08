<?php
/**
 * Public postal-code lookup:
 *   GET  index.php?r=postal_lookup                  → search form (HTML)
 *   GET  index.php?r=postal_lookup&code=B2-1-S-0001 → match page (HTML, printable)
 *   GET  index.php?r=postal_lookup_api&code=...     → JSON {ok, address|null}
 *   GET  index.php?r=postal_lookup_card&code=...    → printable card (HTML, print stylesheet)
 *
 * Anonymous — no login required. Only safe fields are returned (no owner_name).
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Models\LibyaAdmin;
use PDO;

final class PostalLookupController extends BaseController
{
    public function index(): void
    {
        $code = isset($_GET['code']) ? trim((string) $_GET['code']) : '';
        $match = $code !== '' ? $this->findByCode($code) : null;
        $this->renderPublic('postal/lookup.php', [
            'title'   => 'البحث بالرمز البريدي',
            'code'    => $code,
            'match'   => $match,
            'wilayah' => LibyaAdmin::definitions()['wilayah'] ?? [],
        ]);
    }

    public function api(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        $code = isset($_GET['code']) ? trim((string) $_GET['code']) : '';
        if ($code === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'الرجاء إدخال الرمز البريدي.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $match = $this->findByCode($code);
        if ($match === null) {
            echo json_encode(['ok' => true, 'found' => false, 'code' => $code], JSON_UNESCAPED_UNICODE);
            return;
        }
        echo json_encode(['ok' => true, 'found' => true, 'address' => $match], JSON_UNESCAPED_UNICODE);
    }

    public function card(): void
    {
        $code = isset($_GET['code']) ? trim((string) $_GET['code']) : '';
        $match = $code !== '' ? $this->findByCode($code) : null;
        $this->renderPublic('postal/card.php', [
            'title' => 'بطاقة الرمز البريدي ' . ($code !== '' ? $code : ''),
            'code'  => $code,
            'match' => $match,
        ], true);
    }

    /**
     * Renders a public view using head/foot partials with $publicChrome=true.
     * @param array<string, mixed> $vars
     */
    private function renderPublic(string $tpl, array $vars, bool $printable = false): void
    {
        $app = require dirname(__DIR__) . '/config/app.php';
        $appName = (string) ($app['app_name'] ?? 'Libya Postal');
        extract($vars, EXTR_SKIP);
        $publicChrome = true;
        $bodyClass = $printable ? 'postal-print-body' : 'postal-lookup-body';
        require dirname(__DIR__) . '/views/' . $tpl;
    }

    /**
     * Look up an address by its full postal code, e.g. "B 2-1-S-0001".
     * Tolerant of separators / whitespace / case.
     *
     * @return array<string, mixed>|null
     */
    private function findByCode(string $code): ?array
    {
        $norm = $this->normalizeCode($code);
        if ($norm === null) {
            return null;
        }
        try {
            $pdo = Database::getInstance()->getPdo();
            $st  = $pdo->prepare(
                'SELECT id, postal_code,
                        pc_province, pc_area, pc_city, pc_sector, pc_property,
                        wilayah, shabiya, locality, street_number,
                        latitude, longitude, apartment_number, type
                 FROM `addresses`
                 WHERE pc_province = :p AND pc_area = :a AND pc_city = :c AND pc_sector = :s AND pc_property = :pr
                 LIMIT 1'
            );
            $st->execute([
                'p'  => $norm['province'],
                'a'  => $norm['area'],
                'c'  => $norm['city'],
                's'  => $norm['sector'],
                'pr' => $norm['property'],
            ]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            return is_array($row) ? $row : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Accepts variations: "B 2-1-S-0001", "b2-1-s-1", "B2 1 S 0001", "B/2/1/S/0001"
     * @return array{province:string, area:int, city:int, sector:string, property:int}|null
     */
    private function normalizeCode(string $code): ?array
    {
        $code = strtoupper(preg_replace('/[\s\-_\/\\\\]+/u', ' ', $code) ?: '');
        $code = trim($code);
        /* If first token is a letter+digits glued ("B2") split it. */
        if (preg_match('/^([A-Z])(\d+)\s+(.+)$/u', $code, $m)) {
            $code = $m[1] . ' ' . $m[2] . ' ' . $m[3];
        }
        $parts = preg_split('/\s+/u', $code) ?: [];
        if (count($parts) < 5) {
            return null;
        }
        [$p, $a, $c, $s, $pr] = array_slice($parts, 0, 5);
        if (!preg_match('/^[BTF]$/', $p)) { return null; }
        if (!ctype_digit((string) $a)) { return null; }
        if (!ctype_digit((string) $c)) { return null; }
        if (!preg_match('/^[A-Z0-9]{1,2}$/', $s)) { return null; }
        if (!ctype_digit((string) $pr)) { return null; }
        return [
            'province' => (string) $p,
            'area'     => (int) $a,
            'city'     => (int) $c,
            'sector'   => (string) $s,
            'property' => (int) $pr,
        ];
    }
}
