// backend/src/controllers/paymentMethod.controller.js
import { prisma } from '../lib/prisma.js';

/**
 * @desc    Mendapatkan semua metode pembayaran
 * @route   GET /api/payment-methods
 */
export const getAllPaymentMethods = async (req, res) => {
  try {
    // Biasanya tidak perlu pagination, ambil semua
    const methods = await prisma.paymentMethod.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(methods);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil metode pembayaran' });
  }
};

/**
 * @desc    Membuat metode pembayaran baru
 * @route   POST /api/payment-methods
 */
export const createPaymentMethod = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nama metode wajib diisi' });
    }

    const newMethod = await prisma.paymentMethod.create({
      data: { name, description },
    });
    res.status(201).json(newMethod);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal membuat metode pembayaran' });
  }
};

/**
 * @desc    Mengupdate metode pembayaran
 * @route   PUT /api/payment-methods/:id
 */
export const updatePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nama metode wajib diisi' });
    }

    const updatedMethod = await prisma.paymentMethod.update({
      where: { id: Number(id) },
      data: { name, description },
    });
    res.json(updatedMethod);
  } catch (error) {
    console.error(error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Metode pembayaran tidak ditemukan' });
    }
    res.status(500).json({ error: 'Gagal mengupdate metode pembayaran' });
  }
};

/**
 * @desc    Menghapus metode pembayaran
 * @route   DELETE /api/payment-methods/:id
 */
export const deletePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.paymentMethod.delete({
      where: { id: Number(id) },
    });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Metode pembayaran tidak ditemukan' });
    }
    // Tangani jika metode tidak bisa dihapus karena punya transaksi
    if (error.code === 'P2003') { 
      return res.status(400).json({ error: 'Metode ini tidak bisa dihapus karena memiliki riwayat transaksi.' });
    }
    res.status(500).json({ error: 'Gagal menghapus metode pembayaran' });
  }
};