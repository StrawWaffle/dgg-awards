ALTER TABLE `categories` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `options` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Keep the order things were shown in until now: insertion order.
UPDATE `categories` SET `position` = `rowid`;--> statement-breakpoint
UPDATE `options` SET `position` = `rowid`;
