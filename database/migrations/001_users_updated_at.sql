-- =============================================================================
-- Phase 1 (re-runnable): إضافة updated_at لجدول users + فهرس اختياري
-- يُمكن تشغيله أكثر من مرة بدون كسر.
-- =============================================================================

USE `libya_postal`;

-- updated_at: قد يكون موجوداً مسبقاً
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'updated_at'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE `users`
       ADD COLUMN `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
       AFTER `created_at`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- أعطِ نفس قيمة created_at للسجلات الحالية حتى لا تظهر فارغة بعد الترقية
UPDATE `users` SET `updated_at` = `created_at` WHERE `updated_at` IS NULL;
