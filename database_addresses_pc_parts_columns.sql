-- =============================================================================
-- أعمدة الرمز البريدي الخماسي في `addresses`: pc_province, pc_area, pc_city,
-- pc_sector, pc_property
--
-- للقواعد القديمة (قبل تحديث database.sql أو قبل تشغيل database_postal_5part.sql).
-- آمن لإعادة التشغيل عبر INFORMATION_SCHEMA (لا Duplicate column).
-- =============================================================================

USE `libya_postal`;

SET @db = DATABASE();

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'pc_province') > 0,
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses` ADD COLUMN `pc_province` CHAR(1) NULL COMMENT ''B | T | F'' AFTER `postal_code`'
  )
);
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'pc_area') > 0,
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses` ADD COLUMN `pc_area` SMALLINT UNSIGNED NULL AFTER `pc_province`'
  )
);
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'pc_city') > 0,
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses` ADD COLUMN `pc_city` SMALLINT UNSIGNED NULL AFTER `pc_area`'
  )
);
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'pc_sector') > 0,
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses` ADD COLUMN `pc_sector` CHAR(1) NULL AFTER `pc_city`'
  )
);
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'pc_property') > 0,
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses` ADD COLUMN `pc_property` INT UNSIGNED NULL AFTER `pc_sector`'
  )
);
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
