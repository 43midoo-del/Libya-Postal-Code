<?php
/**
 * التقسيم التقليدي: ثلاث ولايات + 22 شعبية (نظام 2007–2011، للعرض والإدخال).
 * تخصيص wilayah لكل شعبية تقريبي جغرافياً (برقة / طرابلس / فزان).
 */
declare(strict_types=1);

return [
    'wilayah' => [
        'barqa'        => 'برقة',
        'tripolitania' => 'طرابلس',
        'fezzan'       => 'فزان',
    ],
    /** رمز المحافظة في الرمز البريدي B / T / F لكل مفتاح wilayah */
    'wilayah_province' => [
        'barqa'        => 'B',
        'tripolitania' => 'T',
        'fezzan'       => 'F',
    ],
    /* الشعبيات: 22؛ الترتيب = الرقم البريدي 1–22 (لاحقة `code`). */
    'shabiyat' => [
        /* `code`: رمز المواءمة مع Postal / خريطة libya-shabiyat.geojson (مثل B2، T12) */
        ['name' => 'البطنان', 'wilayah' => 'barqa', 'code' => 'B1'],
        ['name' => 'درنة', 'wilayah' => 'barqa', 'code' => 'B2'],
        ['name' => 'الجبل الأخضر', 'wilayah' => 'barqa', 'code' => 'B3'],
        ['name' => 'المرج', 'wilayah' => 'barqa', 'code' => 'B4'],
        ['name' => 'بنغازي', 'wilayah' => 'barqa', 'code' => 'B5'],
        ['name' => 'الواحات', 'wilayah' => 'barqa', 'code' => 'B6'],
        ['name' => 'الكفرة', 'wilayah' => 'barqa', 'code' => 'B7'],
        ['name' => 'سرت', 'wilayah' => 'tripolitania', 'code' => 'T8'],
        ['name' => 'النقاط الخمس', 'wilayah' => 'tripolitania', 'code' => 'T9'],
        ['name' => 'مصراتة', 'wilayah' => 'tripolitania', 'code' => 'T10'],
        ['name' => 'المرقب', 'wilayah' => 'tripolitania', 'code' => 'T11'],
        ['name' => 'طرابلس', 'wilayah' => 'tripolitania', 'code' => 'T12'],
        ['name' => 'الجفارة', 'wilayah' => 'tripolitania', 'code' => 'T13'],
        ['name' => 'الزاوية', 'wilayah' => 'tripolitania', 'code' => 'T14'],
        ['name' => 'الجبل الغربي', 'wilayah' => 'tripolitania', 'code' => 'T15'],
        ['name' => 'نالوت', 'wilayah' => 'tripolitania', 'code' => 'T16'],
        ['name' => 'الجفرة', 'wilayah' => 'fezzan', 'code' => 'F17'],
        ['name' => 'وادي الشاطئ', 'wilayah' => 'fezzan', 'code' => 'F18'],
        ['name' => 'سبها', 'wilayah' => 'fezzan', 'code' => 'F19'],
        ['name' => 'وادي الحياة', 'wilayah' => 'fezzan', 'code' => 'F20'],
        ['name' => 'غات', 'wilayah' => 'fezzan', 'code' => 'F21'],
        ['name' => 'مرزق', 'wilayah' => 'fezzan', 'code' => 'F22'],
    ],
];
