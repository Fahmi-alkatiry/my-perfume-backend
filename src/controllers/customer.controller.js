// backend/src/controllers/customer.controller.js
import { prisma } from '../lib/prisma.js';

/**
 * @desc    Mendapatkan semua pelanggan (dengan Pagination & Search)
 */
export const getAllCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    const skip = (page - 1) * limit;

    // Filter pencarian (berdasarkan nama ATAU nomor HP)
    const where = search
      ? {
          OR: [
            { name: { contains: search } },
            { phoneNumber: { contains: search } },
          ],
        }
      : {};

    const [customers, totalCount] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.customer.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      data: customers,
      pagination: {
        totalCount,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil data pelanggan' });
  }
};

/**
 * @desc    Membuat pelanggan baru
 */
export const createCustomer = async (req, res) => {
  try {
    const newCustomer = await prisma.customer.create({
      data: req.body, // req.body berisi: { name: "...", phoneNumber: "..." }
    });
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error(error);
    // Tangani error jika nomor HP sudah terdaftar (unique constraint)
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Nomor HP sudah terdaftar.' });
    }
    res.status(500).json({ error: 'Gagal membuat pelanggan' });
  }
};

/**
 * @desc    Mendapatkan detail 1 pelanggan berdasarkan ID
 */
export const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({
      where: { id: Number(id) },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    }
    res.json(customer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil detail pelanggan' });
  }
};

/**
 * @desc    Mengupdate pelanggan berdasarkan ID
 */
export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedCustomer = await prisma.customer.update({
      where: { id: Number(id) },
      data: req.body,
    });
    res.json(updatedCustomer);
  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Nomor HP sudah terdaftar.' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    }
    res.status(500).json({ error: 'Gagal mengupdate pelanggan' });
  }
};

/**
 * @desc    Menghapus pelanggan berdasarkan ID
 */
export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.customer.delete({
      where: { id: Number(id) },
    });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    }
    // Tangani jika pelanggan tidak bisa dihapus karena punya transaksi
    if (error.code === 'P2003') { 
      return res.status(400).json({ error: 'Pelanggan tidak bisa dihapus karena memiliki riwayat transaksi.' });
    }
    res.status(500).json({ error: 'Gagal menghapus pelanggan' });
  }
};

/**
 * @desc    Melihat riwayat belanja spesifik pelanggan
 * @route   GET /api/customers/:id/history
 */
export const getCustomerHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const history = await prisma.transaction.findMany({
      where: {
        customerId: Number(id),
        status: 'COMPLETED' // Hanya transaksi sukses
      },
      take: 20, // Ambil 20 transaksi terakhir saja
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        details: {
          include: {
            product: {
              select: { name: true } // Kita butuh nama produknya
            }
          }
        }
      }
    });

    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil riwayat pelanggan' });
  }
};

export const getCustomerPointHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const points = await prisma.pointHistory.findMany({
      where: {
        customerId: Number(id),
      },
      orderBy: {
        createdAt: 'desc',
      },
      // Kita ambil info transaksi terkait jika ada
      include: {
        transaction: {
          select: { id: true, finalAmount: true }
        }
      }
    });

    res.json(points);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil riwayat poin' });
  }
};