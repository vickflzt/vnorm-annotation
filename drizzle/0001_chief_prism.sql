CREATE TABLE `item_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`participantId` varchar(64) NOT NULL,
	`itemId` varchar(32) NOT NULL,
	`category` enum('TP','TN','FP','FN','GSM-CHECK') NOT NULL,
	`condition` enum('AO','AJ') NOT NULL,
	`questionIndex` int NOT NULL,
	`responseCorrect` boolean,
	`rtSeconds` float,
	`timedOut` boolean NOT NULL DEFAULT false,
	`helpfulness` int,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_responses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `participant_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`participantId` varchar(64) NOT NULL,
	`condition` enum('AO','AJ') NOT NULL,
	`assignedItems` json NOT NULL,
	`currentIndex` int NOT NULL DEFAULT 0,
	`status` enum('consent','instructions','active','completed','terminated') NOT NULL DEFAULT 'consent',
	`violationCount` int NOT NULL DEFAULT 0,
	`consentGiven` boolean NOT NULL DEFAULT false,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`totalTimeSeconds` float,
	`passedAttentionCheck` boolean,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `participant_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `participant_sessions_participantId_unique` UNIQUE(`participantId`)
);
--> statement-breakpoint
CREATE TABLE `question_bank` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` varchar(32) NOT NULL,
	`category` enum('TP','TN','FP','FN','GSM-CHECK') NOT NULL,
	`source` varchar(32) NOT NULL,
	`question` text NOT NULL,
	`goldAnswer` text,
	`extractedGoldAnswer` varchar(256),
	`response` text,
	`extractedResponseAnswer` varchar(256),
	`gtIsCorrect` boolean NOT NULL,
	`inferenceModel` varchar(128),
	`difficultyLevel` int,
	`subject` varchar(128),
	`uniqueId` varchar(256),
	`sourceCondition` varchar(32),
	`countAO` int NOT NULL DEFAULT 0,
	`countAJ` int NOT NULL DEFAULT 0,
	`targetCount` int NOT NULL DEFAULT 3,
	CONSTRAINT `question_bank_id` PRIMARY KEY(`id`),
	CONSTRAINT `question_bank_itemId_unique` UNIQUE(`itemId`)
);
--> statement-breakpoint
CREATE TABLE `violation_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`participantId` varchar(64) NOT NULL,
	`violationType` enum('tab_switch','window_blur','visibility_hidden','screenshot_attempt','copy_attempt','paste_attempt','right_click','devtools_open') NOT NULL,
	`questionIndex` int,
	`itemId` varchar(32),
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`sessionTerminated` boolean NOT NULL DEFAULT false,
	CONSTRAINT `violation_events_id` PRIMARY KEY(`id`)
);
