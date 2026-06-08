# قاعدة البيانات — Libya Postal Code

هذا المجلد يحتوي كل ملفات SQL مرتبة حسب الغرض.

## التثبيت السريع (قاعدة جديدة)

نفّذ الملفات **بهذا الترتيب** في phpMyAdmin أو سطر الأوامر:

| # | الملف | الغرض |
|---|--------|--------|
| 1 | `schema/01_base.sql` | إنشاء قاعدة `libya_postal` والجداول الأساسية |
| 2 | `seeds/01_admin_user.sql` | مستخدم المدير التجريبي (تطوير فقط) |
| 3 | `migrations/001_users_updated_at.sql` | عمود `updated_at` للمستخدمين |
| 4 | `seeds/02_admin_tree.sql` | الولايات الثلاث + 22 شعبية + هيكل إداري |
| 5 | `migrations/002_addresses_updated_at.sql` | عمود `updated_at` للعناوين |
| 6 | `migrations/003_postal_counters.sql` | عدّاد الكود البريدي الخمسي |
| 7 | `seeds/03_shabiya_cities.sql` | مدن الشعبيات للقوائم المنسدلة |
| 8 | `migrations/009_phase7_pro_upgrade.sql` | جداول الحدود والشوارع والبلاطات |

ثم (اختياري):

```bash
php scripts/seed_full_admin_data.php
php scripts/seed_demo_data.php
```

## هيكل المجلدات

```
database/
├── schema/       # المخطط الأساسي (تشغيل مرة واحدة على قاعدة فارغة)
├── seeds/        # بيانات أولية (مستخدمين، شعبيات، مدن)
└── migrations/   # ترحيلات تدريجية (قابلة لإعادة التشغيل في أغلبها)
```

## ترحيل قاعدة قديمة

إذا كانت لديك نسخة أقدم من المشروع، نفّذ فقط ملفات `migrations/` الناقصة بعد نسخ احتياطي:

| الملف | متى تحتاجه |
|--------|------------|
| `005_owner_name_nullable.sql` | إذا كان `owner_name` إلزامياً |
| `006_address_location_fields.sql` | إذا نقصت أعمدة الموقع |
| `007_pc_parts_columns.sql` | إذا نقصت أعمدة `pc_*` |
| `008_postal_5part_legacy.sql` | قواعد قديمة جداً قبل المخطط الحالي |
| `004_phase6_postal_sample.sql` | بديل لـ `003` مع بيانات عينة |

> الملفات `001`، `002`، `009` و`seeds/02` آمنة لإعادة التشغيل في أغلب الحالات.
