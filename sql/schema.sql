CREATE DATABASE IF NOT EXISTS `devlog`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `devlog`;

CREATE TABLE IF NOT EXISTS `projects` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `projects_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `entries` (
  `id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` LONGTEXT NOT NULL,
  `type` ENUM(
    'TICKET',
    'LEARNING',
    'DB_CHANGE',
    'SQL',
    'SNIPPET'
  ) NOT NULL,
  `tags` TEXT NULL,
  `done` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('OPEN', 'IN_PROGRESS', 'DONE') NULL,
  `resolved_at` DATETIME(3) NULL,
  `project_id` VARCHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `entries_type_idx` (`type`),
  KEY `entries_status_idx` (`status`),
  KEY `entries_created_at_idx` (`created_at`),
  KEY `entries_resolved_at_idx` (`resolved_at`),
  KEY `entries_project_id_idx` (`project_id`),
  CONSTRAINT `entries_project_id_fkey`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
