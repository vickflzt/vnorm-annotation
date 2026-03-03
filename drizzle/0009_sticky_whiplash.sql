ALTER TABLE `question_bank` DROP INDEX `item_version_idx`;--> statement-breakpoint
ALTER TABLE `question_bank` ADD CONSTRAINT `question_bank_itemId_unique` UNIQUE(`itemId`);--> statement-breakpoint
ALTER TABLE `question_bank` DROP COLUMN `version`;