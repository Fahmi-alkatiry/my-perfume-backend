// backend/src/controllers/voucher.controller.js
import { prisma } from '../lib/prisma.js';

/**
 * @desc    Cek validitas voucher & hitung diskon
 * @route   POST /api/vouchers/check
 * @body    { code: "HEMAT10RB", amount: 150000 }
 */
export const checkVoucher = async (req, res) => {
  try {
    const { code, amount } = req.body;
    const purchaseAmount = Number(amount);

    // 1. Cari Voucher di DB
    const voucher = await prisma.voucher.findUnique({
      where: { code: code },
    });

    // --- RANGKAIAN VALIDASI ---

    // a. Cek Eksistensi & Status Aktif
    if (!voucher || !voucher.isActive) {
      return res.status(404).json({ error: 'Kode voucher tidak valid atau tidak aktif.' });
    }

    // b. Cek Tanggal Berlaku
    const now = new Date();
    if (now < voucher.startDate || now > voucher.endDate) {
      return res.status(400).json({ error: 'Voucher belum berlaku atau sudah kedaluwarsa.' });
    }

    // c. Cek Kuota (Usage Limit)
    // Jika usageLimit 0, kita anggap unlimited (opsional), tapi biasanya di-set angka besar.
    // Di sini kita asumsikan usageLimit > 0 artinya ada batas.
    if (voucher.usageLimit > 0 && voucher.usedCount >= voucher.usageLimit) {
      return res.status(400).json({ error: 'Kuota voucher ini sudah habis.' });
    }

    // d. Cek Minimal Belanja
    if (purchaseAmount < Number(voucher.minPurchase)) {
      return res.status(400).json({ 
        error: `Minimal belanja untuk voucher ini adalah Rp ${Number(voucher.minPurchase).toLocaleString('id-ID')}` 
      });
    }

    // --- HITUNG DISKON ---
    let discountAmount = 0;

    if (voucher.type === 'FIXED') {
      // Tipe Nominal (langsung potong)
      discountAmount = Number(voucher.value);
    } else if (voucher.type === 'PERCENTAGE') {
      // Tipe Persen
      discountAmount = (purchaseAmount * Number(voucher.value)) / 100;
      
      // Cek Maksimal Diskon (Cap)
      if (voucher.maxDiscount && discountAmount > Number(voucher.maxDiscount)) {
        discountAmount = Number(voucher.maxDiscount);
      }
    }

    // Pastikan diskon tidak melebihi total belanja (biar gak minus)
    if (discountAmount > purchaseAmount) {
      discountAmount = purchaseAmount;
    }

    res.json({
      valid: true,
      voucherId: voucher.id,
      code: voucher.code,
      type: voucher.type,
      discountAmount: Math.floor(discountAmount), // Bulatkan ke bawah
      message: 'Voucher berhasil diterapkan!'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengecek voucher' });
  }
};

// ... (fungsi checkVoucher yang sudah ada)

/**
 * @desc    Get All Vouchers (Admin)
 * @route   GET /api/vouchers
 */
export const getAllVouchers = async (req, res) => {
  try {
    const vouchers = await prisma.voucher.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(vouchers);
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data voucher' });
  }
};

/**
 * @desc    Create Voucher (Admin)
 * @route   POST /api/vouchers
 */
export const createVoucher = async (req, res) => {
  try {
    const {
      code, type, value, minPurchase, maxDiscount, 
      startDate, endDate, usageLimit, isActive 
    } = req.body;

    const newVoucher = await prisma.voucher.create({
      data: {
        code: code.toUpperCase(),
        type,
        value: Number(value),
        minPurchase: minPurchase ? Number(minPurchase) : 0,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        usageLimit: Number(usageLimit) || 0,
        isActive: isActive !== undefined ? isActive : true,
      },
    });
    res.status(201).json(newVoucher);
  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Kode voucher sudah ada.' });
    }
    res.status(500).json({ error: 'Gagal membuat voucher' });
  }
};

/**
 * @desc    Update Voucher (Admin)
 * @route   PUT /api/vouchers/:id
 */
export const updateVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code, type, value, minPurchase, maxDiscount, 
      startDate, endDate, usageLimit, isActive 
    } = req.body;

    const updatedVoucher = await prisma.voucher.update({
      where: { id: Number(id) },
      data: {
        code: code.toUpperCase(),
        type,
        value: Number(value),
        minPurchase: Number(minPurchase),
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        usageLimit: Number(usageLimit),
        isActive: Boolean(isActive),
      },
    });
    res.json(updatedVoucher);
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengupdate voucher' });
  }
};

/**
 * @desc    Delete Voucher (Admin)
 * @route   DELETE /api/vouchers/:id
 */
export const deleteVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.voucher.delete({ where: { id: Number(id) } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus voucher' });
  }
};