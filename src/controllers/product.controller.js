// backend/src/controllers/product.controller.js
import { prisma } from '../lib/prisma.js';

/**
 * @desc    Mendapatkan semua data produk
 */
export const getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search } },
            { productCode: { contains: search } },
          ],
        }
      : {};

    const [products, totalCount] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { productCode: 'asc' }, // ⬅️ Urut berdasarkan kode produk
      }),
      prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      data: products,
      pagination: {
        totalCount,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil data produk' });
  }
};
/**
 * @desc    Membuat produk baru
 */
export const createProduct = async (req, res) => {
  try {
    const newProduct = await prisma.product.create({
      data: req.body,
    });
    res.status(201).json(newProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal membuat produk' });
  }
};

/**
 * @desc    Mendapatkan detail 1 produk berdasarkan ID
 */
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id: Number(id) }, // <--- Konversi ID ke Angka
    });

    if (!product) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }
    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil detail produk' });
  }
};

/**
 * @desc    Mengupdate produk berdasarkan ID
 */
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProduct = await prisma.product.update({
      where: { id: Number(id) }, // <--- Konversi ID ke Angka
      data: req.body,
    });
    res.json(updatedProduct);
  } catch (error) {
    console.error(error);
    // Tangani jika produk tidak ditemukan saat update
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }
    res.status(500).json({ error: 'Gagal mengupdate produk' });
  }
};

/**
 * @desc    Menghapus produk berdasarkan ID
 */
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({
      where: { id: Number(id) }, // <--- Konversi ID ke Angka
    });
    // Kirim status 204 (No Content) sebagai tanda sukses hapus
    res.status(204).send();
  } catch (error) {
    console.error(error);
    // Tangani jika produk tidak ditemukan saat hapus
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }
    res.status(500).json({ error: 'Gagal menghapus produk' });
  }
};


/**
 * @desc    Menambah stok ke produk (Stok Masuk)
 * @route   POST /api/products/:id/add-stock
 */
export const addStock = async (req, res) => {
  try {
    const { id } = req.params;
    // Kita akan ambil 'quantity' dan 'notes' dari frontend
    const { quantity } = req.body;
    // Kita ambil userId dari middleware 'protect'
    const userId = req.user.id;

    const quantityNumber = Number(quantity);

    if (!quantityNumber || quantityNumber <= 0) {
      return res.status(400).json({ error: 'Jumlah (quantity) harus angka positif.' });
    }

    // Gunakan $transaction untuk memastikan kedua operasi berhasil
    const [updatedProduct] = await prisma.$transaction([
      
      // 1. Update (tambah) stok produk
      prisma.product.update({
        where: { id: Number(id) },
        data: {
          stock: {
            increment: quantityNumber, // 'increment' akan menambah, bukan me-replace
          },
        },
      }),

      // 2. Catat di riwayat stok
      prisma.stockHistory.create({
        data: {
          productId: Number(id),
          quantity: quantityNumber, // Angka positif karena STOK MASUK
          type: 'IN',
          notes: 'Stok Masuk (Manual)',
          referenceType: 'Manual',
          userId: userId, // Catat siapa yang menambah
        },
      }),
    ]);

    // Kembalikan data produk yang sudah di-update
    res.json(updatedProduct);

  } catch (error) {
    console.error(error);
    if (error.code === 'P2025') { // Error jika produk tidak ditemukan
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }
    res.status(500).json({ error: 'Gagal menambah stok' });
  }
};