ALTER TABLE `question_bank` DROP INDEX `question_bank_itemId_unique`;--> statement-breakpoint
ALTER TABLE `question_bank` ADD `version` varchar(8) DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `question_bank` ADD CONSTRAINT `item_version_idx` UNIQUE(`itemId`,`version`);