CREATE TABLE `axiom_coop_rate` (
	`user_id` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`requests` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `axiom_coop_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`invite_code` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`body` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `axiom_coop_invite_unique` ON `axiom_coop_rooms` (`invite_code`);--> statement-breakpoint
CREATE INDEX `axiom_coop_owner_updated` ON `axiom_coop_rooms` (`owner_id`,`updated_at`);