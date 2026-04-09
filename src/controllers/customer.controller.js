// backend/src/controllers/customer.controller.js
import { prisma } from "../lib/prisma.js";
import { sendWAMessage } from "../services/whatsapp.service.js";

const standardizeNfcId = (id) => {
  if (!id) return null;
  let rawId = String(id).trim().toLowerCase();

  // JIKA INPUT DARI HP (ada tanda titik dua)
  if (rawId.includes(":")) {
    const bytes = rawId.split(":");
    // Balik urutannya (Little Endian) seperti cara kerja USB Reader
    const reversedHex = bytes.reverse().join(""); 
    // Ubah Hex ke Decimal agar sama dengan USB Reader
    return parseInt(reversedHex, 16).toString();
  }

  // JIKA INPUT DARI USB (sudah angka desimal)
  return rawId;
};

/**
 * @desc    Mendapatkan semua pelanggan (dengan Pagination & Search)
 */
export const getAllCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = (req.query.search || "").trim();
    // sorting
    const sort = req.query.sort || "name"; // field
    const order = req.query.order || "asc"; // asc | desc

    const skip = (page - 1) * limit;

    // Filter pencarian
    const where = search
      ? {
          OR: [
            { name: { contains: search } },
            { phoneNumber: { contains: search } },
            {nfcCardId: { contains: search } },
          ],
        }
      : {};

    const [customers, totalCount] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sort]: order === "desc" ? "desc" : "asc",
        },
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
    console.log(`[GetAllCustomers] Page: ${page}, Limit: ${limit}, Search: "${search}", Sort: ${sort} ${order}`);
    console.log("Search Query:", JSON.stringify(search));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Gagal mengambil data pelanggan" });
  }
};

/**
 * @desc    Membuat pelanggan baru (Safe Version)
 */
export const createCustomer = async (req, res) => {
  // 1. Destructure data agar tidak ada field sampah yang masuk ke DB
  const { name, phoneNumber } = req.body;

  if (!name || !phoneNumber) {
    return res.status(400).json({ error: "Nama dan Nomor HP wajib diisi." });
  }

  try {
    // 2. Eksekusi Create
    const newCustomer = await prisma.customer.create({
      data: {
        name,
        phoneNumber, // Pastikan di frontend sudah dipanggil normalizePhone()
      },
    });

    // 3. ✅ Kirim WA Welcome (Non-blocking)
    const welcomeMessage = `Halo *${newCustomer.name}* 👋

Terima kasih sudah menjadi pelanggan *My Perfume* ✨
Semoga aroma pilihan kami menemani harimu 😊

_Simpan nomor ini untuk info promo & katalog terbaru._
*My Perfume* 🌸`;

    // Kita panggil tanpa 'await' supaya response ke kasir gak nunggu WA terkirim
    sendWAMessage(newCustomer.phoneNumber, welcomeMessage).catch((err) => {
      console.error("[WA Error]: Gagal kirim pesan welcome ->", err.message);
    });

    return res.status(201).json(newCustomer);
  } catch (error) {
    // 4. Handle Unique Constraint (P2002)
    if (error.code === "P2002") {
      console.warn(`[P2002] Duplikasi nomor HP: ${phoneNumber}`);
      return res.status(400).json({
        error: "Nomor HP ini sudah terdaftar di sistem.",
      });
    }

    console.error("[CreateCustomer Error]:", error);
    return res.status(500).json({ error: "Gagal membuat data pelanggan." });
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
      return res.status(404).json({ error: "Pelanggan tidak ditemukan" });
    }
    res.json(customer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Gagal mengambil detail pelanggan" });
  }
};

/**
 * @desc    Mengupdate pelanggan berdasarkan ID
 */
export const updateCustomer = async (req, res) => {
  try {
   const { id } = req.params;
    const { nfcCardId, ...otherData } = req.body;

    const dataToUpdate = { ...otherData };
    
    // Normalisasi ID sebelum masuk ke database
    if (nfcCardId !== undefined) {
      dataToUpdate.nfcCardId = standardizeNfcId(nfcCardId);
    }

   const updatedCustomer = await prisma.customer.update({
      where: { id: Number(id) },
      data: dataToUpdate,
    });
    console.log(`[UpdateCustomer] ID: ${id}, Data: ${JSON.stringify(dataToUpdate)}`);

    res.json(updatedCustomer);

  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Nomor HP atau Kartu NFC sudah terdaftar." });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Pelanggan tidak ditemukan" });
    }
    console.error("[UpdateCustomer Error]:", error);
    res.status(500).json({ error: "Gagal mengupdate pelanggan" });
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
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Pelanggan tidak ditemukan" });
    }
    // Tangani jika pelanggan tidak bisa dihapus karena punya transaksi
    if (error.code === "P2003") {
      return res.status(400).json({
        error:
          "Pelanggan tidak bisa dihapus karena memiliki riwayat transaksi.",
      });
    }
    console.error("[DeleteCustomer Error]:", error);
    res.status(500).json({ error: "Gagal menghapus pelanggan" });
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
        status: "COMPLETED", // Hanya transaksi sukses
      },
      take: 20, // Ambil 20 transaksi terakhir saja
      orderBy: {
        createdAt: "desc",
      },
      include: {
        details: {
          include: {
            product: {
              select: { name: true }, // Kita butuh nama produknya
            },
          },
        },
      },
    });

    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Gagal mengambil riwayat pelanggan" });
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
        createdAt: "desc",
      },
      // Kita ambil info transaksi terkait jika ada
      include: {
        transaction: {
          select: { id: true, finalAmount: true },
        },
      },
    });

    res.json(points);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Gagal mengambil riwayat poin" });
  }
};

export const getLapsedCustomers = async (req, res) => {
  try {
    // 1. Tentukan ambang batas waktu (30 hari yang lalu)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 2. Query ke database
    const lapsedCustomers = await prisma.customer.findMany({
      where: {
        OR: [
          {
            lastTransactionAt: {
              lte: thirtyDaysAgo, // terakhir transaksi lebih dari 30 hari
            },
          },
          {
            lastTransactionAt: null, // pelanggan yang belum pernah transaksi
          },
        ],
      },
      orderBy: {
        lastTransactionAt: "desc",
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        points: true,
        lastTransactionAt: true,
      },
    });
    return res.status(200).json({
      count: lapsedCustomers.length,
      data: lapsedCustomers,
    });
  } catch (error) {
    console.error("[GetLapsedCustomers Error]:", error);
    return res
      .status(500)
      .json({ error: "Gagal mengambil data pelanggan lama." });
  }
};

/**
 * @desc    Mendapatkan pelanggan berdasarkan NFC ID bawaan pabrik (Fixed ID/UID)
 * @route   GET /api/customers/nfc/:nfcId
 */
export const getCustomerByNfcId = async (req, res) => {
  const { nfcId } = req.params;
  console.log(`[GetCustomerByNfcId] Mencari pelanggan dengan NFC ID: ${nfcId}`);
  
  try {
    const standardizedNfcId = standardizeNfcId(nfcId);
    const customer = await prisma.customer.findUnique({
      where: { nfcCardId: standardizedNfcId }
    });
    
    if (!customer) return res.status(404).json({ error: "Kartu tidak terdaftar" });
    res.json(customer);
  } catch (error) {
    console.error("[GetCustomerByNfcId Error]:", error);
    res.status(500).json({ error: "Gagal mencari pelanggan berdasarkan kartu NFC" });
  }
};
