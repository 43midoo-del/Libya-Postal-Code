-- =============================================================================
-- Address property parcel boundaries (user-drawn on add-address map)
-- =============================================================================

USE `libya_postal`;

SET @db = DATABASE();

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'parcel_geojson') > 0,
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses`
       ADD COLUMN `parcel_geojson` LONGTEXT NULL
         COMMENT ''GeoJSON Polygon/MultiPolygon/FeatureCollection for property bounds''
         AFTER `street_number`,
       ADD COLUMN `parcel_desc` VARCHAR(500) NULL
         COMMENT ''Optional tooltip for parcel boundary''
         AFTER `parcel_geojson`'
  )
);
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
