CREATE TABLE `experiment_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`condition` enum('AO','AJ') NOT NULL,
	`targetParticipants` int NOT NULL DEFAULT 30,
	`inviteToken` varchar(64) NOT NULL,
	`isOpen` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `experiment_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `experiment_config_condition_unique` UNIQUE(`condition`),
	CONSTRAINT `experiment_config_inviteToken_unique` UNIQUE(`inviteToken`)
);
