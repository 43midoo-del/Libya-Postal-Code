-- =============================================================================
-- اسم الحامل / صاحب العقار اختياري: السماح بـ NULL في owner_name
--
-- للقواعد القديمة حيث كان العمود NOT NULL دون DEFAULT، بينما التطبيق يمرّر NULL
-- عند ترك الحقل فارغاً (address_new، JSON API).
--
-- آمن لإعادة التشغيل: إذا كان العمود nullable بالفعل لا يُنفَّذ ALTER.
-- =============================================================================

USE `libya_postal`;

SET @db = DATABASE();

SET @nullable := (
  SELECT IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'owner_name'
  LIMIT 1
);

SET @sql := IF(
  @nullable IS NULL,
  'SELECT NULL LIMIT 0',
  IF(@nullable = 'YES',
    'SELECT NULL LIMIT 0',
    'ALTER TABLE `addresses` MODIFY `owner_name` VARCHAR(200) NULL DEFAULT NULL COMMENT ''Holder (optional)'''
  )
);

PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
