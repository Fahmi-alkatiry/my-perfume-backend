import { prisma } from '../lib/prisma.js';

// 1. Mulai Shift
export const startShift = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startCash } = req.body;

    // Cek apakah user sudah punya shift aktif
    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: 'OPEN' }
    });

    if (activeShift) {
      return res.status(400).json({ error: 'Anda masih memiliki shift yang aktif.' });
    }

    const newShift = await prisma.shift.create({
      data: {
        userId,
        startCash: Number(startCash),
        status: 'OPEN'
      }
    });

    res.status(201).json(newShift);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal memulai shift' });
  }
};

// 2. Cek Shift Aktif
export const getCurrentShift = async (req, res) => {
  try {
    const userId = req.user.id;
    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: 'OPEN' }
    });
    
    res.json(activeShift); // Bisa null jika tidak ada
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data shift' });
  }
};

// 3. Akhiri Shift
export const endShift = async (req, res) => {
  try {
    const userId = req.user.id;
    const { endCash } = req.body; // Uang fisik yang dihitung kasir

    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: 'OPEN' }
    });

    if (!activeShift) {
      return res.status(404).json({ error: 'Tidak ada shift aktif.' });
    }

    // Hitung total penjualan TUNAI selama shift ini
    // Asumsi: Kita harus mencari transaksi yang terjadi antara startTime shift ini sampai sekarang
    // DAN metode pembayarannya adalah 'Tunai' (Perlu ID metode tunai, atau anggap semua Cash sementara ini)
    // Untuk simplifikasi, kita hitung total semua transaksi user ini di rentang waktu tsb.
    
    const sales = await prisma.transaction.aggregate({
      where: {
        userId: userId,
        createdAt: { gte: activeShift.startTime },
        status: 'COMPLETED',
        // Idealnya tambahkan filter: paymentMethod: { name: 'Tunai' } jika data seed sudah ada
      },
      _sum: { finalAmount: true }
    });

    const totalSales = Number(sales._sum.finalAmount || 0);
    const startCash = Number(activeShift.startCash);
    const actualEndCash = Number(endCash);
    
    const expectedCash = startCash + totalSales;
    const difference = actualEndCash - expectedCash;

    // Update Shift
    const closedShift = await prisma.shift.update({
      where: { id: activeShift.id },
      data: {
        endTime: new Date(),
        endCash: actualEndCash,
        expectedCash: expectedCash,
        difference: difference,
        status: 'CLOSED'
      }
    });

    res.json({
      message: 'Shift berhasil ditutup',
      details: {
        startCash,
        totalSales,
        expectedCash,
        actualEndCash,
        difference // Jika negatif = uang kurang (bocor), Positif = uang lebih
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal menutup shift' });
  }
};