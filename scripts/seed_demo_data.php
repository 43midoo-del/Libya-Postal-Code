<?php
/**
 * Seed ~30 demo addresses spread across the 3 wilayat so the dashboard,
 * statistics, and map overlay have visible data for the graduation demo.
 *
 * Usage (from the project root):
 *   php scripts/seed_demo_data.php
 *
 * Requires:
 *  - database.sql + database_seed_admin_tree.sql applied
 *  - at least one user (admin) to attribute addresses to (uses created_by = id 1)
 */
declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

use App\Models\Address;

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("This script must be run from the CLI.\n");
}

$points = [
    ['T', 12, 1, 'S', 'tripolitania', 'طرابلس',          'مركز طرابلس',  32.8872, 13.1913, 'residential', 'محمد علي'],
    ['T', 12, 1, 'S', 'tripolitania', 'طرابلس',          'مركز طرابلس',  32.8845, 13.1801, 'commercial', 'متجر النور'],
    ['T', 12, 1, 'S', 'tripolitania', 'طرابلس',          'باب بن غشير',  32.8731, 13.1995, 'residential', 'فاطمة محمود'],
    ['T', 12, 1, 'S', 'tripolitania', 'طرابلس',          'تاجوراء',      32.8830, 13.3500, 'government', 'مديرية تاجوراء'],
    ['T', 13, 1, 'S', 'tripolitania', 'الجفارة',         'العزيزية',     32.5320, 13.0188, 'residential', 'أحمد الطاهر'],
    ['T', 14, 1, 'S', 'tripolitania', 'الزاوية',         'الزاوية',       32.7574, 12.7273, 'commercial', 'سوق الزاوية'],
    ['T', 11, 1, 'S', 'tripolitania', 'المرقب',           'الخمس',        32.6470, 14.2620, 'residential', 'يوسف الفقيه'],
    ['T', 10, 1, 'S', 'tripolitania', 'مصراتة',           'مركز مصراتة', 32.3754, 15.0925, 'residential', 'علي سعيد'],
    ['T', 10, 1, 'S', 'tripolitania', 'مصراتة',           'كرزاز',        32.3120, 15.0500, 'commercial', 'مطعم البحر'],
    ['T', 9,  1, 'S', 'tripolitania', 'النقاط الخمس',     'زوارة',        32.9311, 12.0820, 'residential', 'إبراهيم محمد'],
    ['T', 16, 1, 'S', 'tripolitania', 'نالوت',            'نالوت',        31.8680, 10.9810, 'residential', 'سالم العباس'],
    ['T', 15, 1, 'S', 'tripolitania', 'الجبل الغربي',    'غريان',        32.1700, 13.0200, 'residential', 'مريم بلقاسم'],
    ['T', 8,  1, 'S', 'tripolitania', 'سرت',              'مركز سرت',     31.2089, 16.5887, 'government', 'بلدية سرت'],

    ['B', 5,  1, 'S', 'barqa',        'بنغازي',           'مركز بنغازي', 32.1167, 20.0680, 'residential', 'فؤاد مصطفى'],
    ['B', 5,  1, 'S', 'barqa',        'بنغازي',           'سيدي حسين',  32.1322, 20.0500, 'commercial', 'متجر الواحة'],
    ['B', 5,  1, 'S', 'barqa',        'بنغازي',           'الفويهات',    32.1010, 20.0510, 'residential', 'سعاد العالم'],
    ['B', 4,  1, 'S', 'barqa',        'المرج',            'المرج',        32.4910, 20.8290, 'residential', 'كريم الفلاح'],
    ['B', 3,  1, 'S', 'barqa',        'الجبل الأخضر',    'البيضاء',     32.7619, 21.7480, 'residential', 'هدى الزروقي'],
    ['B', 2,  1, 'S', 'barqa',        'درنة',             'مركز درنة',  32.7558, 22.6478, 'residential', 'بشير الحويج'],
    ['B', 1,  1, 'S', 'barqa',        'البطنان',          'طبرق',        32.0859, 23.9622, 'commercial', 'منفذ طبرق'],
    ['B', 6,  1, 'S', 'barqa',        'الواحات',          'إجدابيا',     30.7556, 20.2243, 'government', 'مديرية إجدابيا'],
    ['B', 7,  1, 'S', 'barqa',        'الكفرة',           'الكفرة',      24.1850, 23.3140, 'residential', 'أحمد الشاطئ'],

    ['F', 19, 1, 'S', 'fezzan',       'سبها',             'مركز سبها',  27.0377, 14.4283, 'residential', 'موسى التارقي'],
    ['F', 19, 1, 'S', 'fezzan',       'سبها',             'حي المهدية', 27.0500, 14.4400, 'residential', 'خديجة سبها'],
    ['F', 17, 1, 'S', 'fezzan',       'الجفرة',           'هون',         29.1267, 15.9483, 'commercial', 'سوق هون'],
    ['F', 18, 1, 'S', 'fezzan',       'وادي الشاطئ',     'براك',        27.5447, 14.2719, 'residential', 'سيف الدين'],
    ['F', 20, 1, 'S', 'fezzan',       'وادي الحياة',     'أوباري',      26.5876, 12.7800, 'residential', 'الطاهر الفزاني'],
    ['F', 21, 1, 'S', 'fezzan',       'غات',              'غات',         24.9633, 10.1738, 'government', 'مديرية غات'],
    ['F', 22, 1, 'S', 'fezzan',       'مرزق',             'مرزق',        25.9155, 13.9180, 'residential', 'صالح المرزقي'],
    ['F', 17, 1, 'S', 'fezzan',       'الجفرة',           'سوكنة',       29.0700, 15.7900, 'residential', 'حسن السوكني'],
];

$ok = 0; $skipped = 0; $errors = 0;
foreach ($points as $i => $row) {
    [$prov, $area, $city, $sector, $wilayah, $shabiya, $locality, $lat, $lng, $type, $owner] = $row;
    try {
        $res = Address::create(
            1, 1,
            $owner, $type, (float) $lat, (float) $lng,
            null, $prov, (int) $area, (int) $city, $sector,
            $shabiya, $locality, (string) ($i + 1)
        );
        $ok++;
        echo str_pad((string) ($i + 1), 3, ' ', STR_PAD_LEFT)
            . " ✓  " . str_pad($res['postalCode'], 14)
            . "  " . $owner . PHP_EOL;
    } catch (\RuntimeException $e) {
        $msg = $e->getMessage();
        if (str_contains($msg, 'مسجّل مسبقاً')) {
            $skipped++;
            echo str_pad((string) ($i + 1), 3, ' ', STR_PAD_LEFT)
                . " · already exists @ " . $lat . ',' . $lng . PHP_EOL;
            continue;
        }
        $errors++;
        echo str_pad((string) ($i + 1), 3, ' ', STR_PAD_LEFT)
            . " ✗  " . $msg . PHP_EOL;
    }
}

echo PHP_EOL . "Done: created={$ok}, skipped={$skipped}, errors={$errors}" . PHP_EOL;
