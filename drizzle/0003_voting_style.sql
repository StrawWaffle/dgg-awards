PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_votes` (
	`uid` integer NOT NULL,
	`at` integer NOT NULL,
	`categoryId` text NOT NULL,
	`optionId` text NOT NULL,
	`rank` integer DEFAULT 1 NOT NULL,
	`sessionSnapshot` text NOT NULL,
	PRIMARY KEY(`uid`, `categoryId`, `optionId`),
	FOREIGN KEY (`uid`) REFERENCES `users`(`uid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`optionId`,`categoryId`) REFERENCES `options`(`id`,`categoryId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_votes`("uid", "at", "categoryId", "optionId", "sessionSnapshot") SELECT "uid", "at", "categoryId", "optionId", "sessionSnapshot" FROM `votes`;--> statement-breakpoint
DROP TABLE `votes`;--> statement-breakpoint
ALTER TABLE `__new_votes` RENAME TO `votes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `categories` ADD `votingStyle` text;