<?php
/**
 * Front controller: routes via ?r=
 * login, auth, logout, dashboard, addresses (search is a 302 alias), address_*, home
 */
declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

/** @var array $appConfig loaded in bootstrap */
$appDebug = ($appConfig['debug'] ?? false) === true
    || getenv('APP_DEBUG') === '1';

use App\Controllers\AuthController;
use App\Controllers\DashboardController;
use App\Controllers\AddressController;
use App\Controllers\AddressesController;
use App\Controllers\UsersController;
use App\Controllers\AdminGeoController;
use App\Controllers\BoundaryEditorController;
use App\Controllers\TileController;
use App\Controllers\TileSyncController;
use App\Controllers\PostalLookupController;
use App\SessionAuth;

$route = isset($_GET['r']) ? (string) $_GET['r'] : 'home';

$jsonApiRoutes = [
    'boundary_overview', 'boundary_list', 'boundary_entity_loc', 'boundary_entities',
    'boundary_save', 'boundary_delete', 'boundary_entity_create', 'boundary_entity_add_grid',
    'boundary_export', 'boundary_province_colors', 'addresses_json', 'api_shabiya_cities', 'address_city_blocks', 'address_api',
    'postal_lookup_api', 'tile_sync_status',
];
if (!in_array($route, $jsonApiRoutes, true)) {
    header('Content-Type: text/html; charset=utf-8');
}

try {
    match ($route) {
        'login' => (new AuthController())->showLoginPage(),
        'auth' => (new AuthController())->processLogin(),
        'logout' => (new AuthController())->logout(),
        'register' => (new AuthController())->showRegisterPage(),
        'register_store' => (new AuthController())->processRegister(),
        'dashboard' => (new DashboardController())->index(),
        'addresses' => (new AddressesController())->index(),
        'addresses_report' => (new AddressesController())->report(),
        'addresses_json' => (new AddressesController())->jsonList(),
        'search' => (function () {
            $qs = $_SERVER['QUERY_STRING'] ?? '';
            $qs = preg_replace('/(^|&)r=search(&|$)/', '$1', (string) $qs);
            $qs = trim((string) $qs, '&');
            $target = 'index.php?r=addresses' . ($qs !== '' ? '&' . $qs : '');
            header('Location: ' . $target, true, 302);
            exit;
        })(),
        'address_new' => (new AddressController())->newForm(),
        'address_edit' => (new AddressController())->editFullForm(),
        'address_full_update' => (new AddressController())->fullUpdate(),
        'address_store' => (new AddressController())->store(),
        'address_show' => (new AddressController())->show(),
        'address_update' => (new AddressController())->update(),
        'address_delete' => (new AddressController())->delete(),
        'api_shabiya_cities' => (new AddressController())->apiShabiyaCities(),
        'address_city_blocks' => (new AddressController())->apiCityBlocks(),
        'address_api' => (new AddressController())->api(),
        'users' => (new UsersController())->index(),
        'user_new' => (new UsersController())->newForm(),
        'user_store' => (new UsersController())->store(),
        'user_edit' => (new UsersController())->editForm(),
        'user_update' => (new UsersController())->update(),
        'user_delete' => (new UsersController())->delete(),
        'profile' => (new UsersController())->profile(),
        'profile_update' => (new UsersController())->profileUpdate(),
        'profile_password' => (new UsersController())->profilePassword(),
        'admin_geo' => (new AdminGeoController())->index(),
        'admin_geo_state_save' => (new AdminGeoController())->saveState(),
        'admin_geo_state_delete' => (new AdminGeoController())->deleteState(),
        'admin_geo_region_save' => (new AdminGeoController())->saveRegion(),
        'admin_geo_region_delete' => (new AdminGeoController())->deleteRegion(),
        'admin_geo_city_save' => (new AdminGeoController())->saveCity(),
        'admin_geo_city_delete' => (new AdminGeoController())->deleteCity(),
        'admin_geo_area_save' => (new AdminGeoController())->saveArea(),
        'admin_geo_area_delete' => (new AdminGeoController())->deleteArea(),
        'admin_geojson_upload' => (new AdminGeoController())->uploadGeoJson(),
        'boundary_editor' => (new BoundaryEditorController())->index(),
        'boundary_overview' => (new BoundaryEditorController())->apiOverview(),
        'boundary_list' => (new BoundaryEditorController())->apiList(),
        'boundary_entity_loc' => (new BoundaryEditorController())->apiEntityLoc(),
        'boundary_entities' => (new BoundaryEditorController())->apiEntities(),
        'boundary_save' => (new BoundaryEditorController())->apiSave(),
        'boundary_delete' => (new BoundaryEditorController())->apiDelete(),
        'boundary_entity_create' => (new BoundaryEditorController())->apiEntityCreate(),
        'boundary_entity_add_grid' => (new BoundaryEditorController())->apiEntityAddGrid(),
        'boundary_export' => (new BoundaryEditorController())->apiExport(),
        'boundary_province_colors' => (new BoundaryEditorController())->apiProvinceColors(),
        'tile' => (new TileController())->serve(),
        'tile_sync' => (new TileSyncController())->index(),
        'tile_sync_run' => (new TileSyncController())->run(),
        'tile_sync_status' => (new TileSyncController())->status(),
        'tile_sync_cancel' => (new TileSyncController())->cancel(),
        'postal_lookup' => (new PostalLookupController())->index(),
        'postal_lookup_api' => (new PostalLookupController())->api(),
        'postal_lookup_card' => (new PostalLookupController())->card(),
        'home' => (function () {
            if (SessionAuth::isLoggedIn()) {
                header('Location: index.php?r=dashboard', true, 302);
                exit;
            }
            header('Location: index.php?r=login', true, 302);
        })(),
        default => (function () {
            http_response_code(404);
            header('Content-Type: text/html; charset=utf-8');
            echo '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>404</title>';
            echo '<link rel="stylesheet" href="css/app.css"></head><body class="app-shell--auth">';
            echo '<div class="app-shell"><main class="error-page" style="min-height:40vh"><h1 class="error-page__code">404</h1>';
            echo '<p class="error-page__msg">الصفحة غير موجودة.</p>';
            echo '<p><a class="map-link" href="index.php?r=dashboard">اللوحة</a></p></main></div></body></html>';
        })(),
    };
} catch (Throwable $e) {
    http_response_code(500);
    echo 'حدث خطأ في الخادم. تحقق من الاتصال بقاعدة البيانات وإعدادات config.';
    if ($appDebug || (isset($_GET['debug']) && (string) $_GET['debug'] === '1')) {
        echo '<pre>' . htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8') . '</pre>';
    }
}
