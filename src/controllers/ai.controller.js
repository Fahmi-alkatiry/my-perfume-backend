// backend/src/controllers/ai.controller.js
import axios from "axios";
import { prisma } from "../lib/prisma.js";

const formatRp = (num) =>
  "Rp " + Number(num || 0).toLocaleString("id-ID");

const formatDate = (d) =>
  d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

const detectIntent = (question = "") => {
  const q = question.toLowerCase();

  if (q.match(/hari ini|today|sekarang/)) return "TODAY_REPORT";
  if (q.match(/kemarin/)) return "YESTERDAY_REPORT";
  if (q.match(/minggu|7 hari/)) return "WEEKLY_TREND";
  if (q.match(/bulan/)) return "MONTHLY_TREND";
  if (q.match(/tahun/)) return "YEARLY_REPORT";

  if (q.match(/stok|habis|menipis|gudang/)) return "STOCK_ALERT";
  if (q.match(/produk terlaris|paling laku/)) return "BEST_SELLER";
  if (q.match(/profit|margin|untung/)) return "PROFIT_ANALYSIS";
  if (q.match(/pelanggan|customer/)) return "CUSTOMER_ANALYSIS";
  if (q.match(/saran|rekomendasi|apa yang harus/)) return "RECOMMENDATION";

  return "GENERAL_ANALYSIS";
};

export const chatWithData = async (req, res) => {
  try {
    const { question } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API Key belum diset" });

    const intent = detectIntent(question);
    const now = new Date();

    // ===============================
    // QUERY DATA PARALEL (INTELLIGENT)
    // ===============================
    const [
      today,
      week,
      year,
      bestProducts,
      lowStock,
      paymentFav,
      topCustomers,
      expenses
    ] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: startOfDay(now), lt: endOfDay(now) },
          status: "COMPLETED"
        },
        _sum: { finalAmount: true, totalMargin: true },
        _count: { id: true }
      }),

      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: new Date(now.setDate(now.getDate() - 7)) },
          status: "COMPLETED"
        },
        _sum: { finalAmount: true },
        _count: { id: true }
      }),

      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) },
          status: "COMPLETED"
        },
        _sum: { finalAmount: true, totalMargin: true },
        _count: { id: true }
      }),

      prisma.transactionDetail.groupBy({
        by: ["productId"],
        _sum: { quantity: true, totalMargin: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5
      }),

      prisma.product.findMany({
        where: { stock: { lte: prisma.product.fields.minimumStock } },
        select: { name: true, stock: true },
        take: 5
      }),

      prisma.transaction.groupBy({
        by: ["paymentMethodId"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 3
      }),

      prisma.customer.findMany({
        orderBy: { points: "desc" },
        take: 5,
        select: { name: true, points: true }
      }),

      prisma.expense.aggregate({
        where: {
          date: { gte: new Date(new Date().getFullYear(), 0, 1) }
        },
        _sum: { amount: true }
      })
    ]);

    // ===============================
    // INSIGHT ENGINE (RULE BASED)
    // ===============================
    const netProfit =
      Number(year._sum.totalMargin || 0) -
      Number(expenses._sum.amount || 0);

    const insights = [];
    if (lowStock.length > 0)
      insights.push("⚠️ Beberapa produk stoknya kritis, segera restock.");

    if (today._count.id === 0)
      insights.push("📉 Hari ini belum ada transaksi, pertimbangkan promo cepat.");

    if (netProfit < 0)
      insights.push("🚨 Profit bersih negatif, cek pengeluaran operasional.");

    // ===============================
    // CONTEXT SUPER LENGKAP
    // ===============================
    const context = `
[WAKTU]
- Hari Ini: ${formatDate(new Date())}

[RINGKASAN HARI INI]
- Omzet: **${formatRp(today._sum.finalAmount)}**
- Profit Kotor: **${formatRp(today._sum.totalMargin)}**
- Transaksi: **${today._count.id}**

[RINGKASAN TAHUN INI]
- Total Omzet: **${formatRp(year._sum.finalAmount)}**
- Profit Kotor: **${formatRp(year._sum.totalMargin)}**
- Total Pengeluaran: **${formatRp(expenses._sum.amount)}**
- Profit Bersih: **${formatRp(netProfit)}**

[PRODUK TERLARIS]
${bestProducts.map((p, i) => `${i + 1}. Produk ID ${p.productId} – Terjual ${p._sum.quantity}`).join("\n")}

[STOK MENIPIS]
${lowStock.map(p => `- ${p.name} (Sisa ${p.stock})`).join("\n") || "Aman"}

[PELANGGAN TERBAIK]
${topCustomers.map(c => `- ${c.name} (${c.points} poin)`).join("\n")}

[INSIGHT OTOMATIS]
${insights.join("\n") || "Tidak ada peringatan"}
`;

    const prompt = `
Anda adalah **AI Business Analyst untuk Toko Parfum**.

DATA INTERNAL TOKO:
${context}

PERTANYAAN USER:
"${question}"

ATURAN JAWABAN:
1. Jawab berdasarkan DATA
2. Gunakan poin-poin (tanpa tabel)
3. Tebalkan angka penting
4. Berikan ANALISIS & SARAN
5. Gunakan emoji secukupnya
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }]
    });

    const answer =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Tidak ada respon AI.";

    res.json({ answer, intent });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI sedang bermasalah" });
  }
};
