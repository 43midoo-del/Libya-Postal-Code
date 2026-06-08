-- =============================================================================
-- Optional seed: default administrator (run AFTER database.sql and change password in production)
-- Default login (development only):
--   Email: admin@libyapostal.local
--   Password: admin123
-- Hash generated with PHP password_hash(..., PASSWORD_DEFAULT)
-- =============================================================================

USE `libya_postal`;

-- Re-run: DELETE FROM `users` WHERE `email` = 'admin@libyapostal.local';

INSERT INTO `users` (`name`, `email`, `password`, `role`, `created_at`)
VALUES (
  'System Administrator',
  'admin@libyapostal.local',
  '$2y$10$HyVfrdrgS4uLZ2ObNY1dk.F2zkiXHL1v7BY/Q/Jc8TK2dU4a67CZy',
  'admin',
  NOW()
);
