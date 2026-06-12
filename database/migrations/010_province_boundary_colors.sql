-- =============================================================================
-- Update wilayah/shabiya boundary colors:
--   B برقة  → أحمر  #ef4444
--   T طرابلس → أخضر  #22c55e
--   F فزان  → رمادي فاتح #cbd5e1
-- =============================================================================

USE `libya_postal`;

UPDATE `boundaries` b
INNER JOIN `states` s ON b.`level` = 'state' AND b.`entity_id` = s.`id`
SET b.`color` = CASE UPPER(TRIM(s.`code`))
    WHEN 'B' THEN '#ef4444'
    WHEN 'T' THEN '#22c55e'
    WHEN 'F' THEN '#cbd5e1'
    ELSE b.`color`
END;

UPDATE `boundaries` b
INNER JOIN `regions` r ON b.`level` = 'region' AND b.`entity_id` = r.`id`
SET b.`color` = CASE UPPER(LEFT(COALESCE(b.`code`, r.`code`, ''), 1))
    WHEN 'B' THEN '#ef4444'
    WHEN 'T' THEN '#22c55e'
    WHEN 'F' THEN '#cbd5e1'
    ELSE b.`color`
END;
