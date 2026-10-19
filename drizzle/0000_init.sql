CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`lane` text NOT NULL,
	`type` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`run_after` integer NOT NULL,
	`dedupe_key` text,
	`locked_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_dedupe_key_unique` ON `jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `jobs_claim_idx` ON `jobs` (`lane`,`status`,`run_after`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `worker_lease` (
	`id` integer PRIMARY KEY NOT NULL,
	`boot_id` text NOT NULL,
	`pid` integer NOT NULL,
	`heartbeat_at` integer NOT NULL,
	`acquired_at` integer NOT NULL
);
