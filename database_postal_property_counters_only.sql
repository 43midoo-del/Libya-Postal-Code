-- =============================================================================
-- Minimal fix: `postal_property_counters` missing (five-part postal code).
-- Safe to run repeatedly (IF NOT EXISTS). Used by PostalCodeService + Address::create.
-- Run AFTER `database.sql` (database `libya_postal` must exist).
-- See also full five-part rollout: database_postal_5part.sql
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
  COMMENT='Five-part postal: serial property number per province/area/city/sector';
