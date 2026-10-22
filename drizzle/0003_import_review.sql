CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`spine_id` text NOT NULL,
	`candidate_id` text,
	`release_id` integer NOT NULL,
	`folder_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`allow_duplicate` integer DEFAULT false NOT NULL,
	`adopted` integer DEFAULT false NOT NULL,
	`linked` integer DEFAULT false NOT NULL,
	`instance_id` integer,
	`intent_at` integer,
	`snapshot_json` text,
	`existing_json` text,
	`candidate_json` text,
	`post_count` integer DEFAULT 0 NOT NULL,
	`error_kind` text,
	`error` text,
	`job_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`imported_at` integer,
	FOREIGN KEY (`spine_id`) REFERENCES `spines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imports_spine_open_idx` ON `imports` (`spine_id`) WHERE "imports"."status" <> 'failed';--> statement-breakpoint
CREATE UNIQUE INDEX `imports_instance_idx` ON `imports` (`instance_id`) WHERE "imports"."instance_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `imports_release_idx` ON `imports` (`release_id`);--> statement-breakpoint
ALTER TABLE `spines` ADD `not_on_discogs` integer DEFAULT false NOT NULL;