<?php
/**
 * Admin: manage administrative tree (states/regions/cities/areas) + upload GeoJSON.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Csrf;
use App\Flash;
use App\Models\Area;
use App\Models\City;
use App\Models\Region;
use App\Models\State;
use App\SessionAuth;
use RuntimeException;

final class AdminGeoController extends BaseController
{
    public function index(): void
    {
        $this->requireAnyRole(['admin']);
        $tab = isset($_GET['tab']) ? (string) $_GET['tab'] : 'states';
        if (!in_array($tab, ['states', 'regions', 'cities', 'areas'], true)) {
            $tab = 'states';
        }

        $states  = State::all();
        $regions = [];
        $cities  = [];
        $areas   = [];

        $stateFilter  = (int) ($_GET['state_id'] ?? 0);
        $regionFilter = (int) ($_GET['region_id'] ?? 0);
        $cityFilter   = (int) ($_GET['city_id'] ?? 0);

        if ($tab === 'regions') {
            $regions = Region::all($stateFilter > 0 ? ['state_id' => $stateFilter] : []);
        } elseif ($tab === 'cities') {
            $regions = Region::all();
            $cities  = City::all($regionFilter > 0 ? ['region_id' => $regionFilter] : []);
        } elseif ($tab === 'areas') {
            $regions = Region::all();
            $cities  = City::all();
            $areas   = Area::all($cityFilter > 0 ? ['city_id' => $cityFilter] : []);
        }

        $this->render('admin/geo/index.php', [
            'title'         => 'إدارة التقسيم الإداري',
            'tab'           => $tab,
            'states'        => $states,
            'regions'       => $regions,
            'cities'        => $cities,
            'areas'         => $areas,
            'stateFilter'   => $stateFilter,
            'regionFilter'  => $regionFilter,
            'cityFilter'    => $cityFilter,
            'userName'      => SessionAuth::userName(),
            'userRole'      => SessionAuth::userRole(),
            'navCurrent'    => 'admin_geo',
            'csrf'          => Csrf::getToken(),
            'flash'         => Flash::getAndClear(),
            'appShellClass' => 'app-shell--wide',
        ]);
    }

    // ---- states ----
    public function saveState(): void
    {
        $this->guardPost();
        $id    = (int) ($_POST['id'] ?? 0);
        $name  = (string) ($_POST['name'] ?? '');
        $code  = (string) ($_POST['code'] ?? '');
        try {
            if ($id > 0) {
                State::update($id, $name, $code);
                Flash::set('تم تحديث الولاية.', Flash::OK);
            } else {
                State::create($name, $code);
                Flash::set('تمت إضافة الولاية.', Flash::OK);
            }
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=admin_geo&tab=states');
    }

    public function deleteState(): void
    {
        $this->guardPost();
        $id = (int) ($_POST['id'] ?? 0);
        try {
            State::delete($id);
            Flash::set('تم حذف الولاية.', Flash::OK);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=admin_geo&tab=states');
    }

    // ---- regions ----
    public function saveRegion(): void
    {
        $this->guardPost();
        $id       = (int) ($_POST['id'] ?? 0);
        $name     = (string) ($_POST['name'] ?? '');
        $stateId  = (int) ($_POST['state_id'] ?? 0);
        try {
            if ($id > 0) {
                Region::update($id, $name, $stateId);
                Flash::set('تم تحديث الشعبية.', Flash::OK);
            } else {
                Region::create($name, $stateId);
                Flash::set('تمت إضافة الشعبية.', Flash::OK);
            }
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=admin_geo&tab=regions');
    }

    public function deleteRegion(): void
    {
        $this->guardPost();
        $id = (int) ($_POST['id'] ?? 0);
        try {
            Region::delete($id);
            Flash::set('تم حذف الشعبية.', Flash::OK);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=admin_geo&tab=regions');
    }

    // ---- cities ----
    public function saveCity(): void
    {
        $this->guardPost();
        $id        = (int) ($_POST['id'] ?? 0);
        $name      = (string) ($_POST['name'] ?? '');
        $regionId  = (int) ($_POST['region_id'] ?? 0);
        try {
            if ($id > 0) {
                City::update($id, $name, $regionId);
                Flash::set('تم تحديث المدينة.', Flash::OK);
            } else {
                City::create($name, $regionId);
                Flash::set('تمت إضافة المدينة.', Flash::OK);
            }
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=admin_geo&tab=cities');
    }

    public function deleteCity(): void
    {
        $this->guardPost();
        $id = (int) ($_POST['id'] ?? 0);
        try {
            City::delete($id);
            Flash::set('تم حذف المدينة.', Flash::OK);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=admin_geo&tab=cities');
    }

    // ---- areas ----
    public function saveArea(): void
    {
        $this->guardPost();
        $id      = (int) ($_POST['id'] ?? 0);
        $name    = (string) ($_POST['name'] ?? '');
        $cityId  = (int) ($_POST['city_id'] ?? 0);
        try {
            if ($id > 0) {
                Area::update($id, $name, $cityId);
                Flash::set('تم تحديث المنطقة.', Flash::OK);
            } else {
                Area::create($name, $cityId);
                Flash::set('تمت إضافة المنطقة.', Flash::OK);
            }
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=admin_geo&tab=areas');
    }

    public function deleteArea(): void
    {
        $this->guardPost();
        $id = (int) ($_POST['id'] ?? 0);
        try {
            Area::delete($id);
            Flash::set('تم حذف المنطقة.', Flash::OK);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=admin_geo&tab=areas');
    }

    // ---- GeoJSON upload ----
    public function uploadGeoJson(): void
    {
        $this->guardPost();
        $file = $_FILES['geojson_file'] ?? null;
        $name = trim((string) ($_POST['display_name'] ?? ''));
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Flash::set('فشل رفع الملف.', Flash::ERR);
            $this->redirect('index.php?r=admin_geo&tab=geojson');
        }
        $size = (int) ($file['size'] ?? 0);
        if ($size <= 0 || $size > 6 * 1024 * 1024) {
            Flash::set('حجم الملف يجب أن يكون ≤ 6MB.', Flash::ERR);
            $this->redirect('index.php?r=admin_geo&tab=geojson');
        }
        $tmp = (string) $file['tmp_name'];
        $raw = @file_get_contents($tmp);
        if ($raw === false || $raw === '') {
            Flash::set('تعذّر قراءة الملف.', Flash::ERR);
            $this->redirect('index.php?r=admin_geo&tab=geojson');
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || !isset($decoded['type'])) {
            Flash::set('الملف ليس GeoJSON صالحاً.', Flash::ERR);
            $this->redirect('index.php?r=admin_geo&tab=geojson');
        }
        if (!in_array((string) $decoded['type'], ['FeatureCollection', 'Feature', 'GeometryCollection'], true)) {
            Flash::set('GeoJSON من نوع غير مدعوم.', Flash::ERR);
            $this->redirect('index.php?r=admin_geo&tab=geojson');
        }
        $base = $this->safeFileName($name !== '' ? $name : (string) $file['name']);
        if ($base === '') {
            $base = 'upload-' . date('Ymd-His');
        }
        if (!str_ends_with($base, '.geojson') && !str_ends_with($base, '.json')) {
            $base .= '.geojson';
        }
        $target = dirname(__DIR__) . '/data/' . $base;
        $written = @file_put_contents($target, $raw);
        if ($written === false) {
            Flash::set('تعذّر كتابة الملف داخل مجلد data/.', Flash::ERR);
            $this->redirect('index.php?r=admin_geo&tab=geojson');
        }
        Flash::set('تم رفع الملف باسم data/' . $base, Flash::OK);
        $this->redirect('index.php?r=admin_geo&tab=geojson');
    }

    /** @return list<array{name:string, size:int, mtime:int}> */
    private function listGeoJsonFiles(): array
    {
        $dir = dirname(__DIR__) . '/data';
        if (!is_dir($dir)) {
            return [];
        }
        $out = [];
        foreach (scandir($dir) ?: [] as $f) {
            if ($f === '.' || $f === '..') {
                continue;
            }
            $full = $dir . '/' . $f;
            if (!is_file($full)) {
                continue;
            }
            $low = strtolower($f);
            if (!str_ends_with($low, '.geojson') && !str_ends_with($low, '.json')) {
                continue;
            }
            $out[] = [
                'name'  => $f,
                'size'  => (int) (@filesize($full) ?: 0),
                'mtime' => (int) (@filemtime($full) ?: 0),
            ];
        }
        usort($out, static fn ($a, $b) => $b['mtime'] <=> $a['mtime']);
        return $out;
    }

    private function safeFileName(string $name): string
    {
        $name = basename($name);
        $name = preg_replace('/[^A-Za-z0-9._\-]/', '_', $name) ?? '';
        $name = trim($name, '._');
        if ($name === '') {
            return '';
        }
        return substr($name, 0, 96);
    }

    private function guardPost(): void
    {
        $this->requireAnyRole(['admin']);
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->redirect('index.php?r=admin_geo');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            Flash::set('انتهت صلاحية الجلسة.', Flash::ERR);
            $this->redirect('index.php?r=admin_geo');
        }
    }
}
