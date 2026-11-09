-- No IP addresses kept (StrawWaffle, 2026-11-09): sessions lose the column, and
-- every vote's copy of its session loses the address.
ALTER TABLE `sessions` DROP COLUMN `ip`;--> statement-breakpoint
UPDATE `votes` SET `sessionSnapshot` = json_remove(`sessionSnapshot`, '$.ip');
