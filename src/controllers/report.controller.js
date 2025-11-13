// backend/src/controllers/report.controller.js
import { prisma } from '../lib/prisma.js';

/**
 * @desc    Mendapatkan ringkasan laporan (dashboard)
 * @route   GET /api/reports/summary
 */
export const getReportSummary = async (req, res) => {
  try {
    // --- 1. Tentukan Rentang Tanggal (Hari Ini) ---
    // Mengatur 'hari ini' berdasarkan zona waktu server
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ); // Pukul 00:00:00
    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1
    ); // Besok, pukul 00:00:00

    // --- 2. Query Agregasi Transaksi ---
    // Kita gunakan 'aggregate' untuk menghitung SUM dan COUNT
    const transactionSummary = await prisma.transaction.aggregate({
      where: {
        createdAt: {
          gte: startOfToday, // Lebih besar atau sama dengan awal hari ini
          lt: endOfToday, // Lebih kecil dari awal hari besok
        },
        status: 'COMPLETED', // Hanya hitung yang selesai
      },
      _sum: {
        finalAmount: true, // Total pendapatan (setelah diskon)
        totalMargin: true, // Total profit/margin
      },
      _count: {
        id: true, // Total jumlah transaksi
      },
    });

    // --- 3. Query Agregasi Produk Terjual ---
    const itemsSoldSummary = await prisma.transactionDetail.aggregate({
      where: {
        transaction: {
          createdAt: {
            gte: startOfToday,
            lt: endOfToday,
          },
          status: 'COMPLETED',
        },
      },
      _sum: {
        quantity: true, // Total jumlah barang terjual
      },
    });

    // --- 4. Query Pelanggan Baru Hari Ini ---
    const newCustomersCount = await prisma.customer.count({
      where: {
        createdAt: { // Asumsi Anda punya field createdAt di model Customer
          gte: startOfToday,
          lt: endOfToday,
        },
      },
    });

    // 5. Format Hasil
    const summary = {
      todayRevenue: transactionSummary._sum.finalAmount || 0,
      todayProfit: transactionSummary._sum.totalMargin || 0,
      todayTransactions: transactionSummary._count.id || 0,
      todayItemsSold: itemsSoldSummary._sum.quantity || 0,
      newCustomersToday: newCustomersCount || 0, // Ini butuh field createdAt
    };

    console.log(summary);

    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil ringkasan laporan' });
  }
};

/*
CATATAN PENTING:
Agar 'newCustomersToday' berfungsi, pastikan Anda menambahkan field createdAt
di model 'Customer' pada schema.prisma Anda.

model Customer {
  // ... field lain
  createdAt DateTime @default(now()) // <--- TAMBAHKAN INI
}

Jika Anda menambahkannya, jangan lupa jalankan 'npm run db:migrate' lagi.
Jika tidak, Anda bisa hapus bagian 'newCustomersToday'.
*/