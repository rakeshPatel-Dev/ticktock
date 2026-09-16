CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`topic` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`paused_seconds` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`outcome` text,
	`goal` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `started_at_idx` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `sessions` (`status`);--> statement-breakpoint
CREATE INDEX `subject_idx` ON `sessions` (`subject`);