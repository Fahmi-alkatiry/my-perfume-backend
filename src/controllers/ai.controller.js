import axios from "axios";
import { prisma } from "../lib/prisma.js";

const formatRp = (n) =>
  "Rp " + Number(n || 0).toLocaleString("id-ID");

const todayStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

const lastMonthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
};

const lastMonthEnd = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

export const chatWithData = async (req, res) => {
  try {
    const { question } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey)
      return res.status(500).json({ error: "Gemini API Key belum ada" });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    // =========================
    // QUERY DATABASE
    // =========================

    const [
      todaySales,
      weekSales,
      monthSales,
      lastMonthSales,
      yearSales,
      bestProductsRaw,
      lowStock,
      paymentMethods,
      topCustomers,
      inactiveCustomers,
      topCashier,
      expenses,
      vouchers,
      hourlyTransactions
    ] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: todayStart() },
          status: "COMPLETED"
        },
        _sum: { finalAmount: true, totalMargin: true },
        _count: true
      }),

      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: "COMPLETED"
        },
        _sum: { finalAmount: true },
        _count: true
      }),

      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: monthStart() },
          status: "COMPLETED"
        },
        _sum: { finalAmount: true, totalMargin: true },
        _count: true
      }),

      prisma.transaction.aggregate({
        where: {
          createdAt: {
            gte: lastMonthStart(),
            lt: lastMonthEnd()
          },
          status: "COMPLETED"
        },
        _sum: { finalAmount: true, totalMargin: true },
        _count: true
      }),

      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: yearStart },
          status: "COMPLETED"
        },
        _sum: { finalAmount: true, totalMargin: true },
        _count: true
      }),

      // ambil produk terlaris
      prisma.transactionDetail.groupBy({
        by: ["productId"],
        _sum: { quantity: true, totalMargin: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5
      }),

      prisma.product.findMany({
        where: {
          stock: {
            lte: prisma.product.fields.minimumStock
          }
        },
        select: {
          name: true,
          stock: true
        },
        take: 5
      }),

      prisma.transaction.groupBy({
        by: ["paymentMethodId"],
        _count: true,
        orderBy: { _count: { id: "desc" } },
        take: 3
      }),

      prisma.customer.findMany({
        orderBy: { points: "desc" },
        take: 5,
        select: {
          name: true,
          points: true
        }
      }),

      prisma.customer.findMany({
        where: {
          lastTransactionAt: {
            lt: thirtyDaysAgo
          }
        },
        select: { name: true },
        take: 5
      }),

      prisma.transaction.groupBy({
        by: ["userId"],
        _count: true,
        orderBy: { _count: { id: "desc" } },
        take: 3
      }),

      prisma.expense.aggregate({
        where: {
          date: { gte: monthStart() }
        },
        _sum: { amount: true }
      }),

      prisma.voucher.findMany({
        where: {
          isActive: true
        },
        take: 5
      }),

      prisma.transaction.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo }
        },
        select: { createdAt: true }
      })
    ]);

    // =========================
    // AMBIL NAMA PRODUK
    // =========================

    const productIds = bestProductsRaw.map((p) => p.productId);

    const productNames = await prisma.product.findMany({
      where: {
        id: { in: productIds }
      },
      select: {
        id: true,
        name: true
      }
    });

    const bestProducts = bestProductsRaw.map((p) => {
      const product = productNames.find((x) => x.id === p.productId);

      return {
        name: product?.name || `Produk ${p.productId}`,
        quantity: p._sum.quantity
      };
    });

    // =========================
    // ANALISIS DATA
    // =========================

    const profitNet =
      Number(yearSales._sum.totalMargin || 0) -
      Number(expenses._sum.amount || 0);

    const growth =
      Number(monthSales._sum.finalAmount || 0) -
      Number(lastMonthSales._sum.finalAmount || 0);

    const insights = [];

    if (growth > 0) insights.push("📈 Penjualan bulan ini meningkat.");

    if (growth < 0) insights.push("📉 Penjualan bulan ini menurun.");

    if (lowStock.length > 0)
      insights.push("⚠️ Beberapa produk harus segera restock.");

    if (todaySales._count === 0)
      insights.push("🚨 Hari ini belum ada transaksi.");

    if (profitNet < 0)
      insights.push("⚠️ Profit bersih negatif.");

    // =========================
    // CONTEXT AI
    // =========================

    const context = `
===== DATA BISNIS TOKO PARFUM =====

PENJUALAN HARI INI
Omzet: ${formatRp(todaySales._sum.finalAmount)}
Transaksi: ${todaySales._count}

PENJUALAN BULAN INI
Omzet: ${formatRp(monthSales._sum.finalAmount)}
Profit: ${formatRp(monthSales._sum.totalMargin)}

PENJUALAN BULAN LALU
Omzet: ${formatRp(lastMonthSales._sum.finalAmount)}

PENJUALAN TAHUN INI
Omzet: ${formatRp(yearSales._sum.finalAmount)}
Profit: ${formatRp(yearSales._sum.totalMargin)}

PENGELUARAN BULAN INI
${formatRp(expenses._sum.amount)}

PROFIT BERSIH
${formatRp(profitNet)}

PRODUK TERLARIS
${bestProducts
  .map(
    (p, i) =>
      `${i + 1}. ${p.name} terjual ${p.quantity} unit`
  )
  .join("\n")}

STOK MENIPIS
${lowStock.map((p) => `${p.name} (${p.stock})`).join("\n")}

CUSTOMER TERBAIK
${topCustomers
  .map((c) => `${c.name} (${c.points} poin)`)
  .join("\n")}

CUSTOMER TIDAK AKTIF
${inactiveCustomers.map((c) => c.name).join("\n")}

INSIGHT SISTEM
${insights.join("\n")}
`;

    const prompt = `
Anda adalah AI Business Intelligence untuk sistem POS parfum.

Gunakan data berikut untuk menjawab pertanyaan user.

${context}

Pertanyaan user:
"${question}"

Aturan:
- Jawab berdasarkan data
- Gunakan bullet point
- Tebalkan angka penting
- Berikan analisis bisnis
- Berikan saran peningkatan penjualan
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }]
    });

    const answer =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "AI tidak memberi respon.";

    res.json({ answer });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI Error" });
  }
};