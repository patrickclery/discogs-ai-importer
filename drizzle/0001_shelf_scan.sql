CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`original_name` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`original_path` text NOT NULL,
	`thumb_path` text,
	`latest_run_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_sha256_unique` ON `photos` (`sha256`);--> statement-breakpoint
CREATE TABLE `spine_detections` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`idx` integer NOT NULL,
	`position` integer,
	`media_kind` text NOT NULL,
	`x1` integer,
	`y1` integer,
	`x2` integer,
	`y2` integer,
	`text_orientation` text,
	`legibility` text,
	`fields_json` text DEFAULT '{}' NOT NULL,
	`crop_path` text,
	`crop_w` integer,
	`crop_h` integer,
	`spine_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `vision_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `spine_detections_run_idx` ON `spine_detections` (`run_id`);--> statement-breakpoint
CREATE INDEX `spine_detections_spine_idx` ON `spine_detections` (`spine_id`);--> statement-breakpoint
CREATE TABLE `spine_fields` (
	`spine_id` text NOT NULL,
	`field` text NOT NULL,
	`ai_value` text,
	`value` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`edit_base_ai_value` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`spine_id`, `field`),
	FOREIGN KEY (`spine_id`) REFERENCES `spines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `spines` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`current_detection_id` text,
	`created_run_id` text,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `spines_photo_state_idx` ON `spines` (`photo_id`,`state`);--> statement-breakpoint
CREATE TABLE `vision_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`run_no` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_kind` text,
	`error_reason` text,
	`job_id` text,
	`model` text,
	`effort` text,
	`prompt_version` integer NOT NULL,
	`schema_version` integer NOT NULL,
	`max_edge` integer,
	`max_tokens` integer,
	`source_w` integer,
	`source_h` integer,
	`vision_w` integer,
	`vision_h` integer,
	`vision_path` text,
	`raw_path` text,
	`reported_w` integer,
	`reported_h` integer,
	`spine_count_estimate` integer,
	`detected_count` integer,
	`cd_count` integer,
	`density_flags` text DEFAULT '[]' NOT NULL,
	`duration_ms` integer,
	`cost_usd` real,
	`usage_json` text,
	`spawned_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vision_runs_photo_run_idx` ON `vision_runs` (`photo_id`,`run_no`);--> statement-breakpoint
CREATE INDEX `vision_runs_status_idx` ON `vision_runs` (`status`);