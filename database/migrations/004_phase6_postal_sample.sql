-- =============================================================================
-- Phase 6: postal counter table + minimal administrative + optional sample address
-- Run AFTER: database.sql (and after database_seed.sql for users, if you use it)
-- =============================================================================

USE `libya_postal`;

-- -----------------------------------------------------------------------------
-- Five-part postal: property serial per (province_code, area, city, sector)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `postal_property_counters` (
  `province_code` CHAR(1) NOT NULL COMMENT 'B | T | F',
  `area_num`      SMALLINT UNSIGNED NOT NULL,
  `city_num`      SMALLINT UNSIGNED NOT NULL,
  `sector_code`   CHAR(1) NOT NULL,
  `last_property` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`province_code`, `area_num`, `city_num`, `sector_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Five-part postal: auto property number (PostalCodeService / Address)';

-- One counter per area for NNNN in X-YY-ZZ-NNNN (legacy sequential per area row)
CREATE TABLE IF NOT EXISTS `postal_counters` (
  `area_id`   INT UNSIGNED NOT NULL,
  `last_n`    INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`area_id`),
  CONSTRAINT `fk_postal_counter_area`
    FOREIGN KEY (`area_id`) REFERENCES `areas` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Serial NNNN per area for unique postal code generation';

-- -----------------------------------------------------------------------------
-- Minimal administrative tree (one branch) — Arabic labels, development only
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO `states` (`id`, `name`, `code`) VALUES
(1, 'طرابلس', 'T');

INSERT IGNORE INTO `regions` (`id`, `name`, `state_id`) VALUES
(1, 'العاصمة (مثال)', 1);

INSERT IGNORE INTO `cities` (`id`, `name`, `region_id`) VALUES
(1, 'مركز طرابلس (مثال)', 1);

INSERT IGNORE INTO `areas` (`id`, `name`, `city_id`) VALUES
(1, 'سوق الجمعة (مثال)', 1);

INSERT IGNORE INTO `postal_counters` (`area_id`, `last_n`) VALUES (1, 0);

-- =============================================================================
-- If your DB already has conflicting IDs, adjust or DELETE FROM the tables first.
-- =============================================================================
