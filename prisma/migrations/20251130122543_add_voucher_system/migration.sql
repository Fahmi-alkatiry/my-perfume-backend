-- AlterTable
ALTER TABLE `transaksi` ADD COLUMN `diskon_voucher` DECIMAL(65, 30) NULL DEFAULT 0,
    ADD COLUMN `id_voucher` INTEGER NULL;

-- CreateTable
CREATE TABLE `voucher` (
    `id_voucher` INTEGER NOT NULL AUTO_INCREMENT,
    `kode_voucher` VARCHAR(191) NOT NULL,
    `tipe_diskon` ENUM('FIXED', 'PERCENTAGE') NOT NULL,
    `nilai_diskon` DECIMAL(65, 30) NOT NULL,
    `min_belanja` DECIMAL(65, 30) NULL DEFAULT 0,
    `maks_diskon` DECIMAL(65, 30) NULL,
    `tanggal_mulai` DATETIME(3) NOT NULL,
    `tanggal_berakhir` DATETIME(3) NOT NULL,
    `batas_pemakaian` INTEGER NOT NULL DEFAULT 0,
    `jumlah_terpakai` INTEGER NOT NULL DEFAULT 0,
    `aktif` BOOLEAN NOT NULL DEFAULT true,
    `dibuat_pada` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `diupdate_pada` DATETIME(3) NOT NULL,

    UNIQUE INDEX `voucher_kode_voucher_key`(`kode_voucher`),
    PRIMARY KEY (`id_voucher`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `transaksi` ADD CONSTRAINT `transaksi_id_voucher_fkey` FOREIGN KEY (`id_voucher`) REFERENCES `voucher`(`id_voucher`) ON DELETE SET NULL ON UPDATE CASCADE;
