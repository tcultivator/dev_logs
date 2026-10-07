-- Add accounts and attach logs to a user.
-- Run once against an existing `devlog` database.
-- If a statement says the column or index already exists, skip that statement.

USE `devlog`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NULL,
  `image` TEXT NULL,
  `password_hash` VARCHAR(255) NULL,
  `auth_type` ENUM('google', 'gmail') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `email_otps` (
  `id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `purpose` ENUM('signup', 'signin') NOT NULL,
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `email_otps_lookup_idx` (`email`, `purpose`, `used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `projects`
  ADD COLUMN `user_id` VARCHAR(36) NULL AFTER `id`;

ALTER TABLE `projects`
  DROP INDEX `projects_name_unique`;

ALTER TABLE `projects`
  ADD UNIQUE KEY `projects_user_name_unique` (`user_id`, `name`);

ALTER TABLE `projects`
  ADD CONSTRAINT `projects_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE `entries`
  ADD COLUMN `user_id` VARCHAR(36) NULL AFTER `id`;

ALTER TABLE `entries`
  ADD KEY `entries_user_id_idx` (`user_id`);

ALTER TABLE `entries`
  ADD CONSTRAINT `entries_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- Existing logs stay unassigned (user_id IS NULL) so they are not visible
-- to every account. After you sign up, the app can attach them to you.
