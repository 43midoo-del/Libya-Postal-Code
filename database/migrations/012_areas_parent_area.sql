-- Sub-neighborhoods: area nested inside another area (e.g. المغار within البلاد)
USE `libya_postal`;

SET @schema = DATABASE();

SET @has := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'areas' AND COLUMN_NAME = 'parent_area_id'
);
SET @sql := IF(@has = 0,
  'ALTER TABLE `areas`
     ADD COLUMN `parent_area_id` INT UNSIGNED NULL DEFAULT NULL AFTER `city_id`,
     ADD KEY `idx_areas_parent_area` (`parent_area_id`),
     ADD CONSTRAINT `fk_areas_parent_area`
       FOREIGN KEY (`parent_area_id`) REFERENCES `areas` (`id`)
       ON UPDATE CASCADE ON DELETE RESTRICT',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- المغار (MG) is a sub-neighborhood inside البلاد (BL) in Derna
SET @has := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'areas' AND COLUMN_NAME = 'parent_area_id'
);
SET @sql := IF(@has > 0,
  'UPDATE areas mg
   INNER JOIN areas bl ON bl.city_id = mg.city_id AND bl.code = ''BL''
   SET mg.parent_area_id = bl.id
   WHERE mg.code = ''MG'' AND mg.name = ''المغار'' AND mg.parent_area_id IS NULL',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
