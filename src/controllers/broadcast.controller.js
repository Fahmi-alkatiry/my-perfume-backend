import { prisma } from '../lib/prisma.js';
import { sendBroadcast } from '../services/whatsapp.service.js';

// export const sendPromo = async (req, res) => {
//   try {
//     const { message, minPoints } = req.body;

//     // 1. Ambil pelanggan eligible
//     const customers = await prisma.customer.findMany({
//       where: {
//         phoneNumber: { not: null },
//         points: { gte: Number(minPoints) || 0 },
//       },
//       select: { phoneNumber: true, name: true },
//     });

//     if (customers.length === 0) {
//       return res.status(400).json({ error: "Tidak ada target" });
//     }

//     // 2. Kirim response dulu ke admin
//     res.json({ 
//       status: "running",
//       totalTargets: customers.length,
//       note: "Broadcast berjalan di background"
//     });

//     // 3. Background task
//     const phones = customers.map(c => c.phoneNumber);

//     console.log(`[Broadcast Started] Target: ${phones.length} nomor`);

//     // const sent = await sendBroadcast(phones, message);
//     await sendBroadcast(customers, message);


//     console.log(`[Broadcast Done] Berhasil terkirim:  dari ${phones.length}`);

//   } catch (error) {
//     console.error(`Broadcast Error:`, error);
//   }
// };



export const sendPromo = async (req, res) => {
  try {
    const { message, filterType, filterValue } = req.body;

    if (!message || message.trim().length < 5) {
      return res.status(400).json({ error: "Pesan terlalu pendek atau kosong." });
    }

    // === FILTER BUILDER ===
    let whereClause = {
      phoneNumber: { not: null }
    };

    switch (filterType) {
      case "SEGMENT":
        whereClause.rfmSegment = filterValue;
        break;

      case "POINTS":
        whereClause.points = { gte: Number(filterValue) || 0 };
        break;

      case "ALL":
      default:
        break;
    }

    // === FETCH DATA CUSTOMER ===
    const customers = await prisma.customer.findMany({
      where: whereClause,
      select: {
        name: true,
        phoneNumber: true,
        id: true
      },
    });

    if (!customers.length) {
      return res.status(400).json({
        error: "Tidak ada pelanggan yang cocok dengan filter ini."
      });
    }

    // === Kirim response dulu ke UI agar tidak timeout ===
    res.json({
      status: "processing",
      message: `Broadcast dimulai untuk ${customers.length} pelanggan.`,
      targetCount: customers.length
    });

    // === Normalisasi nomor WA ===
    const normalizedCustomers = customers.map(c => ({
      ...c,
      phoneNumber: normalizePhone(c.phoneNumber)
    }));

    console.log(`[Broadcast Start] Target: ${normalizedCustomers.length}`);

    const sent = await sendBroadcast(normalizedCustomers, message);

    console.log(`[Broadcast Done] Terkirim: ${sent}/${normalizedCustomers.length}`);

    // Opsional: Simpan log ke database
    await prisma.broadcastLog.create({
      data: {
        totalSent: sent,
        totalTarget: normalizedCustomers.length,
        filterType,
        filterValue: filterValue || "-",
        createdAt: new Date()
      }
    });

  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Terjadi kesalahan server." });
    }
  }
};


// === Helper fungsi format nomor ===
const normalizePhone = (number) => {
  let p = number.replace(/\D/g, "").trim();

  if (p.startsWith("0")) return "62" + p.slice(1);
  if (p.startsWith("62")) return p;

  return "62" + p; // fallback
};

