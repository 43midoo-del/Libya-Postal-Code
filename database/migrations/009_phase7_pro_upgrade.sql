-- =============================================================================
-- Phase 7 — Libya Postal Pro Upgrade (Schema migration, re-runnable)
--
-- يحوي:
--   1) توسعة pc_sector إلى VARCHAR(2) (يقبل 1..2 خانة أبجدرقمية)
--   2) إضافة code/lat/lng لجداول regions / cities / areas + population/kind
--   3) جداول جديدة: boundaries, streets, map_annotations, tile_sync_log
--
-- يمكن تشغيله أكثر من مرة بدون أخطاء (يعتمد على information_schema).
-- =============================================================================

USE `libya_postal`;

-- -----------------------------------------------------------------------------
-- 0) helper: drop event-procedure pattern via prepared statements (idempotent)
-- -----------------------------------------------------------------------------
SET @schema = DATABASE();

-- -----------------------------------------------------------------------------
-- 1) Postal sector code: CHAR(1) → VARCHAR(2)
-- -----------------------------------------------------------------------------
-- addresses.pc_sector
SET @col_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'pc_sector'
);
SET @need := IF(@col_type IS NOT NULL AND @col_type <> 'varchar(2)', 1, 0);
SET @sql := IF(@need = 1,
  'ALTER TABLE `addresses` MODIFY `pc_sector` VARCHAR(2) NULL COMMENT ''1-2 alphanumeric (e.g. S, SA, A1, 9)''',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- postal_property_counters.sector_code (part of primary key — needs PK drop/recreate)
SET @col_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'postal_property_counters' AND COLUMN_NAME = 'sector_code'
);
SET @need := IF(@col_type IS NOT NULL AND @col_type <> 'varchar(2)', 1, 0);
SET @sql := IF(@need = 1,
  'ALTER TABLE `postal_property_counters`
     DROP PRIMARY KEY,
     MODIFY `sector_code` VARCHAR(2) NOT NULL,
     ADD PRIMARY KEY (`province_code`, `area_num`, `city_num`, `sector_code`)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 2) regions: code / lat / lng
-- -----------------------------------------------------------------------------
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'regions' AND COLUMN_NAME = 'code');
SET @sql := IF(@has = 0,
  'ALTER TABLE `regions` ADD COLUMN `code` VARCHAR(8) NULL COMMENT ''B1..F22''',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'regions' AND COLUMN_NAME = 'lat');
SET @sql := IF(@has = 0,
  'ALTER TABLE `regions` ADD COLUMN `lat` DECIMAL(10,7) NULL, ADD COLUMN `lng` DECIMAL(10,7) NULL',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'regions' AND INDEX_NAME = 'uk_regions_code');
SET @sql := IF(@has = 0,
  'ALTER TABLE `regions` ADD UNIQUE KEY `uk_regions_code` (`code`)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 3) cities: code / lat / lng / population
-- -----------------------------------------------------------------------------
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'code');
SET @sql := IF(@has = 0,
  'ALTER TABLE `cities` ADD COLUMN `code` VARCHAR(16) NULL COMMENT ''Region prefix + city slug (e.g. B2-DRN)''',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'lat');
SET @sql := IF(@has = 0,
  'ALTER TABLE `cities` ADD COLUMN `lat` DECIMAL(10,7) NULL, ADD COLUMN `lng` DECIMAL(10,7) NULL, ADD COLUMN `population` INT UNSIGNED NULL',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'cities' AND INDEX_NAME = 'uk_cities_code');
SET @sql := IF(@has = 0,
  'ALTER TABLE `cities` ADD UNIQUE KEY `uk_cities_code` (`code`)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 4) areas: code / lat / lng / kind (default | neighborhood | suburb | village)
-- -----------------------------------------------------------------------------
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'areas' AND COLUMN_NAME = 'code');
SET @sql := IF(@has = 0,
  'ALTER TABLE `areas` ADD COLUMN `code` VARCHAR(8) NULL COMMENT ''Sector letter/code within parent city''',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'areas' AND COLUMN_NAME = 'lat');
SET @sql := IF(@has = 0,
  'ALTER TABLE `areas` ADD COLUMN `lat` DECIMAL(10,7) NULL, ADD COLUMN `lng` DECIMAL(10,7) NULL, ADD COLUMN `kind` VARCHAR(16) NOT NULL DEFAULT ''neighborhood''',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'areas' AND INDEX_NAME = 'uk_areas_city_code');
SET @sql := IF(@has = 0,
  'ALTER TABLE `areas` ADD UNIQUE KEY `uk_areas_city_code` (`city_id`, `code`)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 5) boundaries (مخزن GeoJSON موحّد لكل المستويات)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `boundaries` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `level`      ENUM('state','region','city','area','street') NOT NULL,
  `entity_id`  INT UNSIGNED NOT NULL,
  `geojson`    LONGTEXT NOT NULL,
  `code`       VARCHAR(8) DEFAULT NULL,
  `color`      VARCHAR(16) DEFAULT NULL,
  `updated_by` INT UNSIGNED NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_boundaries_level_entity` (`level`, `entity_id`),
  KEY `idx_boundaries_level_code` (`level`, `code`),
  KEY `idx_boundaries_updated_by` (`updated_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Polygon/MultiPolygon boundaries for all geo levels (one row per entity)';

-- -----------------------------------------------------------------------------
-- 6) streets (تحت الحي/المنطقة) — اختياري لكل عنوان
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `streets` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(160) NOT NULL,
  `area_id`      INT UNSIGNED NOT NULL,
  `code`         VARCHAR(8) DEFAULT NULL,
  `geojson_line` LONGTEXT DEFAULT NULL,
  `created_by`   INT UNSIGNED NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_streets_area` (`area_id`),
  KEY `idx_streets_code` (`area_id`, `code`),
  CONSTRAINT `fk_streets_area`
    FOREIGN KEY (`area_id`) REFERENCES `areas` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Named streets within a neighborhood (area)';

-- -----------------------------------------------------------------------------
-- 7) map_annotations (POIs/rendering by users on map_pro page)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `map_annotations` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NULL,
  `kind`       ENUM('marker','polyline','polygon','symbol') NOT NULL,
  `label`      VARCHAR(160) DEFAULT NULL,
  `color`      VARCHAR(16) DEFAULT NULL,
  `icon`       VARCHAR(32) DEFAULT NULL,
  `geojson`    LONGTEXT NOT NULL,
  `is_public`  TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_map_ann_user` (`user_id`),
  KEY `idx_map_ann_public` (`is_public`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='User annotations on map_pro page';

-- -----------------------------------------------------------------------------
-- 8) tile_sync_log (سجل عمليات المزامنة اليدوية لخريطة الأوفلاين)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tile_sync_log` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `started_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at`      TIMESTAMP NULL DEFAULT NULL,
  `zmin`             TINYINT UNSIGNED NOT NULL,
  `zmax`             TINYINT UNSIGNED NOT NULL,
  `bbox_json`        VARCHAR(255) NOT NULL,
  `tiles_requested`  INT UNSIGNED NOT NULL DEFAULT 0,
  `tiles_downloaded` INT UNSIGNED NOT NULL DEFAULT 0,
  `tiles_failed`     INT UNSIGNED NOT NULL DEFAULT 0,
  `source`           VARCHAR(64) NOT NULL DEFAULT 'osm',
  `status`           ENUM('running','done','failed','cancelled') NOT NULL DEFAULT 'running',
  `note`             VARCHAR(255) DEFAULT NULL,
  `created_by`       INT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sync_status` (`status`),
  KEY `idx_sync_started` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Map tile sync history';

-- =============================================================================
-- End Phase 7
-- =============================================================================
