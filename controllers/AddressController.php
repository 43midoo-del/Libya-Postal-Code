<?php
/**
 * Create address (map + form + auto postal code). Admin & Employee only.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Csrf;
use App\Database;
use App\Flash;
use App\Models\Address;
use App\Models\AddressSearch;
use App\Models\ShabiyaCity;
use App\Models\LibyaAdmin;
use App\SessionAuth;
use RuntimeException;

final class AddressController extends BaseController
{
    public function newForm(): void
    {
        $this->requireAnyRole(['admin', 'employee']);
        $app = require dirname(__DIR__) . '/config/app.php';
        $editId = (int) ($_GET['id'] ?? 0);
        $editRow = null;
        if ($editId >= 1) {
            $editRow = Address::findById($editId);
            if ($editRow === null) {
                Flash::set('العنوان غير موجود.', Flash::ERR);
                $this->redirect('index.php?r=addresses');
            }
        }
        $mapRegions = require dirname(__DIR__) . '/config/postal_map_regions.php';
        $mapLabels   = [];
        foreach ($mapRegions as $row) {
            $mapLabels[] = [
                'code' => (string) ($row['code'] ?? ''),
                'lat'  => (float) $row['lat'],
                'lng'  => (float) $row['lng'],
            ];
        }
        $shabiyaCityPlaces = ['byCode' => [], 'byName' => []];
        try {
            $shabiyaCityPlaces = ShabiyaCity::listAllGrouped(Database::getInstance()->getPdo());
        } catch (\Throwable $e) {
            // Page still loads; map shows seed hint if table is missing.
        }
        $this->render('addresses/create.php', [
            'title'          => $editRow !== null ? 'إدارة عنوان' : 'إضافة عنوان',
            'libya'          => LibyaAdmin::definitions(),
            'postalAreaId'   => (int) ($app['default_postal_area_id'] ?? 1),
            'flash'          => Flash::getAndClear(),
            'mapCfg'         => require dirname(__DIR__) . '/config/map.php',
            'userName'       => SessionAuth::userName(),
            'userRole'       => SessionAuth::userRole(),
            'navCurrent'     => 'address',
            'editRow'        => $editRow,
            'editId'         => $editId,
            'mapRegions'     => $mapRegions,
            'mapLabels'         => $mapLabels,
            'shabiyaCityPlaces' => $shabiyaCityPlaces,
            'appShellClass'     => 'app-shell--wide app-shell--mgr',
        ]);
    }

    public function store(): void
    {
        $this->requireAnyRole(['admin', 'employee']);
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->redirect('index.php?r=address_new');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            Flash::set('انتهت صلاحية الأمان. حدّث الصفحة ثم أعد الإرسال.', Flash::ERR);
            $this->redirect('index.php?r=address_new');
        }
        $app     = require dirname(__DIR__) . '/config/app.php';
        $areaId  = (int) ($app['default_postal_area_id'] ?? 1);
        $holder  = isset($_POST['holder_name']) ? trim((string) $_POST['holder_name']) : '';
        $type    = (string) ($_POST['type'] ?? '');
        $apt     = isset($_POST['apartment_number']) ? trim((string) $_POST['apartment_number']) : '';
        $latS    = trim((string) ($_POST['map_lat'] ?? ''));
        $lngS    = trim((string) ($_POST['map_lng'] ?? ''));
        $province = strtoupper(trim((string) ($_POST['pc_province'] ?? '')));
        $pcArea   = (int) ($_POST['pc_area'] ?? 0);
        $pcCity   = (int) ($_POST['pc_city'] ?? 0);
        $pcSector = (string) ($_POST['pc_sector'] ?? '');
        $shabiya  = trim((string) ($_POST['shabiya'] ?? ''));
        $locality = trim((string) ($_POST['locality'] ?? ''));
        $streetNo = trim((string) ($_POST['street_number'] ?? ''));

        if ($areaId < 1) {
            Flash::set('إعداد default_postal_area_id غير صالح في التكوين.', Flash::ERR);
            $this->redirect('index.php?r=address_new');
        }
        if ($latS === '' || $lngS === '' || !is_numeric($latS) || !is_numeric($lngS)) {
            Flash::set('انقر أولاً على الخريطة لتحديد الموقع (خط العرض وخط الطول).', Flash::ERR);
            $this->redirect('index.php?r=address_new');
        }

        try {
            $res = Address::create(
                SessionAuth::userId(),
                $areaId,
                $holder === '' ? null : $holder,
                $type,
                (float) $latS,
                (float) $lngS,
                $apt === '' ? null : $apt,
                $province,
                $pcArea,
                $pcCity,
                $pcSector,
                $shabiya === '' ? null : $shabiya,
                $locality === '' ? null : $locality,
                $streetNo === '' ? null : $streetNo
            );
            $okMsg = 'تم حفظ العنوان. الكود البريدي: ' . $res['postalCode'] . ' — مُعرف في النظام: ' . (string) $res['id'];
            if (!empty($res['warnings'])) {
                $okMsg .= ' — ' . implode(' ', $res['warnings']);
            }
            Flash::set($okMsg, Flash::OK);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=address_new');
    }

    /**
     * JSON API: create / update / delete (single-page add/manage).
     */
    public function api(): void
    {
        $this->requireAnyRole(['admin', 'employee']);
        header('Content-Type: application/json; charset=utf-8');
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            http_response_code(405);
            echo json_encode(['ok' => false, 'message' => 'يجب استخدام POST.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $raw  = file_get_contents('php://input');
        $data = json_decode($raw ?: '{}', true);
        if (!is_array($data)) {
            echo json_encode(['ok' => false, 'message' => 'طلب غير صالح.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $token = $data['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            echo json_encode(['ok' => false, 'message' => 'انتهت صلاحية الأمان. حدّث الصفحة.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $action = isset($data['action']) ? (string) $data['action'] : '';
        try {
            match ($action) {
                'create' => $this->jsonCreate($data),
                'update' => $this->jsonUpdate($data),
                'delete' => $this->jsonDelete($data),
                'search' => $this->jsonSearch($data),
                'get'    => $this->jsonGet($data),
                default  => throw new RuntimeException('إجراء غير معروف.'),
            };
        } catch (RuntimeException $e) {
            http_response_code(422);
            echo json_encode(['ok' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    /**
     * GET: قائمة مدن محلية مرتبطة باسم الشعبية (Arabic)، للخريطة وقائمة الاقتراحات.
     */
    public function apiShabiyaCities(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        if (!SessionAuth::isLoggedIn()) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'message' => 'غير مصرّح.'], JSON_UNESCAPED_UNICODE);

            return;
        }
        if (!in_array(SessionAuth::userRole(), ['admin', 'employee'], true)) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'message' => 'ليست لديك صلاحية.'], JSON_UNESCAPED_UNICODE);

            return;
        }

        $name = isset($_GET['shabiya']) ? trim((string) $_GET['shabiya']) : '';
        $codeQ = isset($_GET['code']) ? trim((string) $_GET['code']) : '';

        if ($name === '' && $codeQ === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'مرِّر اسم الشعبية وأ/أو الرمز B2 أو T12.'], JSON_UNESCAPED_UNICODE);

            return;
        }

        $rowMeta = $name !== '' ? LibyaAdmin::shabiyaRowByArabicName($name) : null;
        if ($rowMeta === null && $codeQ !== '') {
            foreach (LibyaAdmin::definitions()['shabiyat'] as $shRow) {
                if (strcasecmp(trim((string) ($shRow['code'] ?? '')), $codeQ) === 0) {
                    $rowMeta = $shRow;
                    break;
                }
            }
        }
        if ($rowMeta === null) {
            echo json_encode(['ok' => true, 'source' => 'none', 'places' => [], 'names' => []], JSON_UNESCAPED_UNICODE);

            return;
        }

        $arMeta = (string) ($rowMeta['name'] ?? '');

        try {
            $pdo = Database::getInstance()->getPdo();
            $places = [];
            if ($codeQ !== '') {
                $places = ShabiyaCity::listByShabiyaCode($pdo, $codeQ);
            }
            if ($places === []) {
                if ($name !== '') {
                    $places = ShabiyaCity::listByArabicShabiyaName($pdo, $name);
                } elseif ($arMeta !== '') {
                    $places = ShabiyaCity::listByArabicShabiyaName($pdo, $arMeta);
                }
            }
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode([
                'ok'      => false,
                'message' => 'تعذّر قراءة جدول المدن. نفّذ database_seed_shabiya_cities.sql على قاعدة البيانات.',
            ], JSON_UNESCAPED_UNICODE);

            return;
        }

        /** @var list<string> $names */
        $names = [];
        foreach ($places as $pl) {
            $names[] = $pl['name'];
        }

        echo json_encode([
            'ok'           => true,
            'source'       => 'db',
            'shabiya'      => (string) ($rowMeta['name'] ?? ''),
            'shabiya_code' => trim((string) ($rowMeta['code'] ?? '')),
            'places'       => $places,
            'names'        => $names,
        ], JSON_UNESCAPED_UNICODE);
    }

    /** @param array<string, mixed> $data */
    private function jsonCreate(array $data): void
    {
        $app    = require dirname(__DIR__) . '/config/app.php';
        $areaId = (int) ($app['default_postal_area_id'] ?? 1);
        if ($areaId < 1) {
            throw new RuntimeException('إعداد default_postal_area_id غير صالح.');
        }
        $holder   = isset($data['holder_name']) ? trim((string) $data['holder_name']) : '';
        $type     = (string) ($data['type'] ?? '');
        $apt      = isset($data['apartment_number']) ? trim((string) $data['apartment_number']) : '';
        $latS     = trim((string) ($data['map_lat'] ?? ''));
        $lngS     = trim((string) ($data['map_lng'] ?? ''));
        $province = strtoupper(trim((string) ($data['pc_province'] ?? '')));
        $pcArea   = (int) ($data['pc_area'] ?? 0);
        $pcCity   = (int) ($data['pc_city'] ?? 0);
        $pcSector = (string) ($data['pc_sector'] ?? '');
        $shabiya  = isset($data['shabiya']) ? trim((string) $data['shabiya']) : '';
        $locality = isset($data['locality']) ? trim((string) $data['locality']) : '';
        $streetNo = isset($data['street_number']) ? trim((string) $data['street_number']) : '';

        if ($latS === '' || $lngS === '' || !is_numeric($latS) || !is_numeric($lngS)) {
            throw new RuntimeException('انقر على الخريطة لتحديد الموقع.');
        }

        $res = Address::create(
                SessionAuth::userId(),
                $areaId,
                $holder === '' ? null : $holder,
                $type,
                (float) $latS,
                (float) $lngS,
                $apt === '' ? null : $apt,
                $province,
                $pcArea,
                $pcCity,
                $pcSector,
                $shabiya === '' ? null : $shabiya,
                $locality === '' ? null : $locality,
                $streetNo === '' ? null : $streetNo
            );
        $rec = Address::findById((int) $res['id']);
        echo json_encode([
            'ok'         => true,
            'message'    => 'تم حفظ العنوان.',
            'postalCode' => $res['postalCode'],
            'id'         => $res['id'],
            'record'     => $rec,
            'warnings'   => $res['warnings'] ?? [],
        ], JSON_UNESCAPED_UNICODE);
    }

    /** @param array<string, mixed> $data */
    private function jsonGet(array $data): void
    {
        $id = (int) ($data['id'] ?? 0);
        if ($id < 1) {
            throw new RuntimeException('مُعرف العنوان غير صالح.');
        }
        $row = Address::findById($id);
        if ($row === null) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'message' => 'العنوان غير موجود.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        echo json_encode(['ok' => true, 'record' => $row], JSON_UNESCAPED_UNICODE);
    }

    /** @param array<string, mixed> $data */
    private function jsonUpdate(array $data): void
    {
        $id = (int) ($data['id'] ?? 0);
        if ($id < 1) {
            throw new RuntimeException('مُعرف العنوان غير صالح.');
        }
        $holder = isset($data['holder_name']) ? trim((string) $data['holder_name']) : '';
        $type   = (string) ($data['type'] ?? '');
        $apt    = isset($data['apartment_number']) ? trim((string) $data['apartment_number']) : '';
        Address::updateMeta($id, $holder === '' ? null : $holder, $type, $apt === '' ? null : $apt);
        echo json_encode(['ok' => true, 'message' => 'تم حفظ التعديلات.'], JSON_UNESCAPED_UNICODE);
    }

    /** @param array<string, mixed> $data */
    private function jsonDelete(array $data): void
    {
        $id = (int) ($data['id'] ?? 0);
        if ($id < 1) {
            throw new RuntimeException('مُعرف غير صالح.');
        }
        Address::deleteById($id);
        echo json_encode(['ok' => true, 'message' => 'تم حذف العنوان.'], JSON_UNESCAPED_UNICODE);
    }

    /** @param array<string, mixed> $data */
    private function jsonSearch(array $data): void
    {
        $q = trim((string) ($data['q'] ?? ''));
        if ($q === '') {
            echo json_encode(['ok' => true, 'results' => []], JSON_UNESCAPED_UNICODE);
            return;
        }
        $rows = AddressSearch::search($q);
        echo json_encode(['ok' => true, 'results' => $rows], JSON_UNESCAPED_UNICODE);
    }

    public function update(): void
    {
        $this->requireAnyRole(['admin', 'employee']);
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->redirect('index.php?r=addresses');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            Flash::set('انتهت صلاحية الأمان. حدّث الصفحة.', Flash::ERR);
            $this->redirect('index.php?r=addresses');
        }
        $id   = (int) ($_POST['id'] ?? 0);
        $own  = isset($_POST['owner_name']) ? trim((string) $_POST['owner_name']) : '';
        $type = (string) ($_POST['type'] ?? '');
        $apt  = isset($_POST['apartment_number']) ? trim((string) $_POST['apartment_number']) : '';
        if ($id < 1) {
            Flash::set('مُعرف العنوان غير صالح.', Flash::ERR);
            $this->redirect('index.php?r=addresses');
        }
        try {
            Address::updateMeta($id, $own === '' ? null : $own, $type, $apt === '' ? null : $apt);
            Flash::set('تم حفظ التعديلات.', Flash::OK);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=address_new&id=' . (string) $id);
    }

    public function delete(): void
    {
        $this->requireAuth();
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->redirect('index.php?r=addresses');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            Flash::set('انتهت صلاحية الأمان.', Flash::ERR);
            $this->redirect('index.php?r=addresses');
        }
        $id = (int) ($_POST['id'] ?? 0);
        if ($id < 1) {
            Flash::set('مُعرف غير صالح.', Flash::ERR);
            $this->redirect('index.php?r=addresses');
        }
        if (!$this->canMutate($id)) {
            Flash::set('لا تملك صلاحية حذف هذا العنوان.', Flash::ERR);
            $this->redirect('index.php?r=addresses');
        }
        try {
            Address::deleteById($id);
            Flash::set('تم حذف العنوان.', Flash::OK);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=addresses');
    }

    /** Show details (read-only) — citizens see only their own; staff sees any. */
    public function show(): void
    {
        $this->requireAuth();
        $id = (int) ($_GET['id'] ?? 0);
        $row = Address::findById($id);
        if ($row === null) {
            Flash::set('العنوان غير موجود.', Flash::ERR);
            $this->redirect('index.php?r=addresses');
        }
        if (!$this->canView($id)) {
            http_response_code(403);
            $this->render('error/forbidden.php', ['message' => 'لا تملك صلاحية عرض هذا العنوان.']);
            return;
        }
        $mapCfg = require dirname(__DIR__) . '/config/map.php';
        $this->render('addresses/show.php', [
            'title'      => 'تفاصيل العنوان',
            'row'        => $row,
            'mapCfg'     => $mapCfg,
            'userName'   => SessionAuth::userName(),
            'userRole'   => SessionAuth::userRole(),
            'navCurrent' => 'addresses',
            'csrf'       => Csrf::getToken(),
            'flash'      => Flash::getAndClear(),
        ]);
    }

    /** Full edit form (staff only): map + all postal segments + metadata. */
    public function editFullForm(): void
    {
        $this->requireAnyRole(['admin', 'employee']);
        $id = (int) ($_GET['id'] ?? 0);
        $row = Address::findById($id);
        if ($row === null) {
            Flash::set('العنوان غير موجود.', Flash::ERR);
            $this->redirect('index.php?r=addresses');
        }
        $mapCfg = require dirname(__DIR__) . '/config/map.php';
        $libya  = LibyaAdmin::definitions();
        $this->render('addresses/edit.php', [
            'title'      => 'تعديل عنوان كامل',
            'row'        => $row,
            'libya'      => $libya,
            'mapCfg'     => $mapCfg,
            'userName'   => SessionAuth::userName(),
            'userRole'   => SessionAuth::userRole(),
            'navCurrent' => 'addresses',
            'csrf'       => Csrf::getToken(),
            'flash'      => Flash::getAndClear(),
            'appShellClass' => 'app-shell--wide',
        ]);
    }

    public function fullUpdate(): void
    {
        $this->requireAnyRole(['admin', 'employee']);
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->redirect('index.php?r=addresses');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            Flash::set('انتهت صلاحية الأمان.', Flash::ERR);
            $this->redirect('index.php?r=addresses');
        }
        $id = (int) ($_POST['id'] ?? 0);
        if ($id < 1) {
            Flash::set('مُعرف غير صالح.', Flash::ERR);
            $this->redirect('index.php?r=addresses');
        }
        $data = [
            'owner_name'       => isset($_POST['owner_name']) ? trim((string) $_POST['owner_name']) : null,
            'type'             => (string) ($_POST['type'] ?? ''),
            'apartment_number' => isset($_POST['apartment_number']) ? trim((string) $_POST['apartment_number']) : null,
            'latitude'         => trim((string) ($_POST['map_lat'] ?? '')),
            'longitude'        => trim((string) ($_POST['map_lng'] ?? '')),
            'pc_province'      => (string) ($_POST['pc_province'] ?? ''),
            'pc_area'          => (string) ($_POST['pc_area'] ?? ''),
            'pc_city'          => (string) ($_POST['pc_city'] ?? ''),
            'pc_sector'        => (string) ($_POST['pc_sector'] ?? ''),
            'shabiya'          => isset($_POST['shabiya']) ? trim((string) $_POST['shabiya']) : null,
            'locality'         => isset($_POST['locality']) ? trim((string) $_POST['locality']) : null,
            'street_number'    => isset($_POST['street_number']) ? trim((string) $_POST['street_number']) : null,
        ];
        try {
            Address::update($id, $data);
            Flash::set('تم حفظ تعديلات العنوان.', Flash::OK);
            $this->redirect('index.php?r=address_show&id=' . (string) $id);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
            $this->redirect('index.php?r=address_edit&id=' . (string) $id);
        }
    }

    /**
     * Ownership/role guard for mutation: admin/employee always; citizen only own row.
     */
    private function canMutate(int $id): bool
    {
        $role = SessionAuth::userRole();
        if (in_array($role, ['admin', 'employee'], true)) {
            return true;
        }
        if ($role !== 'citizen') {
            return false;
        }
        $owner = Address::ownerIdOf($id);
        return $owner !== null && $owner === SessionAuth::userId();
    }

    private function canView(int $id): bool
    {
        $role = SessionAuth::userRole();
        if (in_array($role, ['admin', 'employee'], true)) {
            return true;
        }
        $owner = Address::ownerIdOf($id);
        return $owner !== null && $owner === SessionAuth::userId();
    }
}
