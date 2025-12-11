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

// backend/src/controllers/broadcast.controller.js

// import { prisma } from "../lib/prisma.js";
// import {
//   sendWAMessage,
//   sendWALocation,
//   sendWAButton,
// } from "../services/whatsapp.service.js";

// const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// export const sendPromo = async (req, res) => {
//   try {
//     const { templates, filterType, filterValue } = req.body;

//     if (!Array.isArray(templates) || templates.length === 0) {
//       return res.status(400).json({ error: "Isi minimal 1 template pesan." });
//     }

//     let whereClause = { phoneNumber: { not: null } };

//     if (filterType === "SEGMENT") whereClause.rfmSegment = filterValue;
//     else if (filterType === "POINTS")
//       whereClause.points = { gte: Number(filterValue) || 0 };

//     const customers = await prisma.customer.findMany({
//       where: whereClause,
//       select: { phoneNumber: true, name: true },
//     });

//     if (customers.length === 0) {
//       return res.status(400).json({ error: "Tidak ada pelanggan ditemukan." });
//     }

//     res.json({
//       message: `Broadcast diproses untuk ${customers.length} pelanggan.`,
//     });

//     // -------------------------
//     // 🎯 KIRIM SEQUENCE PER CUSTOMER
//     // (1) Promo
//     // (2) Lokasi
//     // (3) Button “Lihat Toko”
//     // -------------------------

//   const latitude = "-7.1958388";
// const longitude = "113.4727014";
// const address = "My Perfume •Jl. Raya Ceguk, Kec. Tlanakan, Pamekasan, Jawa Timur";
// const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

// for (const customer of customers) {
//   const phone = customer.phoneNumber;
//   const name = customer.name || "Kak";
//   try {
//     // 1) Kirim pesan promo
//     const template = templates[Math.floor(Math.random() * templates.length)];
//     const promoMsg = template.replace(/{{nama}}/gi, name);
//     await sendWAMessage(phone, promoMsg);

//     await wait(Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000);

//     // 2) Kirim lokasi toko
//     await sendWALocation(phone, latitude, longitude, address);

//     await wait(Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000);

//     // 3) Kirim tombol “Lihat Toko”
//     await sendWAButton(
//       phone,
//       "Klik tombol di bawah untuk melihat lokasi toko kami 👇",
//       "My Perfume Store",
//       [
//         {
//           type: "url",
//           displayText: "📍 Lihat Toko",
//           url: mapsUrl
//         }
//       ]
//     );

//     console.log(`✔️ Selesai kirim sequence ke ${phone}`);

//   } catch (err) {
//     console.log(`❌ Gagal kirim ke ${phone}:`, err.message);
//   }

//   // Delay antar pelanggan
//   const delay = Math.floor(Math.random() * (12000 - 5000 + 1)) + 5000;
//   console.log(`⏳ Delay antar pelanggan: ${delay}ms`);
//   await wait(delay);
// }
//     console.log("🎉 Broadcast sequence selesai!");
//   } catch (error) {
//     console.error(error);
//     if (!res.headersSent)
//       res.status(500).json({ error: "Gagal memproses broadcast" });
//   }
// };
