<?php
/**
 * Generates SQL INSERTs لجدول `shabiya_city_places` وفقَ أسماء الشعبيات في config/libya_admin.php
 * ومركز رسم خريطة لكل رمز من config/postal_map_regions.php (+ مدن مساعدة بإحداثيات تقريبة).
 *
 * تشغيل (من مجلد tools):
 *   php emit_shabiya_cities_seed.php > ../database/seeds/03_shabiya_cities.sql
 */
declare(strict_types=1);

$libya = require dirname(__DIR__) . '/config/libya_admin.php';
$regions = require dirname(__DIR__) . '/config/postal_map_regions.php';

/** @var array<string, array{lat:float,lng:float}> $centerByCode */
$centerByCode = [];
foreach ($regions as $r) {
    $c = trim((string) ($r['code'] ?? ''));
    if ($c !== '') {
        $centerByCode[$c] = ['lat' => (float) $r['lat'], 'lng' => (float) $r['lng']];
    }
}

/**
 * قائمة أساسية لتوسيع التغطية (إحداثيات تقريبيّة؛ يمكن تعديلها لاحقاً).
 *
 * @return list<array{0:string,1:float,2:float,3:string}>
 */
function extraPlacesFor(string $arabicAdminName, string $code): array
{
    $m = [
        'البطنان' => [['طبرق', 32.086, 23.944, 'city'], ['أمساعد', 31.9432, 25.0619, 'town']],
        'درنة' => [['قرنوبة', 32.718, 22.698, 'town'], ['البردي', 32.069, 22.069, 'village']],
        'الجبل الأخضر' => [['المرج الغربي', 31.986, 20.069, 'town'], ['سلوق', 32.115, 20.069, 'town']],
        'المرج' => [['العقيلة', 32.459, 20.069, 'town'], ['لمياء', 31.069, 20.069, 'town']],
        'بنغازي' => [['سلماني', 32.105, 20.069, 'suburb'], ['قمينيس', 32.069, 20.119, 'suburb']],
        'الواحات' => [['أجدابيا', 30.259, 19.219, 'city']],
        'الكفرة' => [['تاجري', 25.069, 24.069, 'town']],
        'سرت' => [['بو سدرة', 30.069, 18.069, 'village'], ['هراوة', 31.019, 16.069, 'village']],
        'النقاط الخمس' => [['بئر الغنم', 31.569, 14.069, 'town']],
        'مصراتة' => [['زليتن', 32.467, 14.569, 'city'], ['الخمس', 31.962, 14.289, 'town']],
        'المرقب' => [['الخمس', 32.648, 14.269, 'city'], ['تاجوراء', 32.434, 13.627, 'city']],
        'طرابلس' => [['أبو سليم', 32.819, 13.169, 'suburb'], ['جنزور', 32.819, 12.694, 'town'], ['قرقارش', 32.834, 13.069, 'suburb']],
        'الجفارة' => [['عين زارة', 32.769, 13.069, 'town']],
        'الزاوية' => [['صرمان', 32.431, 12.869, 'town'], ['رقدالين', 32.391, 12.379, 'town']],
        'الجبل الغربي' => [['غاريان', 32.169, 13.019, 'city'], ['يفرن', 32.069, 12.569, 'town']],
        'نالوت' => [['غدامس', 30.069, 11.069, 'city']],
        'الجفرة' => [['هون', 29.069, 15.069, 'city']],
        'وادي الشاطئ' => [['أوباري', 26.069, 10.069, 'city'], ['إدري', 27.069, 12.069, 'town']],
        'سبها' => [['تمندة', 27.069, 14.069, 'town']],
        'وادي الحياة' => [['التُرك', 25.069, 10.069, 'town']],
        'غات' => [['الديّة', 25.069, 10.069, 'town']],
        'مرزق' => [['التُوي', 25.069, 15.069, 'village']],
    ];

    return $m[$arabicAdminName] ?? [];
}

$sql = <<<SQL

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `shabiya_city_places` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shabiya_name`   VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `shabiya_code`   VARCHAR(8) DEFAULT NULL,
  `place_name`     VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `lat`            DECIMAL(10,7) NOT NULL,
  `lng`            DECIMAL(10,7) NOT NULL,
  `place_kind`     VARCHAR(16) NOT NULL DEFAULT 'town',
  `sort_order`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_sh_place` (`shabiya_name`(32), `place_name`(64)),
  KEY `idx_sh_name` (`shabiya_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='مدن محلية مرتبطة بالشعبية — تحميل سريع دون أداة خارجية';

DELETE FROM `shabiya_city_places`;

SQL;

$sortGlobal = 0;
foreach ($libya['shabiyat'] as $row) {
    $arabic = trim((string) ($row['name'] ?? ''));
    $code = trim((string) ($row['code'] ?? ''));
    if ($arabic === '' || $code === '') {
        continue;
    }
    $center = $centerByCode[$code] ?? ['lat' => 27.0389, 'lng' => 14.4225];
    $lat0 = $center['lat'];
    $lng0 = $center['lng'];

    /** @var list<array{name:string,lat:float,lng:float,type:string}> $pile */
    $pile = [['name' => $arabic, 'lat' => $lat0, 'lng' => $lng0, 'type' => 'city']];

    foreach (extraPlacesFor($arabic, $code) as $ex) {
        [$nm, $la, $lo, $pk] = $ex;
        $pile[] = ['name' => $nm, 'lat' => (float) $la, 'lng' => (float) $lo, 'type' => (string) $pk];
    }

    foreach ($pile as $p) {
        $nm = str_replace(["\\", "'"], ["\\\\", "\\'"], $p['name']);
        $shEsc = str_replace("'", "\\'", $arabic);
        $scEsc = str_replace("'", "\\'", $code);
        $pk = str_replace("'", "\\'", $p['type']);
        $sortGlobal += 10;
        $sql .= sprintf(
            "INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('%s','%s','%s',%.6f,%.6f,'%s',%d);\n",
            $shEsc,
            $scEsc,
            $nm,
            $p['lat'],
            $p['lng'],
            $pk,
            $sortGlobal
        );
    }
}

echo $sql;
