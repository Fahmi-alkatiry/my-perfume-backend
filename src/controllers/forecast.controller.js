// backend/src/controllers/forecast.controller.js
import { prisma } from '../lib/prisma.js';

/**
 * @desc    Mendapatkan data peramalan stok (SMA & MAPE)
 * @route   GET /api/forecast
 */
export const getStockForecast = async (req, res) => {
  try {
    // 1. Tentukan Rentang Waktu (3 atau 6 Bulan Terakhir, default 6)
    const period = parseInt(req.query.period) === 3 ? 3 : 6;
    const today = new Date();
    const monthsAgo = new Date(today.getFullYear(), today.getMonth() - period, 1);

    // 2. Ambil Semua Produk (Kita butuh data stok saat ini)
    const products = await prisma.product.findMany({
      select: { id: true, name: true, stock: true }
    });

    // 3. Ambil Data Transaksi dalam Rentang Waktu Terpilih
    const salesData = await prisma.transactionDetail.findMany({
      where: {
        transaction: {
          status: 'COMPLETED',
          createdAt: {
            gte: monthsAgo, // "Greater Than or Equal" (>=) X bulan lalu
          },
        },
      },
      include: {
        transaction: {
          select: { createdAt: true }
        }
      }
    });

    // 4. --- ALGORITMA PENGOLAHAN DATA ---
    
    // Siapkan wadah untuk hasil
    const forecastResults = products.map(product => {
      // Filter penjualan khusus untuk produk ini
      const productSales = salesData.filter(item => item.productId === product.id);

      // Kelompokkan penjualan per bulan (Bulan -1 s/d Bulan -period)
      // Format key: "YYYY-MM"
      const monthlySales = {};
      
      // Inisialisasi X bulan terakhir dengan 0 (agar tidak error jika tidak ada penjualan)
      for (let i = 1; i <= period; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlySales[key] = 0;
      }

      // Isi data penjualan sebenarnya (Actual Data)
      productSales.forEach(sale => {
        const date = new Date(sale.transaction.createdAt);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (monthlySales[key] !== undefined) {
          monthlySales[key] += sale.quantity;
        }
      });

      // Ubah object ke array angka [JualXBulanLalu, ..., JualBulanLalu]
      // Object.values tidak menjamin urutan, jadi kita urutkan berdasarkan key (bulan)
      const salesArray = Object.keys(monthlySales).sort().map(key => monthlySales[key]);
      
      // --- RUMUS 1: Simple Moving Average (SMA) ---
      // Prediksi = totalSales / period
      const totalSales = salesArray.reduce((a, b) => a + b, 0);
      const forecastNextMonth = Math.ceil(totalSales / period); // Dibulatkan ke atas

      // --- RUMUS 2: MAPE (Mean Absolute Percentage Error) ---
      // Ini untuk menghitung seberapa akurat metode rata-rata ini.
      // Kita simulasikan: Seberapa meleset rata-rata bulan lalu terhadap data asli?
      let errorSum = 0;
      let count = 0;
      
      // Hitung error per bulan (jika ada penjualan)
      salesArray.forEach(actual => {
        if (actual > 0) {
          // Anggaplah prediksi bulan itu adalah rata-rata keseluruhan (naive approach)
          // Rumus: |(Actual - Forecast) / Actual|
          const error = Math.abs((actual - forecastNextMonth) / actual);
          errorSum += error;
          count++;
        }
      });
      
      // Jika count 0 (belum ada penjualan), error dianggap 0%
      const mape = count > 0 ? (errorSum / count) * 100 : 0;

      // --- LOGIKA STATUS ---
      // Jika Stok Saat Ini < Prediksi Penjualan -> BAHAYA
      let status = "AMAN";
      if (product.stock < forecastNextMonth) {
        status = "RESTOCK";
      } else if (product.stock < forecastNextMonth * 1.2) { 
        // Jika stok pas-pasan (kurang dari 120% prediksi)
        status = "WARNING"; 
      }

      return {
        id: product.id,
        name: product.name,
        currentStock: product.stock,
        salesHistory: salesArray, // [Bulan-X, ..., Bulan-1]
        forecast: forecastNextMonth,
        mape: mape.toFixed(2), // Ambil 2 desimal
        status: status
      };
    });

    res.json(forecastResults);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal menghitung peramalan stok' });
  }
};