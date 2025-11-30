// backend/src/controllers/report.controller.js
import { prisma } from "../lib/prisma.js";

/**
 * @desc    Mendapatkan ringkasan laporan (dashboard)
 * @route   GET /api/reports/summary
 */
export const getReportSummary = async (req, res) => {
  try {
    // --- 1. Tentukan Rentang Tanggal (Hari Ini) ---
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // --- 2. Query Agregasi Transaksi (PEMASUKAN) ---
    const transactionSummary = await prisma.transaction.aggregate({
      where: {
        createdAt: { gte: startOfToday, lt: endOfToday },
        status: "COMPLETED",
      },
      _sum: {
        finalAmount: true, // Omzet
        totalMargin: true, // Gross Profit
      },
      _count: { id: true },
    });

    // --- 3. Query Agregasi Produk Terjual ---
    const itemsSoldSummary = await prisma.transactionDetail.aggregate({
      where: {
        transaction: {
          createdAt: { gte: startOfToday, lt: endOfToday },
          status: "COMPLETED",
        },
      },
      _sum: { quantity: true },
    });

    // --- 4. Query Pelanggan Baru ---
    const newCustomersCount = await prisma.customer.count({
      where: {
        createdAt: { gte: startOfToday, lt: endOfToday },
      },
    });

    // --- 5. Query Agregasi PENGELUARAN (BARU) ---
    // Menghitung total pengeluaran hari ini dari tabel Expense
    const expenseSummary = await prisma.expense.aggregate({
      where: {
        date: { gte: startOfToday, lt: endOfToday },
      },
      _sum: { amount: true },
    });

    // --- 6. Kalkulasi Akhir ---
    const totalRevenue = Number(transactionSummary._sum.finalAmount || 0);
    const totalGrossProfit = Number(transactionSummary._sum.totalMargin || 0);
    const totalExpenses = Number(expenseSummary._sum.amount || 0); // Data Pengeluaran
    
    // Profit Bersih = Profit Kotor - Pengeluaran
    const totalNetProfit = totalGrossProfit - totalExpenses; 

    // 7. Format Hasil
    const summary = {
      todayRevenue: totalRevenue,
      todayProfit: totalGrossProfit,     // Masih dikirim untuk kompatibilitas
      todayNetProfit: totalNetProfit,    // <-- DATA BARU (Profit Bersih)
      todayExpenses: totalExpenses,      // <-- DATA BARU (Total Pengeluaran)
      todayTransactions: transactionSummary._count.id || 0,
      todayItemsSold: itemsSoldSummary._sum.quantity || 0,
      newCustomersToday: newCustomersCount || 0,
    };

    console.log(summary);
    res.json(summary);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Gagal mengambil ringkasan laporan" });
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
      status: "COMPLETED",
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
          createdAt: "desc", // Tampilkan yang terbaru dulu
        },
        // Sertakan nama pelanggan dan kasir
        include: {
          customer: {
            select: { name: true },
          },
          user: {
            // 'user' adalah kasir yang login
            select: { name: true },
          },
          paymentMethod: {
            select: { name: true },
          },
          details: {
            include: {
              product: { select: { name: true, productCode: true } },
            },
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
    res.status(500).json({ error: "Gagal mengambil riwayat transaksi" });
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
        stock: "asc", // Tampilkan yang paling kritis (stok terendah) dulu
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
    res.status(500).json({ error: "Gagal mengambil data stok rendah" });
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
          createdAt: "desc", // Tampilkan yang terbaru dulu
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
    res.status(500).json({ error: "Gagal mengambil riwayat stok" });
  }
};

/**
 * @desc    Mendapatkan data untuk grafik dashboard
 * @route   GET /api/reports/charts
 */
export const getDashboardCharts = async (req, res) => {
  try {
    const today = new Date();

    // --- 1. DATA GRAFIK GARIS (Tren Penjualan 7 Hari Terakhir) ---
    const salesTrend = [];

    // Loop untuk 7 hari ke belakang
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);

      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));

      // Hitung total penjualan hari itu
      const aggregations = await prisma.transaction.aggregate({
        where: {
          createdAt: { gte: startOfDay, lt: endOfDay },
          status: "COMPLETED",
        },
        _sum: { finalAmount: true },
      });

      // Format tanggal (misal: "18 Nov")
      const dateLabel = startOfDay.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      });

      salesTrend.push({
        date: dateLabel,
        total: aggregations._sum.finalAmount || 0,
      });
    }

    // --- 2. DATA GRAFIK BATANG (5 Produk Terlaris Bulan Ini) ---
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Group by productId dan sum quantity
    const topProductsRaw = await prisma.transactionDetail.groupBy({
      by: ["productId"],
      where: {
        transaction: {
          createdAt: { gte: startOfMonth, lt: endOfMonth },
          status: "COMPLETED",
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    });

    // Ambil nama produk (karena groupBy Prisma tidak bisa include relation langsung dengan mudah)
    const topProducts = await Promise.all(
      topProductsRaw.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true },
        });
        return {
          name: product ? product.name : "Unknown",
          sales: item._sum.quantity,
        };
      })
    );

    res.json({ salesTrend, topProducts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Gagal mengambil data grafik" });
  }
};


export const getShiftHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Ambil data shift
    const [shifts, totalCount] = await prisma.$transaction([
      prisma.shift.findMany({
        skip,
        take: limit,
        orderBy: { startTime: 'desc' }, // Yang terbaru di atas
        include: {
          user: { select: { name: true } } // Sertakan nama kasir
        }
      }),
      prisma.shift.count()
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      data: shifts,
      pagination: { totalCount, totalPages, currentPage: page, limit }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil riwayat shift' });
  }
};