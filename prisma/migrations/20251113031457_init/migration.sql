-- CreateTable
CREATE TABLE `pengguna` (
    `id_pengguna` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_pengguna` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'CASHIER') NOT NULL,

    UNIQUE INDEX `pengguna_username_key`(`username`),
    PRIMARY KEY (`id_pengguna`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pelanggan` (
    `id_pelanggan` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_pelanggan` VARCHAR(191) NOT NULL,
    `nomor_pelanggan` VARCHAR(191) NULL,
    `poin_pelanggan` INTEGER NOT NULL DEFAULT 0,
    `transaksi_terakhir` DATETIME(3) NULL,

    UNIQUE INDEX `pelanggan_nomor_pelanggan_key`(`nomor_pelanggan`),
    PRIMARY KEY (`id_pelanggan`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produk` (
    `id_produk` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_produk` VARCHAR(191) NOT NULL,
    `jenis_produk` ENUM('PERFUME', 'BOTTLE') NOT NULL,
    `description` VARCHAR(191) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `stok_minimum` INTEGER NOT NULL DEFAULT 5,
    `harga_beli` DECIMAL(65, 30) NOT NULL,
    `harga_jual` DECIMAL(65, 30) NOT NULL,
    `kode_produk` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `produk_kode_produk_key`(`kode_produk`),
    PRIMARY KEY (`id_produk`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metode_pembayaran` (
    `id_metode` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_metode` VARCHAR(191) NOT NULL,
    `keterangan` VARCHAR(191) NULL,

    PRIMARY KEY (`id_metode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transaksi` (
    `id_transaksi` INTEGER NOT NULL AUTO_INCREMENT,
    `waktu_transaksi` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `total_harga` DECIMAL(65, 30) NOT NULL,
    `diskon_total` DECIMAL(65, 30) NULL DEFAULT 0,
    `diskon_poin` DECIMAL(65, 30) NULL DEFAULT 0,
    `total_akhir` DECIMAL(65, 30) NOT NULL,
    `total_margin` DECIMAL(65, 30) NULL DEFAULT 0,
    `poin_didapat` INTEGER NULL DEFAULT 0,
    `poin_digunakan` INTEGER NULL DEFAULT 0,
    `status` ENUM('COMPLETED', 'CANCELLED', 'PENDING') NOT NULL DEFAULT 'COMPLETED',
    `id_metode` INTEGER NULL,
    `id_pengguna` INTEGER NULL,
    `id_pelanggan` INTEGER NULL,

    PRIMARY KEY (`id_transaksi`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detail_transaksi` (
    `id_detail` INTEGER NOT NULL AUTO_INCREMENT,
    `jumlah` INTEGER NOT NULL,
    `harga_jual_saat_itu` DECIMAL(65, 30) NOT NULL,
    `harga_beli_saat_itu` DECIMAL(65, 30) NOT NULL,
    `discount` DECIMAL(65, 30) NULL DEFAULT 0,
    `subtotal` DECIMAL(65, 30) NOT NULL,
    `total_harga_pokok` DECIMAL(65, 30) NOT NULL,
    `total_margin` DECIMAL(65, 30) NOT NULL,
    `id_transaksi` INTEGER NOT NULL,
    `id_produk` INTEGER NOT NULL,

    PRIMARY KEY (`id_detail`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `riwayat_stok` (
    `id_riwayat` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('IN', 'OUT', 'ADJUSTMENT') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `keterangan` VARCHAR(191) NULL,
    `tipe_referensi` VARCHAR(191) NULL,
    `id_referensi` INTEGER NULL,
    `tanggal` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `id_produk` INTEGER NOT NULL,
    `id_pengguna` INTEGER NULL,

    PRIMARY KEY (`id_riwayat`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `riwayat_poin` (
    `id_riwayat_poin` INTEGER NOT NULL AUTO_INCREMENT,
    `tanggal` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `pointsChange` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `id_pelanggan` INTEGER NOT NULL,
    `id_transaksi` INTEGER NULL,

    PRIMARY KEY (`id_riwayat_poin`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `transaksi` ADD CONSTRAINT `transaksi_id_metode_fkey` FOREIGN KEY (`id_metode`) REFERENCES `metode_pembayaran`(`id_metode`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transaksi` ADD CONSTRAINT `transaksi_id_pengguna_fkey` FOREIGN KEY (`id_pengguna`) REFERENCES `pengguna`(`id_pengguna`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transaksi` ADD CONSTRAINT `transaksi_id_pelanggan_fkey` FOREIGN KEY (`id_pelanggan`) REFERENCES `pelanggan`(`id_pelanggan`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detail_transaksi` ADD CONSTRAINT `detail_transaksi_id_transaksi_fkey` FOREIGN KEY (`id_transaksi`) REFERENCES `transaksi`(`id_transaksi`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detail_transaksi` ADD CONSTRAINT `detail_transaksi_id_produk_fkey` FOREIGN KEY (`id_produk`) REFERENCES `produk`(`id_produk`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `riwayat_stok` ADD CONSTRAINT `riwayat_stok_id_produk_fkey` FOREIGN KEY (`id_produk`) REFERENCES `produk`(`id_produk`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `riwayat_stok` ADD CONSTRAINT `riwayat_stok_id_pengguna_fkey` FOREIGN KEY (`id_pengguna`) REFERENCES `pengguna`(`id_pengguna`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `riwayat_poin` ADD CONSTRAINT `riwayat_poin_id_pelanggan_fkey` FOREIGN KEY (`id_pelanggan`) REFERENCES `pelanggan`(`id_pelanggan`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `riwayat_poin` ADD CONSTRAINT `riwayat_poin_id_transaksi_fkey` FOREIGN KEY (`id_transaksi`) REFERENCES `transaksi`(`id_transaksi`) ON DELETE SET NULL ON UPDATE CASCADE;
