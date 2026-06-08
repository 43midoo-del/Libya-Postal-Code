-- =============================================================================
-- Smart Postal Address Management System (Libya)
-- STEP 1: Database schema
-- MySQL 8+ recommended (utf8mb4, InnoDB)
-- =============================================================================

-- Create database (adjust name if your hosting uses a prefix)
CREATE DATABASE IF NOT EXISTS `libya_postal`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `libya_postal`;

-- -----------------------------------------------------------------------------
-- 1) users: system accounts and roles
-- -----------------------------------------------------------------------------
CREATE TABLE `users` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(120)   NOT NULL,
  `email`         VARCHAR(255)   NOT NULL,
  `password`      VARCHAR(255)   NOT NULL,
  `role`          ENUM('admin', 'employee', 'citizen') NOT NULL DEFAULT 'citizen',
  `created_at`    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Application users; roles control access to features';

-- -----------------------------------------------------------------------------
-- 2) states: top-level division (e.g. municipality / wilayat)
-- -----------------------------------------------------------------------------
CREATE TABLE `states` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(120)   NOT NULL,
  `code`          VARCHAR(5)     NOT NULL COMMENT 'Used as X in postal code X-YY-ZZ-NNNN',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_states_name` (`name`),
  UNIQUE KEY `uk_states_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='First level administrative division';

-- -----------------------------------------------------------------------------
-- 3) regions: under a state
-- -----------------------------------------------------------------------------
CREATE TABLE `regions` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(120)   NOT NULL,
  `state_id`      INT UNSIGNED   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_regions_state` (`state_id`),
  CONSTRAINT `fk_regions_state`
    FOREIGN KEY (`state_id`) REFERENCES `states` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Second level division (e.g. district)';

-- -----------------------------------------------------------------------------
-- 4) cities: under a region
-- -----------------------------------------------------------------------------
CREATE TABLE `cities` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(120)   NOT NULL,
  `region_id`     INT UNSIGNED   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cities_region` (`region_id`),
  CONSTRAINT `fk_cities_region`
    FOREIGN KEY (`region_id`) REFERENCES `regions` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='City or municipality under a region';

-- -----------------------------------------------------------------------------
-- 5) areas: under a city (neighborhoods / local areas)
-- -----------------------------------------------------------------------------
CREATE TABLE `areas` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(120)   NOT NULL,
  `city_id`       INT UNSIGNED   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_areas_city` (`city_id`),
  CONSTRAINT `fk_areas_city`
    FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Smallest area used to link a postal address';

-- -----------------------------------------------------------------------------
-- 6) addresses: GIS location + owner + unique postal code
--
-- ترقية قديمة: إن وُجدت قاعدة بدون أعمدة wilayah / shabiya / locality /
-- street_number، نفّذ database_address_location_fields.sql (قابل لإعادة التشغيل).
-- إن كان عمود owner_name غير nullable وتظهر أخطاء عند الحقل الفارغ، نفّذ
-- database_addresses_owner_name_nullable.sql (قابل لإعادة التشغيل).
-- -----------------------------------------------------------------------------
CREATE TABLE `addresses` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_name`         VARCHAR(200)   DEFAULT NULL COMMENT 'Holder (optional)',
  `type`               VARCHAR(50)    NOT NULL DEFAULT 'residential' COMMENT 'residential | government | commercial',
  `latitude`           DECIMAL(10, 7) NOT NULL,
  `longitude`          DECIMAL(10, 7) NOT NULL,
  `postal_code`        VARCHAR(32)    NOT NULL COMMENT 'Format: X AA-C-S N (e.g. B 2-1-S 9), unique',
  `pc_province`        CHAR(1)        DEFAULT NULL COMMENT 'B | T | F',
  `pc_area`            SMALLINT UNSIGNED DEFAULT NULL,
  `pc_city`            SMALLINT UNSIGNED DEFAULT NULL,
  `pc_sector`          CHAR(1)        DEFAULT NULL,
  `pc_property`        INT UNSIGNED   DEFAULT NULL,
  `apartment_number`   VARCHAR(32)    DEFAULT NULL,
  `created_by`         INT UNSIGNED   NOT NULL,
  `area_id`            INT UNSIGNED   NOT NULL,
  `wilayah`            VARCHAR(24)    DEFAULT NULL COMMENT 'barqa | tripolitania | fezzan',
  `shabiya`            VARCHAR(80)    DEFAULT NULL COMMENT 'اسم الشعبية',
  `locality`           VARCHAR(200)   DEFAULT NULL COMMENT 'منطقة أو مدينة',
  `street_number`      VARCHAR(32)    DEFAULT NULL COMMENT 'رقم المبنى/القطعة',
  `created_at`         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_addresses_postal` (`postal_code`),
  UNIQUE KEY `uk_addresses_coords` (`latitude`, `longitude`),
  KEY `idx_addresses_area` (`area_id`),
  KEY `idx_addresses_owner` (`owner_name`),
  KEY `idx_addresses_created_by` (`created_by`),
  CONSTRAINT `fk_addresses_area`
    FOREIGN KEY (`area_id`) REFERENCES `areas` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_addresses_user`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Final addresses with coordinates; duplicate (lat, lng) is blocked at DB level';

-- -----------------------------------------------------------------------------
-- 7) postal_property_counters: property serial per (province, area, city, sector)
-- -----------------------------------------------------------------------------
CREATE TABLE `postal_property_counters` (
  `province_code` CHAR(1) NOT NULL COMMENT 'B | T | F',
  `area_num`      SMALLINT UNSIGNED NOT NULL,
  `city_num`      SMALLINT UNSIGNED NOT NULL,
  `sector_code`   CHAR(1) NOT NULL,
  `last_property` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`province_code`, `area_num`, `city_num`, `sector_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Five-part code: auto property number';

-- -----------------------------------------------------------------------------
-- 8) shabiya_city_places: مدن أساسية داخل كل شعبية — للقوائم دون انتظار Overpass
-- -----------------------------------------------------------------------------
CREATE TABLE `shabiya_city_places` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shabiya_name`   VARCHAR(64) NOT NULL,
  `shabiya_code`   VARCHAR(8) DEFAULT NULL,
  `place_name`     VARCHAR(200) NOT NULL,
  `lat`            DECIMAL(10,7) NOT NULL,
  `lng`            DECIMAL(10,7) NOT NULL,
  `place_kind`     VARCHAR(16) NOT NULL DEFAULT 'town' COMMENT 'city|town|village — للتكبير على الخريطة',
  `sort_order`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_sh_place` (`shabiya_name`(32), `place_name`(64)),
  KEY `idx_sh_name` (`shabiya_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- End of schema
-- (Seed data and default admin: added in a later step when auth is ready)
-- =============================================================================
