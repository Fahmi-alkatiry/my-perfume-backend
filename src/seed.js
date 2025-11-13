// src/seed.js
import { PrismaClient } from '@prisma/client';
import produkJson from './produk.json' assert { type: 'json' };
import pelangganJson from './pelanggan.json' assert { type: 'json' }; // <-- FILE BARU DITAMBAHKAN

const prisma = new PrismaClient();

// Fungsi untuk seeding produk
async function seedProducts() {
  console.log('Memulai seeding produk...');
  const originalData = produkJson[2].data;

  const transformedData = originalData
    .map(item => {
      if (item.id_produk === "170") return null;

      let productType;
      const productNameLower = item.nama_produk.toLowerCase();
      if (productNameLower.includes('botol') || productNameLower.includes('roll')) {
        productType = 'BOTTLE';
      } else {
        productType = 'PERFUME';
      }

      return {
        name: item.nama_produk,
        productCode: item.kode_produk,
        description: item.deskripsi_produk || null,
        stock: parseInt(item.stok_produk, 10) || 0,
        minimumStock: parseInt(item.stok_minimum, 10) || 5,
        purchasePrice: parseFloat(item.harga_pokok) || 0,
        sellingPrice: parseFloat(item.harga_jual) || 0,
        type: productType,
      };
    })
    .filter(Boolean);

  const result = await prisma.product.createMany({
    data: transformedData,
    skipDuplicates: true,
  });
  console.log(`Seeding produk selesai. ${result.count} produk dibuat.`);
}

// Fungsi untuk seeding pelanggan
async function seedCustomers() {
  console.log('Memulai seeding pelanggan...');
  const originalData = pelangganJson[2].data;

  const transformedData = originalData.map(item => {
    // Peta JSON `contact_pelanggan` ke Prisma `phoneNumber`
    // Peta JSON `poin_pelanggan` ke Prisma `points`
    return {
      name: item.nama_pelanggan,
      phoneNumber: item.contact_pelanggan || null, // Gunakan null jika kosong
      points: parseInt(item.poin_pelanggan, 10) || 0,
      // `lastTransactionAt` bersifat opsional dan akan di-set null
    };
  });

  const result = await prisma.customer.createMany({
    data: transformedData,
    skipDuplicates: true, // Lewati jika ada 'phoneNumber' yang duplikat
  });
  console.log(`Seeding pelanggan selesai. ${result.count} pelanggan dibuat.`);
}


// Fungsi Main Seeder
async function main() {
  console.log(`Membersihkan data lama...`);
  // Hapus data dengan urutan yang benar untuk menghindari error foreign key
  await prisma.transactionDetail.deleteMany({});
  await prisma.stockHistory.deleteMany({});
  await prisma.pointHistory.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.customer.deleteMany({});

  console.log('Data lama berhasil dibersihkan.');

  // Jalankan seeding
  await seedProducts();
  await seedCustomers();
}

// Jalankan fungsi main
main()
  .catch((e) => {
    console.error('Terjadi error saat seeding:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    console.log('Proses seeding selesai.');
    await prisma.$disconnect();
  });