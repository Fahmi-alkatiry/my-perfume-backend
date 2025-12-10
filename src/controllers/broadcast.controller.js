// backend/src/controllers/broadcast.controller.js

import { prisma } from '../lib/prisma.js';
import { sendBroadcastBatch,  } from '../services/whatsapp.service.js';




export const sendPromo = async (req, res) => {
  try {
    const { templates, filterType, filterValue } = req.body;

    if (!Array.isArray(templates) || templates.length === 0) {
      return res.status(400).json({ error: "Isi minimal 1 template pesan." });
    }

    let whereClause = { phoneNumber: { not: null } };

    if (filterType === "SEGMENT") whereClause.rfmSegment = filterValue;
    else if (filterType === "POINTS") whereClause.points = { gte: Number(filterValue) || 0 };

    const customers = await prisma.customer.findMany({
      where: whereClause,
      select: { phoneNumber: true, name: true }
    });

    if (customers.length === 0) {
      return res.status(400).json({ error: "Tidak ada pelanggan yang cocok dengan filter ini." });
    }

    res.json({ message: `Broadcast diproses untuk ${customers.length} pelanggan.` });

    // Kirim di background, pilih 1 template acak per customer
    await sendBroadcastBatch(
      customers.map((c) => {
        const template = templates[Math.floor(Math.random() * templates.length)];
        return { ...c, personalizedMessage: template };
      }),
      null, // message null karena sudah ditangani per customer
      4,
      [3000, 9500]
    );

  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: "Gagal memproses broadcast" });
  }
};


