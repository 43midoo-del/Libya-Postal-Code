# 🇱🇾 Libya Postal Code

**نظام إدارة العناوين البريدية الذكي في ليبيا** — تطبيق ويب عربي (RTL) لإنشاء عناوين بريدية موحّدة، توليد أكواد خمسية، وعرضها على خريطة Leaflet.

[![CI](https://github.com/43midoo-del/Libya-Postal-Code/actions/workflows/ci.yml/badge.svg)](https://github.com/43midoo-del/Libya-Postal-Code/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-8%2B-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-8%2B-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)

---

## ✨ المزايا الرئيسية

| الميزة | الوصف |
|--------|--------|
| 📮 كود بريدي خمسي | توليد تلقائي بصيغة `B 2-1-S 9` مرتبط بالتقسيم الإداري |
| 🗺️ خرائط تفاعلية | Leaflet + GeoJSON للولايات والشعبيات والمدن |
| 👥 أدوار متعددة | مدير، موظف، مواطن — صلاحيات محددة |
| 🔍 بحث واستعلام | قائمة عناوين، بطاقة بريدية، QR |
| ✏️ محرر حدود | رسم وتعديل حدود الشعبيات والمناطق |
| 📴 بلاطات أوفلاين | دعم MBTiles لتشغيل الخريطة بدون إنترنت |
| 📊 لوحة تحكم | إحصائيات ومخططات توزيع العناوين |

---

## 🚀 البدء السريع

### المتطلبات

- PHP 8+ (`pdo_mysql`, `mbstring`, `json`)
- MySQL 8+ (أو 5.7+ مع `utf8mb4`)
- Apache / XAMPP أو خادم PHP المدمج

### 1. استنساخ المشروع

```bash
git clone https://github.com/43midoo-del/Libya-Postal-Code.git
cd Libya-Postal-Code
```

### 2. قاعدة البيانات

نفّذ ملفات SQL بالترتيب — التفاصيل الكاملة في **[database/README.md](database/README.md)**:

```
database/schema/01_base.sql
database/seeds/01_admin_user.sql
database/migrations/001_users_updated_at.sql
database/seeds/02_admin_tree.sql
... (انظر الدليل)
```

### 3. الإعداد

```bash
cp config/database.example.php config/database.php   # Linux/macOS
# أو انسخ الملف يدوياً على Windows
```

### 4. التشغيل

```bash
php -S 127.0.0.1:8080 -t .
```

أو `run-server.bat` على Windows → افتح `http://127.0.0.1:8080/index.php?r=login`

### حساب التطوير

| الحقل | القيمة |
|-------|--------|
| البريد | `admin@libyapostal.local` |
| كلمة المرور | `admin123` ⚠️ غيّرها في الإنتاج |

---

## 📁 هيكل المشروع

```
Libya-Postal-Code/
├── .github/              # قوالب Issues/PR + CI
├── config/               # إعدادات التطبيق وقاعدة البيانات والخريطة
├── controllers/          # معالجة الطلبات (MVC)
├── models/               # طبقة البيانات
├── views/                # قوالب PHP عربية
├── includes/             # خدمات مشتركة (Auth, CSRF, PostalCode)
├── js/ + css/ + public/  # واجهة أمامية + PWA
├── data/                 # GeoJSON (حدود ليبيا والمدن)
├── database/             # schema + seeds + migrations
├── docs/                 # SRS، تقارير، دليل النشر
├── scripts/              # بذور وبناء GeoJSON
├── tools/                # أدوات صيانة لمرة واحدة
├── index.php             # Front controller (?r=)
└── README.md
```

---

## 🔐 الأدوار والصلاحيات

| الميزة | مدير | موظف | مواطن |
|--------|:----:|:----:|:-----:|
| تسجيل دخول / حساب جديد | ✓ | ✓ | ✓ |
| لوحة التحكم | ✓ | ✓ | ✓ |
| إدارة العناوين | ✓ | ✓ | محدود |
| إدارة المستخدمين | ✓ | — | — |
| التقسيم الإداري + GeoJSON | ✓ | — | — |
| محرر الحدود | ✓ | — | — |

---

## 🛣️ المسارات (Routes)

كل المسارات عبر `index.php?r=<name>`. أمثلة:

| المسار | الوصف |
|--------|--------|
| `login` / `register` | مصادقة |
| `dashboard` | لوحة التحكم |
| `addresses` | قائمة العناوين |
| `address_new` | إضافة عنوان |
| `postal_lookup` | استعلام بريدي |
| `admin_geo` | إدارة الولايات والشعبيات |
| `boundary_editor` | محرر الحدود |

الجدول الكامل في [docs/architecture.md](docs/architecture.md).

---

## 📚 الوثائق

| الوثيقة | الرابط |
|---------|--------|
| متطلبات النظام (SRS) | [docs/srs.md](docs/srs.md) |
| هيكلية التطبيق | [docs/architecture.md](docs/architecture.md) |
| دليل النشر | [docs/deployment.md](docs/deployment.md) |
| مذكرة التنفيذ (عربي) | [docs/ar/implementation-memo.md](docs/ar/implementation-memo.md) |
| تقرير المدير (عربي) | [docs/ar/project-manager-report.md](docs/ar/project-manager-report.md) |

---

## 🤝 المساهمة

راجع [CONTRIBUTING.md](CONTRIBUTING.md). للأمان راجع [SECURITY.md](SECURITY.md).

---

## 📄 الترخيص

[MIT License](LICENSE) — حر للاستخدام والتعديل مع الإبقاء على إشعار الترخيص.
