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

/**
 * @desc    Mendapatkan riwayat transaksi (dengan filter & pagination)
 * @route   GET /api/reports/transactions
 */
export const getTransactionHistory = async (req, res) => {
  try {
    // 1. Ambil parameter query
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { startDate, endDate } = req.query; // Format: 'YYYY-MM-DD'

    const skip = (page - 1) * limit;

    // 2. Buat 'where' clause (filter)
    const where = {
      status: 'COMPLETED',
    };

    // Tambahkan filter tanggal jika ada
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0); // Set ke awal hari

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Set ke akhir hari

      where.createdAt = {
        gte: start,
        lte: end,
      };
    }
    
    // (Nanti kita bisa tambahkan filter 'customerId' atau 'userId' di sini)

    // 3. Jalankan 2 query (data + total)
    const [transactions, totalCount] = await prisma.$transaction([
      // Query 1: Ambil data transaksi
      prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc', // Tampilkan yang terbaru dulu
        },
        // Sertakan nama pelanggan dan kasir
        include: {
          customer: {
            select: { name: true },
          },
          user: { // 'user' adalah kasir yang login
            select: { name: true },
          },
        },
      }),
      // Query 2: Ambil total data
      prisma.transaction.count({ where }),
    ]);

    // 4. Hitung total halaman
    const totalPages = Math.ceil(totalCount / limit);

    // 5. Kirim respon
    res.json({
      data: transactions,
      pagination: {
        totalCount,
        totalPages,
        currentPage: page,
        limit,
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil riwayat transaksi' });
  }
};


export const getLowStockProducts = async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        // Logika utama: stok saat ini lebih kecil atau sama dengan stok minimum
        stock: {
          lte: prisma.product.fields.minimumStock,
        },
      },
      orderBy: {
        stock: 'asc', // Tampilkan yang paling kritis (stok terendah) dulu
      },
      select: {
        id: true,
        name: true,
        productCode: true,
        stock: true,
        minimumStock: true,
      },
    });

    res.json(products);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil data stok rendah' });
  }
};


/**
 * @desc    Mendapatkan riwayat stok (dengan filter & pagination)
 * @route   GET /api/reports/stock-history
 */
export const getStockHistory = async (req, res) => {
  try {
    // 1. Ambil parameter query
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { type, search } = req.query; // Filter: 'IN' / 'OUT' / 'ADJUSTMENT' & 'search' by product

    const skip = (page - 1) * limit;

    // 2. Buat 'where' clause (filter)
    const where = {};

    // Filter berdasarkan Tipe
    if (type) {
      where.type = type; // Cth: 'IN'
    }

    // Filter berdasarkan Nama atau Kode Produk (relasi)
    if (search) {
      where.product = {
        OR: [
          { name: { contains: search } },
          { productCode: { contains: search } },
        ],
      };
    }

    // 3. Jalankan 2 query (data + total)
    const [history, totalCount] = await prisma.$transaction([
      // Query 1: Ambil data riwayat
      prisma.stockHistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc', // Tampilkan yang terbaru dulu
        },
        // Sertakan nama produk dan nama kasir/admin
        include: {
          product: {
            select: { name: true, productCode: true },
          },
          user: {
            select: { name: true },
          },
        },
      }),
      // Query 2: Ambil total data
      prisma.stockHistory.count({ where }),
    ]);

    // 4. Hitung total halaman
    const totalPages = Math.ceil(totalCount / limit);

    // 5. Kirim respon
    res.json({
      data: history,
      pagination: {
        totalCount,
        totalPages,
        currentPage: page,
        limit,
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil riwayat stok' });
  }
};