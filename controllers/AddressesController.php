<?php
/**
 * Unified addresses list: search + filters + pagination + map preview.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Csrf;
use App\Flash;
use App\Models\AddressSearch;
use App\Models\LibyaAdmin;
use App\SessionAuth;

final class AddressesController extends BaseController
{
    public function index(): void
    {
        $this->requireAuth();

        $parsed  = $this->parseListFilters();
        $libya   = $parsed['libya'];
        $filters = $parsed['filters'];
        $page    = isset($_GET['page']) ? (int) $_GET['page'] : 1;

        $perPage = AddressSearch::DEFAULT_PER_PAGE;
        $page    = max(1, $page);

        $res   = AddressSearch::query($filters, $page, $perPage);
        $rows  = $res['rows'];
        $total = $res['total'];
        $pages = $total < 1 ? 1 : (int) ceil($total / $perPage);
        if ($page > $pages) {
            $page = $pages;
            $res  = AddressSearch::query($filters, $page, $perPage);
            $rows = $res['rows'];
        }

        $this->render('addresses/index.php', [
            'title'         => 'قائمة العناوين',
            'rows'          => $rows,
            'total'         => $total,
            'page'          => $page,
            'perPage'       => $perPage,
            'pages'         => $pages,
            'filters'       => $filters,
            'libya'         => $libya,
            'mapCfg'        => require dirname(__DIR__) . '/config/map.php',
            'userName'      => SessionAuth::userName(),
            'userRole'      => SessionAuth::userRole(),
            'navCurrent'    => 'addresses',
            'appShellClass' => 'app-shell--wide',
            'csrf'          => Csrf::getToken(),
            'flash'         => Flash::getAndClear(),
        ]);
    }

    /**
     * Printable PDF-oriented report of all addresses matching current filters (up to MAX_PER_PAGE).
     */
    public function report(): void
    {
        $this->requireAuth();

        $parsed  = $this->parseListFilters();
        $libya   = $parsed['libya'];
        $filters = $parsed['filters'];

        $limit   = AddressSearch::MAX_PER_PAGE;
        $res     = AddressSearch::query($filters, 1, $limit);
        $rows    = $res['rows'];
        $total   = $res['total'];
        $truncated = $total > count($rows);

        $output = isset($_GET['output']) ? trim((string) $_GET['output']) : 'pdf';
        if (!in_array($output, ['pdf', 'print'], true)) {
            $output = 'pdf';
        }

        $this->render('addresses/report.php', [
            'title'       => 'كشف العناوين',
            'rows'        => $rows,
            'total'       => $total,
            'truncated'   => $truncated,
            'filters'     => $filters,
            'libya'       => $libya,
            'userName'    => SessionAuth::userName(),
            'generatedAt' => date('Y-m-d H:i'),
            'output'      => $output,
            'pdfFilename' => $this->reportPdfFilename($filters),
            'navCurrent'  => 'none',
            'bodyClass'   => 'addresses-report-body',
            'appShellClass' => '',
        ]);
    }

    /**
     * @param array{q: string, wilayah: string, shabiya: string, type: string} $filters
     */
    private function reportPdfFilename(array $filters): string
    {
        $parts = ['kashf-addresses'];
        if ($filters['shabiya'] !== '') {
            $slug = preg_replace('/[^a-zA-Z0-9\x{0600}-\x{06FF}_-]+/u', '-', $filters['shabiya']);
            $parts[] = ($slug !== null && $slug !== '') ? trim($slug, '-') : 'shabiya';
        } elseif ($filters['wilayah'] !== '') {
            $parts[] = $filters['wilayah'];
        }
        $parts[] = date('Y-m-d');

        return implode('-', $parts) . '.pdf';
    }

    /**
     * Read-only JSON list (used by the explore map overlay). Any logged-in user can call.
     */
    public function jsonList(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        if (!\App\SessionAuth::isLoggedIn()) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'message' => 'غير مصرّح.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $wilayah  = isset($_GET['wilayah']) ? trim((string) $_GET['wilayah']) : '';
        $shabiya  = isset($_GET['shabiya']) ? trim((string) $_GET['shabiya']) : '';
        $locality = isset($_GET['locality']) ? trim((string) $_GET['locality']) : '';
        $type     = isset($_GET['type']) ? trim((string) $_GET['type']) : '';
        $limit    = max(1, min(500, (int) ($_GET['limit'] ?? 200)));
        $res = AddressSearch::query([
            'wilayah'  => $wilayah,
            'shabiya'  => $shabiya,
            'locality' => $locality,
            'type'     => $type,
        ], 1, $limit);
        echo json_encode(['ok' => true, 'results' => $res['rows'], 'total' => $res['total']], JSON_UNESCAPED_UNICODE);
    }

    /**
     * @return array{
     *   filters: array{q: string, wilayah: string, shabiya: string, type: string},
     *   libya: array{wilayah: array<string, string>, shabiyat: list<array{name: string, wilayah: string, code?: string}>}
     * }
     */
    private function parseListFilters(): array
    {
        $libya = LibyaAdmin::definitions();

        $q       = isset($_GET['q']) ? trim((string) $_GET['q']) : '';
        $wilayah = isset($_GET['wilayah']) ? trim((string) $_GET['wilayah']) : '';
        $shabiya = isset($_GET['shabiya']) ? trim((string) $_GET['shabiya']) : '';
        $type    = isset($_GET['type']) ? trim((string) $_GET['type']) : '';
        if (!isset($libya['wilayah'][$wilayah])) {
            $wilayah = '';
        }
        if ($shabiya !== '' && !$this->shabiyaExistsInWilayah($libya, $shabiya, $wilayah)) {
            $shabiya = '';
        }
        if (!in_array($type, ['residential', 'government', 'commercial'], true)) {
            $type = '';
        }

        return [
            'filters' => [
                'q'       => $q,
                'wilayah' => $wilayah,
                'shabiya' => $shabiya,
                'type'    => $type,
            ],
            'libya' => $libya,
        ];
    }

    /**
     * @param array{shabiyat: list<array{name: string, wilayah: string, code?: string}>} $libya
     */
    private function shabiyaExistsInWilayah(array $libya, string $shabiyaName, string $wilayahKey): bool
    {
        foreach ($libya['shabiyat'] as $row) {
            if (($row['name'] ?? '') === $shabiyaName) {
                if ($wilayahKey === '' || ($row['wilayah'] ?? '') === $wilayahKey) {
                    return true;
                }
            }
        }
        return false;
    }
}
