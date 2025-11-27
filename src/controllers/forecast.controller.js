// backend/src/controllers/forecast.controller.js
import { prisma } from '../lib/prisma.js';

/**
 * @desc    Mendapatkan data peramalan stok (SMA & MAPE)
 * @route   GET /api/forecast
 */
export const getStockForecast = async (req, res) => {
  try {
    // 1. Tentukan Rentang Waktu (3 Bulan Terakhir)
    const today = new Date();
    // Kita mundur 3 bulan ke belakang dari tanggal 1 bulan ini
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);

    // 2. Ambil Semua Produk (Kita butuh data stok saat ini)
    const products = await prisma.product.findMany({
      select: { id: true, name: true, stock: true }
    });

    // 3. Ambil Data Transaksi 3 Bulan Terakhir
    const salesData = await prisma.transactionDetail.findMany({
      where: {
        transaction: {
          status: 'COMPLETED',
          createdAt: {
            gte: threeMonthsAgo, // "Greater Than or Equal" (>=) 3 bulan lalu
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

      // Kelompokkan penjualan per bulan (Bulan -1, Bulan -2, Bulan -3)
      // Format key: "YYYY-MM"
      const monthlySales = {};
      
      // Inisialisasi 3 bulan terakhir dengan 0 (agar tidak error jika tidak ada penjualan)
      for (let i = 1; i <= 3; i++) {
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

      // Ubah object ke array angka [JualBulanLalu, Jual2BulanLalu, Jual3BulanLalu]
      // Object.values tidak menjamin urutan, jadi kita urutkan berdasarkan key (bulan)
      const salesArray = Object.keys(monthlySales).sort().map(key => monthlySales[key]);
      
      // --- RUMUS 1: Simple Moving Average (SMA) ---
      // Prediksi = (Data1 + Data2 + Data3) / 3
      const totalSales3Months = salesArray.reduce((a, b) => a + b, 0);
      const forecastNextMonth = Math.ceil(totalSales3Months / 3); // Dibulatkan ke atas

      // --- RUMUS 2: MAPE (Mean Absolute Percentage Error) ---
      // Ini untuk menghitung seberapa akurat metode rata-rata ini.
      // Kita simulasikan: Seberapa meleset rata-rata bulan lalu terhadap data asli?
      // (Ini versi sederhana untuk skripsi)
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
        salesHistory: salesArray, // [Bulan-3, Bulan-2, Bulan-1]
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