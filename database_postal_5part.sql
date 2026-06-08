-- =============================================================================
-- Five-part postal code: [Province] [Area]-[City]-[Sector] [Property]
-- Example: B 2-1-S 9 — run once on existing databases after backup.
-- =============================================================================

USE `libya_postal`;

CREATE TABLE IF NOT EXISTS `postal_property_counters` (
  `province_code` CHAR(1) NOT NULL COMMENT 'B | T | F',
  `area_num`      SMALLINT UNSIGNED NOT NULL,
  `city_num`      SMALLINT UNSIGNED NOT NULL,
  `sector_code`   CHAR(1) NOT NULL,
  `last_property` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`province_code`, `area_num`, `city_num`, `sector_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Auto-increment property number per province/area/city/sector';

-- Optional holder: allow NULL owner_name
ALTER TABLE `addresses` MODIFY `owner_name` VARCHAR(200) NULL COMMENT 'Holder / beneficiary (optional)';

ALTER TABLE `addresses`
  ADD COLUMN `pc_province` CHAR(1) NULL COMMENT 'B T F' AFTER `postal_code`,
  ADD COLUMN `pc_area` SMALLINT UNSIGNED NULL AFTER `pc_province`,
  ADD COLUMN `pc_city` SMALLINT UNSIGNED NULL AFTER `pc_area`,
  ADD COLUMN `pc_sector` CHAR(1) NULL AFTER `pc_city`,
  ADD COLUMN `pc_property` INT UNSIGNED NULL AFTER `pc_sector`;

-- If MySQL errors with "Duplicate column", remove the lines for columns you already added.
