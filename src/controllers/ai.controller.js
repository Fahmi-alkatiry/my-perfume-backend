// backend/src/controllers/ai.controller.js
import axios from 'axios';
import { prisma } from "../lib/prisma.js";

export const chatWithData = async (req, res) => {
  try {
    const { question } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: "API Key belum diset di .env." });
    }

    // --- 1. SETTING WAKTU ---
    const now = new Date();
    
    // Helper untuk reset jam ke 00:00:00
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

    // Waktu Hari Ini
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // Waktu Kemarin
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = startOfDay(yesterday);
    const yesterdayEnd = endOfDay(yesterday);

    // Waktu 7 Hari Terakhir
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Waktu Awal Tahun
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // --- 2. QUERY DATABASE PARALEL (Biar Cepat) ---
    const [todayStats, yesterdayStats, weekStats, yearStats, lowStockItems] = await Promise.all([
        // A. Data Hari Ini
        prisma.transaction.aggregate({
            where: { createdAt: { gte: todayStart, lt: todayEnd }, status: "COMPLETED" },
            _sum: { finalAmount: true, totalMargin: true },
            _count: { id: true }
        }),
        // B. Data Kemarin
        prisma.transaction.aggregate({
            where: { createdAt: { gte: yesterdayStart, lt: yesterdayEnd }, status: "COMPLETED" },
            _sum: { finalAmount: true, totalMargin: true },
            _count: { id: true }
        }),
        // C. Data 7 Hari Terakhir
        prisma.transaction.aggregate({
            where: { createdAt: { gte: sevenDaysAgo }, status: "COMPLETED" },
            _sum: { finalAmount: true },
            _count: { id: true }
        }),
        // D. Data Tahun Ini
        prisma.transaction.aggregate({
            where: { createdAt: { gte: yearStart }, status: "COMPLETED" },
            _sum: { finalAmount: true, totalMargin: true },
            _count: { id: true }
        }),
        // E. Stok Menipis
        prisma.product.findMany({
            where: { stock: { lte: 5 } },
            select: { name: true, stock: true },
            take: 5
        })
    ]);

    const formatRp = (num) => "Rp " + Number(num || 0).toLocaleString("id-ID");
    const formatDate = (date) => date.toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric' });

    // --- 3. SUSUN KONTEKS LENGKAP ---
    const contextData = `
      [KALENDER]
      - Hari Ini: ${formatDate(now)}
      - Kemarin: ${formatDate(yesterday)}

      [PERFORMA HARI INI]
      - Omzet: ${formatRp(todayStats._sum.finalAmount)}
      - Profit: ${formatRp(todayStats._sum.totalMargin)}
      - Transaksi: ${todayStats._count.id}

      [PERFORMA KEMARIN (${formatDate(yesterday)})]
      - Omzet: ${formatRp(yesterdayStats._sum.finalAmount)}
      - Profit: ${formatRp(yesterdayStats._sum.totalMargin)}
      - Transaksi: ${yesterdayStats._count.id}

      [TREN 7 HARI TERAKHIR]
      - Total Omzet: ${formatRp(weekStats._sum.finalAmount)}
      - Total Transaksi: ${weekStats._count.id}

      [TOTAL TAHUN INI (${now.getFullYear()})]
      - Total Pendapatan: ${formatRp(yearStats._sum.finalAmount)}
      - Total Profit: ${formatRp(yearStats._sum.totalMargin)}
      - Total Transaksi: ${yearStats._count.id}

      [GUDANG]
      - Stok Kritis: ${lowStockItems.map(i => `${i.name} (Sisa ${i.stock})`).join(", ") || "Aman"}
    `;

    const prompt = `
      Anda adalah Asisten Bisnis Toko Parfum.
      DATA TOKO LENGKAP:
      ${contextData}
      
      PERTANYAAN USER: "${question}"
      
      INSTRUKSI PENTING:
      1. Jawab berdasarkan data di atas.
      2. JANGAN GUNAKAN FORMAT TABEL MARKDOWN (Garis-garis). Tabel susah dibaca di HP.
      3. Gunakan format DAFTAR (List) atau Poin-poin agar rapi.
      4. Gunakan Emoji yang sesuai agar tidak kaku.
      5. Cetak TEBAL (Bold) untuk angka-angka penting (Omzet, Profit).
    `;

    // --- 4. KIRIM KE GEMINI ---
    // gemini-2.5-pro
    // gemini-flash-latest
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }]
    });

    const answer = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, tidak ada respon.";
    
    res.json({ answer });

  } catch (error) {
    console.error("Gemini Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Maaf, Asisten sedang gangguan." });
  }
};