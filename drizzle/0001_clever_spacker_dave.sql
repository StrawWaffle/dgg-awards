CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `configuration` (
	`key` text PRIMARY KEY NOT NULL,
	`val` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `options` (
	`id` text NOT NULL,
	`categoryId` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`url` text,
	`imageId` text,
	`videoId` text,
	`renderType` text,
	PRIMARY KEY(`id`, `categoryId`),
	FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`uid` integer NOT NULL,
	`at` integer NOT NULL,
	`categoryId` text NOT NULL,
	`optionId` text NOT NULL,
	`sessionSnapshot` text NOT NULL,
	PRIMARY KEY(`uid`, `categoryId`),
	FOREIGN KEY (`uid`) REFERENCES `users`(`uid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`optionId`,`categoryId`) REFERENCES `options`(`id`,`categoryId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`uid` integer NOT NULL,
	`ip` text NOT NULL,
	`agent` text NOT NULL,
	FOREIGN KEY (`uid`) REFERENCES `users`(`uid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "createdAt", "expiresAt", "uid", "ip", "agent") SELECT "id", "createdAt", "expiresAt", "uid", "ip", "agent" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sessions_uid_idx` ON `sessions` (`uid`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `__new_users` (
	`uid` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`createdDate` text NOT NULL,
	`admin` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("uid", "name", "createdDate", "admin") SELECT "uid", "name", "createdDate", "admin" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;