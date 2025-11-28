-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CASHIER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('COMPLETED', 'CANCELLED', 'PENDING');

-- CreateEnum
CREATE TYPE "StockHistoryType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PERFUME', 'BOTTLE');

-- CreateTable
CREATE TABLE "pengguna" (
    "id_pengguna" SERIAL NOT NULL,
    "nama_pengguna" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,

    CONSTRAINT "pengguna_pkey" PRIMARY KEY ("id_pengguna")
);

-- CreateTable
CREATE TABLE "pelanggan" (
    "id_pelanggan" SERIAL NOT NULL,
    "nama_pelanggan" TEXT NOT NULL,
    "nomor_pelanggan" TEXT,
    "poin_pelanggan" INTEGER NOT NULL DEFAULT 0,
    "transaksi_terakhir" TIMESTAMP(3),
    "tanggal_dibuat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pelanggan_pkey" PRIMARY KEY ("id_pelanggan")
);

-- CreateTable
CREATE TABLE "produk" (
    "id_produk" SERIAL NOT NULL,
    "nama_produk" TEXT NOT NULL,
    "jenis_produk" "ProductType" NOT NULL,
    "description" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stok_minimum" INTEGER NOT NULL DEFAULT 5,
    "harga_beli" DECIMAL(65,30) NOT NULL,
    "harga_jual" DECIMAL(65,30) NOT NULL,
    "kode_produk" TEXT NOT NULL,

    CONSTRAINT "produk_pkey" PRIMARY KEY ("id_produk")
);

-- CreateTable
CREATE TABLE "metode_pembayaran" (
    "id_metode" SERIAL NOT NULL,
    "nama_metode" TEXT NOT NULL,
    "keterangan" TEXT,

    CONSTRAINT "metode_pembayaran_pkey" PRIMARY KEY ("id_metode")
);

-- CreateTable
CREATE TABLE "transaksi" (
    "id_transaksi" SERIAL NOT NULL,
    "waktu_transaksi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_harga" DECIMAL(65,30) NOT NULL,
    "diskon_total" DECIMAL(65,30) DEFAULT 0,
    "diskon_poin" DECIMAL(65,30) DEFAULT 0,
    "total_akhir" DECIMAL(65,30) NOT NULL,
    "total_margin" DECIMAL(65,30) DEFAULT 0,
    "poin_didapat" INTEGER DEFAULT 0,
    "poin_digunakan" INTEGER DEFAULT 0,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "id_metode" INTEGER,
    "id_pengguna" INTEGER,
    "id_pelanggan" INTEGER,

    CONSTRAINT "transaksi_pkey" PRIMARY KEY ("id_transaksi")
);

-- CreateTable
CREATE TABLE "detail_transaksi" (
    "id_detail" SERIAL NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "harga_jual_saat_itu" DECIMAL(65,30) NOT NULL,
    "harga_beli_saat_itu" DECIMAL(65,30) NOT NULL,
    "discount" DECIMAL(65,30) DEFAULT 0,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "total_harga_pokok" DECIMAL(65,30) NOT NULL,
    "total_margin" DECIMAL(65,30) NOT NULL,
    "id_transaksi" INTEGER NOT NULL,
    "id_produk" INTEGER NOT NULL,

    CONSTRAINT "detail_transaksi_pkey" PRIMARY KEY ("id_detail")
);

-- CreateTable
CREATE TABLE "riwayat_stok" (
    "id_riwayat" SERIAL NOT NULL,
    "type" "StockHistoryType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "keterangan" TEXT,
    "tipe_referensi" TEXT,
    "id_referensi" INTEGER,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_produk" INTEGER NOT NULL,
    "id_pengguna" INTEGER,

    CONSTRAINT "riwayat_stok_pkey" PRIMARY KEY ("id_riwayat")
);

-- CreateTable
CREATE TABLE "riwayat_poin" (
    "id_riwayat_poin" SERIAL NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pointsChange" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "id_pelanggan" INTEGER NOT NULL,
    "id_transaksi" INTEGER,

    CONSTRAINT "riwayat_poin_pkey" PRIMARY KEY ("id_riwayat_poin")
);

-- CreateIndex
CREATE UNIQUE INDEX "pengguna_username_key" ON "pengguna"("username");

-- CreateIndex
CREATE UNIQUE INDEX "pelanggan_nomor_pelanggan_key" ON "pelanggan"("nomor_pelanggan");

-- CreateIndex
CREATE UNIQUE INDEX "produk_kode_produk_key" ON "produk"("kode_produk");

-- AddForeignKey
ALTER TABLE "transaksi" ADD CONSTRAINT "transaksi_id_metode_fkey" FOREIGN KEY ("id_metode") REFERENCES "metode_pembayaran"("id_metode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaksi" ADD CONSTRAINT "transaksi_id_pengguna_fkey" FOREIGN KEY ("id_pengguna") REFERENCES "pengguna"("id_pengguna") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaksi" ADD CONSTRAINT "transaksi_id_pelanggan_fkey" FOREIGN KEY ("id_pelanggan") REFERENCES "pelanggan"("id_pelanggan") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detail_transaksi" ADD CONSTRAINT "detail_transaksi_id_transaksi_fkey" FOREIGN KEY ("id_transaksi") REFERENCES "transaksi"("id_transaksi") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detail_transaksi" ADD CONSTRAINT "detail_transaksi_id_produk_fkey" FOREIGN KEY ("id_produk") REFERENCES "produk"("id_produk") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riwayat_stok" ADD CONSTRAINT "riwayat_stok_id_produk_fkey" FOREIGN KEY ("id_produk") REFERENCES "produk"("id_produk") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riwayat_stok" ADD CONSTRAINT "riwayat_stok_id_pengguna_fkey" FOREIGN KEY ("id_pengguna") REFERENCES "pengguna"("id_pengguna") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riwayat_poin" ADD CONSTRAINT "riwayat_poin_id_pelanggan_fkey" FOREIGN KEY ("id_pelanggan") REFERENCES "pelanggan"("id_pelanggan") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riwayat_poin" ADD CONSTRAINT "riwayat_poin_id_transaksi_fkey" FOREIGN KEY ("id_transaksi") REFERENCES "transaksi"("id_transaksi") ON DELETE SET NULL ON UPDATE CASCADE;
