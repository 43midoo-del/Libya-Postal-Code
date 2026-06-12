-- Wilayah boundary colors (source of truth alongside boundaries.color for states/regions)
USE `libya_postal`;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'states' AND COLUMN_NAME = 'color'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `states` ADD COLUMN `color` VARCHAR(16) DEFAULT NULL AFTER `code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `states` SET `color` = '#ef4444' WHERE `code` = 'B' AND (`color` IS NULL OR `color` = '');
UPDATE `states` SET `color` = '#22c55e' WHERE `code` = 'T' AND (`color` IS NULL OR `color` = '');
UPDATE `states` SET `color` = '#cbd5e1' WHERE `code` = 'F' AND (`color` IS NULL OR `color` = '');
