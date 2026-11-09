CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`uid` text NOT NULL,
	FOREIGN KEY (`uid`) REFERENCES `users`(`uid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `states` (
	`id` text PRIMARY KEY NOT NULL,
	`verifier` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`uid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
