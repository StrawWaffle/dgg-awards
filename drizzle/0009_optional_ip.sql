-- The IP column back, empty unless Settings → Privacy keeps addresses
-- (recordIp, off by default; 0008 had dropped it).
ALTER TABLE `sessions` ADD `ip` text;