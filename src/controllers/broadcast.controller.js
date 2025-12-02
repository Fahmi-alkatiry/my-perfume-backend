import { prisma } from '../lib/prisma.js';
import { sendBroadcast } from '../services/whatsapp.service.js';

export const sendPromo = async (req, res) => {
  try {
    const { message, minPoints } = req.body;

    // 1. Ambil pelanggan eligible
    const customers = await prisma.customer.findMany({
      where: {
        phoneNumber: { not: null },
        points: { gte: Number(minPoints) || 0 },
      },
      select: { phoneNumber: true, name: true },
    });

    if (customers.length === 0) {
      return res.status(400).json({ error: "Tidak ada target" });
    }

    // 2. Kirim response dulu ke admin
    res.json({ 
      status: "running",
      totalTargets: customers.length,
      note: "Broadcast berjalan di background"
    });

    // 3. Background task
    const phones = customers.map(c => c.phoneNumber);

    console.log(`[Broadcast Started] Target: ${phones.length} nomor`);

    // const sent = await sendBroadcast(phones, message);
    await sendBroadcast(customers, message);


    console.log(`[Broadcast Done] Berhasil terkirim:  dari ${phones.length}`);

  } catch (error) {
    console.error(`Broadcast Error:`, error);
  }
};


