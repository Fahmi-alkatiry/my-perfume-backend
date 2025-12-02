-- AlterTable
ALTER TABLE `pelanggan` ADD COLUMN `frequencyScore` INTEGER NULL DEFAULT 0,
    ADD COLUMN `lastAnalysisDate` DATETIME(3) NULL,
    ADD COLUMN `monetaryScore` INTEGER NULL DEFAULT 0,
    ADD COLUMN `recencyScore` INTEGER NULL DEFAULT 0,
    ADD COLUMN `segmen_pelanggan` VARCHAR(191) NULL;
