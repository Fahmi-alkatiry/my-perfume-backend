// backend/src/controllers/storeCash.controller.js
import { prisma } from "../lib/prisma.js";

/**
 * @desc    Mendapatkan saldo Kas Toko dan Riwayatnya
 * @route   GET /api/store-cash
 */
export const getStoreCash = async (req, res) => {
  try {
    const storeCash = await prisma.storeCash.findFirst();
    const balance = storeCash ? storeCash.balance : 0;

    const history = await prisma.storeCashHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        transaction: {
          select: {
            id: true,
          },
        },
      },
    });

    res.json({
      balance,
      history,
    });
  } catch (error) {
    console.error("Gagal mendapatkan data kas toko:", error);
    res.status(500).json({ error: "Gagal mendapatkan data kas toko" });
  }
};

/**
 * @desc    Menggunakan/Mengambil uang dari Kas Toko secara manual
 * @route   POST /api/store-cash/use
 */
export const useStoreCash = async (req, res) => {
  const { amount, description } = req.body;

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: "Nominal harus lebih dari 0" });
  }

  if (!description) {
    return res.status(400).json({ error: "Keterangan harus diisi" });
  }

  try {
    const withdrawal = await prisma.$transaction(async (tx) => {
      const currentStoreCash = await tx.storeCash.findFirst();

      if (!currentStoreCash || Number(currentStoreCash.balance) < Number(amount)) {
        throw new Error("Saldo Kas Toko tidak mencukupi");
      }

      // Kurangi saldo
      const updatedCash = await tx.storeCash.update({
        where: { id: currentStoreCash.id },
        data: { balance: { decrement: Number(amount) } },
      });

      // Catat history
      const history = await tx.storeCashHistory.create({
        data: {
          amount: Number(amount),
          type: "OUT",
          description: description,
          transactionId: null, // Karena bukan dari pesanan POS
        },
      });

      return { balance: updatedCash.balance, history };
    });

    res.status(200).json({
      message: "Kas Toko berhasil digunakan",
      data: withdrawal,
    });
  } catch (error) {
    console.error("Gagal menggunakan kas toko:", error);
    res.status(400).json({ error: error.message || "Gagal menggunakan kas toko" });
  }
};
