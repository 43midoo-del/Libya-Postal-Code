-- =============================================================================
-- حقول العنوان الوطني: ولاية، شعبية، منطقة/مدينة، رقم
--
-- للقواعد التي أُنشئت من database.sql القديم (بدون هذه الأعمدة).
-- آمن لإعادة التشغيل: الأعمدة الموجودة تُتخطّى (لا خطأ Duplicate column).
--
-- لا حاجة لهذا الملف إن أنشأت القاعدة من database.sql الحالي كاملاً؛ الأعمدة
-- مضمّنة في CREATE TABLE `addresses`.
-- =============================================================================

USE `libya_postal`;

SET @db = DATABASE();

-- wilayah
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'wilayah') > 0,
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses` ADD COLUMN `wilayah` VARCHAR(24) NULL COMMENT ''barqa | tripolitania | fezzan'' AFTER `area_id`'
  )
);
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- shabiya
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'shabiya') > 0,
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses` ADD COLUMN `shabiya` VARCHAR(80) NULL COMMENT ''اسم الشعبية'' AFTER `wilayah`'
  )
);
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- locality
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'locality') > 0,
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses` ADD COLUMN `locality` VARCHAR(200) NULL COMMENT ''منطقة أو مدينة'' AFTER `shabiya`'
  )
);
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- street_number
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'street_number') > 0,
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses` ADD COLUMN `street_number` VARCHAR(32) NULL COMMENT ''رقم المبنى/القطعة'' AFTER `locality`'
  )
);
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
