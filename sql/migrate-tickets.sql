-- Migrate Dev Log from Progress/Todo/Reminder to Ticket workflow.
-- Run against an existing `devlog` database once.

USE `devlog`;

-- 1) Add ticket columns (safe if re-run fails; ignore duplicate-column errors)
ALTER TABLE `entries`
  ADD COLUMN `status` ENUM('OPEN', 'IN_PROGRESS', 'DONE') NULL AFTER `done`,
  ADD COLUMN `resolved_at` DATETIME(3) NULL AFTER `status`;

-- 2) Expand type enum so we can rewrite rows
ALTER TABLE `entries`
  MODIFY COLUMN `type` ENUM(
    'PROGRESS',
    'LEARNING',
    'DB_CHANGE',
    'SQL',
    'SNIPPET',
    'REMINDER',
    'TODO',
    'TICKET'
  ) NOT NULL;

-- 3) Convert open todos/reminders → open tickets
UPDATE `entries`
SET
  `type` = 'TICKET',
  `status` = 'OPEN',
  `done` = 0,
  `resolved_at` = NULL
WHERE `type` IN ('TODO', 'REMINDER') AND IFNULL(`done`, 0) = 0;

-- 4) Convert completed todos/reminders → done tickets
UPDATE `entries`
SET
  `type` = 'TICKET',
  `status` = 'DONE',
  `done` = 1,
  `resolved_at` = IFNULL(`resolved_at`, `updated_at`)
WHERE `type` IN ('TODO', 'REMINDER') AND IFNULL(`done`, 0) = 1;

-- 5) Convert progress entries → done tickets
UPDATE `entries`
SET
  `type` = 'TICKET',
  `status` = 'DONE',
  `done` = 1,
  `resolved_at` = IFNULL(`resolved_at`, `updated_at`)
WHERE `type` = 'PROGRESS';

-- 6) Ensure any ticket rows have a status
UPDATE `entries`
SET
  `status` = IF(IFNULL(`done`, 0) = 1, 'DONE', 'OPEN'),
  `done` = IF(IFNULL(`done`, 0) = 1, 1, 0),
  `resolved_at` = IF(
    IFNULL(`done`, 0) = 1,
    IFNULL(`resolved_at`, `updated_at`),
    NULL
  )
WHERE `type` = 'TICKET' AND `status` IS NULL;

-- 7) Clear status on note types
UPDATE `entries`
SET
  `status` = NULL,
  `resolved_at` = NULL,
  `done` = 0
WHERE `type` IN ('LEARNING', 'DB_CHANGE', 'SQL', 'SNIPPET');

-- 8) Shrink type enum to the new set
ALTER TABLE `entries`
  MODIFY COLUMN `type` ENUM(
    'TICKET',
    'LEARNING',
    'DB_CHANGE',
    'SQL',
    'SNIPPET'
  ) NOT NULL;

-- 9) Indexes for ticket filters / daily export
ALTER TABLE `entries` ADD INDEX `entries_status_idx` (`status`);
ALTER TABLE `entries` ADD INDEX `entries_resolved_at_idx` (`resolved_at`);
