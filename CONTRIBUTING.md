# المساهمة في المشروع

شكراً لاهتمامك بتحسين **Libya Postal Code**.

## قبل البدء

1. افتح [Issue](https://github.com/43midoo-del/Libya-Postal-Code/issues) لمناقشة التغيير الكبير.
2. انسخ المستودع واعمل فرعاً باسم واضح: `feature/postal-lookup` أو `fix/boundary-save`.

## معايير الكود

- PHP 8+ مع `declare(strict_types=1);` في الملفات الجديدة.
- اتبع نمط MVC الموجود: Controllers رفيعة، Models للـ SQL.
- الواجهة بالعربية واتجاه RTL.
- لا ترفع كلمات مرور أو ملفات `.mbtiles` كبيرة.

## قاعدة البيانات

- أي تغيير في الجداول يحتاج ملف SQL جديد في `database/migrations/` برقم تسلسلي.
- حدّث `database/README.md` بترتيب التنفيذ.

## سحب الطلب (Pull Request)

1. تأكد أن التطبيق يعمل محلياً بعد استيراد SQL.
2. اشرح التغيير في وصف الـ PR مع لقطات إن كان UI.
3. اربط Issue إن وُجد: `Closes #12`.

## الإبلاغ عن مشكلة

استخدم قالب Bug Report من تبويب Issues.
