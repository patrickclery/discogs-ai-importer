CREATE TABLE `discogs_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`spine_id` text NOT NULL,
	`search_id` text NOT NULL,
	`source` text NOT NULL,
	`release_id` integer NOT NULL,
	`rank` integer NOT NULL,
	`title` text NOT NULL,
	`artist` text,
	`year` integer,
	`country` text,
	`labels_json` text DEFAULT '[]' NOT NULL,
	`catno` text,
	`formats_json` text DEFAULT '[]' NOT NULL,
	`thumb_url` text,
	`master_id` integer,
	`stage` text,
	`catno_match` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`spine_id`) REFERENCES `spines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`search_id`) REFERENCES `discogs_searches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discogs_candidates_spine_source_release_idx` ON `discogs_candidates` (`spine_id`,`source`,`release_id`);--> statement-breakpoint
CREATE INDEX `discogs_candidates_spine_idx` ON `discogs_candidates` (`spine_id`);--> statement-breakpoint
CREATE TABLE `discogs_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`spine_id` text NOT NULL,
	`kind` text NOT NULL,
	`input_hash` text,
	`inputs_json` text DEFAULT '{}' NOT NULL,
	`query_text` text,
	`release_id` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text,
	`result_count` integer,
	`total_count` integer,
	`results_json` text,
	`error_kind` text,
	`error` text,
	`job_id` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`spine_id`) REFERENCES `spines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `discogs_searches_spine_idx` ON `discogs_searches` (`spine_id`,`created_at`);