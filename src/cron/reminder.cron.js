import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { sendBroadcastBatch } from "../services/whatsapp.service.js";

const scheduleLapsedCustomerReminders = () => {
  // Jalankan asinkronus setiap jam 09:00 pagi setiap hari zona waktu server
  cron.schedule("0 9 * * *", async () => {
    console.log("[CRON] Menjalankan pengecekan lapsed customers (09:00)...");
    try {
      await sendReminders(30, "1 bulan");
      await sendReminders(60, "2 bulan");
      await sendReminders(90, "3 bulan");
      console.log("[CRON] Selesai mengirim semua pengingat.");
    } catch (error) {
      console.error("[CRON Error]:", error);
    }
  });
  console.log("[CRON] Jadwal Lapsed Customer Reminder telah diaktifkan (09:00 AM).");
};

const sendReminders = async (days, monthString) => {
  const daysAgoStart = new Date();
  daysAgoStart.setDate(daysAgoStart.getDate() - days);
  daysAgoStart.setHours(0, 0, 0, 0);

  const daysAgoEnd = new Date(daysAgoStart);
  daysAgoEnd.setHours(23, 59, 59, 999);

  const customers = await prisma.customer.findMany({
    where: {
      lastTransactionAt: {
        gte: daysAgoStart,
        lte: daysAgoEnd,
      },
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
    },
  });

  if (customers.length === 0) {
    console.log(`[CRON] Tidak ada pelanggan yang absen tepat ${days} hari.`);
    return;
  }

  console.log(`[CRON] Ditemukan ${customers.length} pelanggan yang absen tepat ${days} hari. Memulai broadcast...`);

  // Siapkan data pelanggan dan pesannya untuk dikirim batch
  const customersWithMessage = customers.map(c => {
    // Ambil kata pertama untuk disapa jika nama terlalu panjang, atau pakai sesuai data
    const nameToGreet = c.name ? c.name.split(" ")[0] : "Kak";
    
    return {
      ...c,
      personalizedMessage: `Halo Kak ${nameToGreet}, sudah ${monthString} nih gak mampir ke My Perfume,\n\nStok Parfume kamu sudah menipis?\n\nyuk mampir lagi ke toko ✨`
    };
  });

  // Kirim broadcast menggunakan layanan whatsapp yang sudah ada mengatur delay antar batch otomatis
  const result = await sendBroadcastBatch(customersWithMessage, "");
  console.log(`[CRON] Broadcast untuk ${days} hari selesai. Sukses: ${result.success}, Gagal: ${result.fail}`);
};

export default scheduleLapsedCustomerReminders;
