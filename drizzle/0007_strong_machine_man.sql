CREATE TABLE `mix_session_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int NOT NULL,
	`items` json NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mix_session_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `experiment_config` MODIFY COLUMN `condition` enum('AO','AJ','MIX') NOT NULL;--> statement-breakpoint
ALTER TABLE `participant_sessions` MODIFY COLUMN `condition` enum('AO','AJ','MIX') NOT NULL;--> statement-breakpoint
ALTER TABLE `participant_sessions` ADD `mixTemplateId` int;--> statement-breakpoint
ALTER TABLE `participant_sessions` ADD `mixSlot` int;