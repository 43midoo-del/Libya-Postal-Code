-- Persisted map label anchor for boundary entities (city / area / street).
USE `libya_postal`;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'boundaries' AND COLUMN_NAME = 'label_lat'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `boundaries` ADD COLUMN `label_lat` DECIMAL(10, 7) NULL DEFAULT NULL AFTER `color`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'boundaries' AND COLUMN_NAME = 'label_lng'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `boundaries` ADD COLUMN `label_lng` DECIMAL(10, 7) NULL DEFAULT NULL AFTER `label_lat`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
