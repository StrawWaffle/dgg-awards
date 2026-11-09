CREATE TABLE `history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`uid` integer,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`action` text NOT NULL,
	`categoryId` text,
	`nomineeId` text,
	`label` text NOT NULL,
	`before` text,
	`after` text,
	`revertOf` integer
);
--> statement-breakpoint
CREATE INDEX `history_target_idx` ON `history` (`categoryId`,`nomineeId`);--> statement-breakpoint
CREATE INDEX `history_revert_idx` ON `history` (`revertOf`);