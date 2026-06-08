# Smart Postal — Libya (MVC / PHP / MySQL / Leaflet)

> نظام إدارة العناوين البريدية الذكي في ليبيا — تطبيق ويب باللغة العربية مبني على PHP خام بدون أُطر، MySQL، وLeaflet لعرض الخريطة.

## 1. المتطلبات

- **PHP 8+** (الإضافات: `pdo_mysql`, `mbstring`, `json`)
- **MySQL 8+** (أو 5.7+ بـ utf8mb4)
- خادم ويب (Apache / XAMPP) أو خادم PHP المدمج

## 2. التشغيل السريع محلياً

### 2.1 تهيئة قاعدة البيانات (الترتيب مهم)

نفّذ ملفات الـ SQL التالية **بهذا الترتيب** على خادم MySQL (مثلاً من phpMyAdmin):

| # | الملف | الوصف |
|---|------|------|
| 1 | `database.sql` | إنشاء قاعدة البيانات والجداول الأساسية. |
| 2 | `database_seed.sql` | إنشاء مستخدم المدير الافتراضي (للتطوير فقط). |
| 3 | `database_users_extras.sql` | (المرحلة 1) إضافة `updated_at` لجدول المستخدمين — قابل لإعادة التشغيل. |
| 4 | `database_seed_admin_tree.sql` | (المرحلة 2) الولايات الثلاث + 22 شعبية + مدينة افتراضية + منطقة `area_id=1`. |
| 5 | `database_addresses_updated_at.sql` | (المرحلة 4) إضافة `updated_at` لجدول العناوين — قابل لإعادة التشغيل. |
| 6 | `database_postal_property_counters_only.sql` *(أو)* `database_phase6_postal_and_sample.sql` | عدّاد الكود البريدي الخمسي. |
| 7 | `database_seed_shabiya_cities.sql` | (اختياري) قائمة مدن مرتبطة بكل شعبية للقوائم المنسدلة. |
| 8 | `database_addresses_owner_name_nullable.sql` *(إن لزم)* | جعل اسم الحامل اختيارياً. |
| 9 | `database_address_location_fields.sql` *(إن لزم)* | إضافة `wilayah/shabiya/locality/street_number` للجدول القديم. |
| 10 | `database_phase7_pro_upgrade.sql` | (المرحلة 7) توسيع `pc_sector` إلى `VARCHAR(2)`، إضافة `code/lat/lng/population/kind` لـ `regions/cities/areas`، وإنشاء جداول `boundaries / streets / map_annotations / tile_sync_log`. قابل لإعادة التشغيل. |

> ملاحظة: ملفات `database_users_extras.sql`، `database_seed_admin_tree.sql`، `database_addresses_updated_at.sql`، و`database_phase7_pro_upgrade.sql` كلها قابلة لإعادة التشغيل دون خطأ.

### 2.x سكربتات السطر الأمري

- `php scripts/seed_full_admin_data.php` — تعبئة الولايات/الشعبيات/المدن/المناطق من `data/libya-shabiyat.geojson` + `data/libya-cities-source.json` وحفظ حدود الشعبيات في جدول `boundaries`.
- `php scripts/seed_mbtiles_from_osm.php [zmin] [zmax]` — تنزيل بلاطات أساس (افتراضي z5..z7) إلى `data/tiles/libya.mbtiles` ليعمل العرض أوفلاين.

### 2.2 تكوين الاتصال
عدّل `config/database.php` (host, username, password, database).

### 2.3 تشغيل الخادم
من جذر المشروع:
```bash
php -S localhost:8080
```
أو شغّل `run-server.bat` على Windows.

افتح: `http://localhost:8080/index.php?r=login`

### 2.4 بيانات اختبار للوحة (اختياري)
```bash
php scripts/seed_demo_data.php
```
يُنشئ ~30 عنواناً موزّعاً على الولايات الثلاث حتى تظهر المخططات والإحصائيات بشكل لائق في العرض النهائي.

## 3. الحساب الافتراضي

| الحقل | القيمة |
|-------|--------|
| البريد | `admin@libyapostal.local` |
| كلمة المرور | `admin123` (غيّرها في الإنتاج) |

المواطن يستطيع إنشاء حسابه بنفسه من صفحة `?r=register`.

## 4. الأدوار والصلاحيات

| الميزة | المدير | الموظف | المواطن |
|--------|:------:|:------:|:-------:|
| تسجيل دخول | ✓ | ✓ | ✓ |
| تسجيل حساب جديد (للمواطن فقط) | — | — | ✓ |
| تعديل بياناتي الشخصية + كلمة المرور | ✓ | ✓ | ✓ |
| لوحة التحكم والإحصائيات | ✓ | ✓ | ✓ |
| خريطة الاستكشاف + تحليل الموقع بالنقر | ✓ | ✓ | ✓ |
| قائمة العناوين والبحث | ✓ | ✓ | ✓ |
| إضافة / تعديل / حذف عناوين | ✓ | ✓ | حذف عنوانه فقط |
| عرض تفاصيل عنوان | ✓ | ✓ | عنوانه فقط |
| إدارة المستخدمين | ✓ | — | — |
| إدارة التقسيم الإداري + رفع GeoJSON | ✓ | — | — |

## 5. جدول المسارات (Routes)

كل المسارات على شكل `index.php?r=<name>`.

### مصادقة وحساب
| المسار | الوصف |
|--------|------|
| `login` / `auth` / `logout` | شاشة الدخول وإنهاء الجلسة. |
| `register` / `register_store` | تسجيل حساب مواطن جديد. |
| `profile` / `profile_update` / `profile_password` | الملف الشخصي وتغيير كلمة المرور. |

### إدارة المستخدمين (مدير فقط)
| المسار | الوصف |
|--------|------|
| `users` | قائمة وفلترة المستخدمين. |
| `user_new` / `user_store` | إضافة. |
| `user_edit` / `user_update` | تعديل. |
| `user_delete` | حذف. |

### العناوين
| المسار | الوصف |
|--------|------|
| `addresses` | قائمة + فلترة + خريطة جانبية. |
| `addresses_json` | JSON للقراءة فقط (يستخدمه طبقة العناوين على الخريطة المستقلة). |
| `address_new` / `address_store` | إضافة عنوان (موظف / مدير). |
| `address_show` | صفحة تفاصيل (محمية بملكية للمواطن). |
| `address_edit` / `address_full_update` | تعديل كامل: موقع + كل أجزاء الكود + بيانات (موظف / مدير). |
| `address_update` | تحديث **سريع** للبيانات الوصفية فقط (اسم/نوع/شقة). |
| `address_delete` | حذف. |
| `address_api` | JSON: create/update/delete (واجهة `add-address`). |
| `api_shabiya_cities` | JSON: مدن الشعبية لقوائم الإكمال. |

### الخرائط
| المسار | الوصف |
|--------|------|
| `map` | خريطة الاستكشاف (اختيار ولاية → شعبية → مدينة + نقرة → معلومات الموقع). |
| `map_resolve` | JSON: يستقبل (lat, lng) ويرجع (الولاية، الشعبية، أقرب مدينة، area_id). |

### إدارة التقسيم الإداري (مدير فقط)
| المسار | الوصف |
|--------|------|
| `admin_geo` | الواجهة (تبويبات: ولايات / شعبيات / مدن / مناطق / ملفات GeoJSON). |
| `admin_geo_state_save` / `_delete` | الولايات. |
| `admin_geo_region_save` / `_delete` | الشعبيات. |
| `admin_geo_city_save` / `_delete` | المدن. |
| `admin_geo_area_save` / `_delete` | المناطق. |
| `admin_geojson_upload` | رفع ملف GeoJSON إلى `data/`. |

## 6. هيكلية المشروع (MVC)

```
Projict/
├── index.php                    # واجهة موحّدة لكل المسارات (?r=...)
├── config/                      # app, database, map, libya_admin, postal_map_regions
├── controllers/                 # Auth, Dashboard, Users, AdminGeo, Map, Address(es)
├── models/                      # User, State, Region, City, Area, Address, AddressSearch,
│                                # LibyaAdmin, ShabiyaCity, Statistics
├── views/
│   ├── auth/{login,register}.php
│   ├── dashboard/index.php
│   ├── users/{index,create,edit,profile}.php
│   ├── admin/geo/index.php
│   ├── addresses/{index,create,edit,show}.php
│   ├── map/index.php
│   ├── error/forbidden.php
│   └── partials/                # head, foot, main_nav, app_header, flash
├── includes/                    # Database, SessionAuth, Csrf, Flash, PostalCodeService, GeoBounds
├── js/                          # map/{core,labels,shabiyat,parcel,explore}.js +
│                                # addresses/{form,save,edit,full_edit}.js +
│                                # dashboard_charts.js + addresses_index.js
├── css/app.css                  # ستايل موحّد RTL
├── data/                        # GeoJSON (libya-shabiyat / libya-mask-inner-ring / cities)
└── scripts/seed_demo_data.php   # ~30 عنواناً تجريبياً للعرض
```

## 7. سيناريو End-to-End للعرض النهائي

1. **مواطن** يفتح `?r=register` ويُسجّل بنفسه (الدور `citizen` يُفرض من الخادم).
2. **مدير** يدخل بـ `admin@libyapostal.local`، يفتح `?r=users` ويُنشئ موظفاً جديداً.
3. **موظف** يدخل، يفتح `?r=address_new`، يختار الولاية والشعبية، يكبّر على الخريطة وينقر لتسجيل الإحداثيات، يحفظ → يظهر الكود البريدي والـ QR.
4. **مدير** يفتح `?r=admin_geo&tab=regions` ويضيف شعبية جديدة → يلاحظها فوراً في القائمة المنسدلة في صفحة الإضافة.
5. **مواطن** يفتح `?r=map`، يختار شعبية، ينقر على نقطة → تظهر بطاقة بمعلومات الموقع المُحلّل (الولاية، رمز المحافظة، الشعبية، أقرب مدينة).
6. **مدير** يفتح `?r=dashboard` ويرى المخططات: توزيع الولايات، أكثر 10 شعبيات، آخر 7 أيام، توزيع الأنواع.

## 8. وثائق إضافية

- `srs_libyan_smart_postal_address_system (2).md` — وثيقة المتطلبات (مُحدّثة بصيغة الكود البريدي الفعلية `B 2-1-S 9`).
- `مذكرة-التنفيذ-تفصيلية.md` — مذكّرة تنفيذ مُفصّلة بالعربية.
- `تقرير 1.md` — تقرير مُختصر.
