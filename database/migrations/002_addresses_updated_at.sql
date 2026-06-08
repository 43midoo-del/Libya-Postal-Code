-- =============================================================================
-- Phase 4 (re-runnable): إضافة updated_at إلى جدول addresses
-- =============================================================================

USE `libya_postal`;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'addresses' AND column_name = 'updated_at'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE `addresses`
       ADD COLUMN `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
       AFTER `created_at`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `addresses` SET `updated_at` = `created_at` WHERE `updated_at` IS NULL;
