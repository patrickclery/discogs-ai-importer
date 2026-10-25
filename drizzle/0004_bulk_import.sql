CREATE TABLE `bulk_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`spine_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`outcome` text,
	`skip_reason` text,
	`dup_spine_id` text,
	`release_id` integer,
	`country` text,
	`import_id` text,
	`error_kind` text,
	`error` text,
	`job_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `bulk_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`spine_id`) REFERENCES `spines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bulk_items_spine_open_idx` ON `bulk_items` (`spine_id`) WHERE "bulk_items"."status" = 'queued';--> statement-breakpoint
CREATE INDEX `bulk_items_run_idx` ON `bulk_items` (`run_id`);--> statement-breakpoint
CREATE INDEX `bulk_items_spine_idx` ON `bulk_items` (`spine_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bulk_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` integer NOT NULL,
	`country` text NOT NULL,
	`total` integer NOT NULL,
	`created_at` integer NOT NULL
);
