// src/services/whatsapp.service.js
import axios from "axios";
import "dotenv/config";

const WA_URL = process.env.WA_GATEWAY_URL;
const waUser = process.env.WA_BASIC_USER || "user1";
const waPass = process.env.WA_BASIC_PASS || "pass1";
// Tambahkan ID perangkat di .env (contoh: 628xxx@s.whatsapp.net)
const WA_DEVICE_ID = process.env.WA_DEVICE_ID || "myperfume";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatPhone = (phone) => {
  let p = String(phone).trim().replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (p.startsWith("8")) p = "62" + p;
  // v8 membutuhkan suffix JID jika tidak otomatis ditambahkan oleh server
  if (!p.endsWith("@s.whatsapp.net")) p = p + "@s.whatsapp.net";
  return p;
};

export const sendWAMessage = async (phone, message) => {
  const formattedPhone = formatPhone(phone);
  if (!message.trim()) throw new Error("Pesan kosong");

  try {
    const payload = {
      phone: formattedPhone,
      message,
    };

    const response = await axios.post(`${WA_URL}/send/message`, payload, {
      // PERUBAHAN V8: Wajib menyertakan Device ID
      headers: {
        "X-Device-Id": WA_DEVICE_ID,
      },
      // Tambahkan Basic Auth jika diaktifkan di server Gowa
      auth: {
        username: waUser,
        password: waPass,
      },
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`WA Gateway error: ${response.status}`);
    }

    console.log(`[WA] Sent to ${formattedPhone} via Device ${WA_DEVICE_ID}`);
    return response.data;
  } catch (error) {
    console.error(
      `[WA Error] Gagal kirim ke ${formattedPhone}:`,
      error.response?.data || error.message,
    );
    throw error;
  }
};

// Fungsi Retry (Tetap sama)
export async function safeSend(phone, msg, retry = 2) {
  try {
    await sendWAMessage(phone, msg);
    return true;
  } catch (err) {
    // JANGAN RETRY jika nomor memang tidak ada di WhatsApp
    const errorMsg = err.response?.data?.message || err.message;
    if (
      errorMsg.includes("not on whatsapp") ||
      errorMsg.includes("INVALID_JID")
    ) {
      console.log(`🚫 Skip retry untuk ${phone} karena nomor tidak terdaftar.`);
      return false;
    }

    if (retry > 0) {
      const retryDelay = Math.floor(Math.random() * 5000) + 4000;
      console.log(`🔁 Retry untuk ${phone} (${retry}x sisa)...`);
      await wait(retryDelay);
      return safeSend(phone, msg, retry - 1);
    }
    return false;
  }
}

// Broadcast aman & natural
export const sendBroadcastBatch = async (
  customers,
  message,
  batchSize = 3, // kecil agar makin aman
) => {
  let success = 0;
  let fail = 0;
  let counter = 0;

  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize);

    for (const customer of batch) {
      try {
        const name = (customer.name || "Kak").trim();
        const firstName = name.split(" ")[0];

        // Ambil template pesan customer jika ada
        const msgTemplate = customer.personalizedMessage || message || "";

        // Buat pesan lebih unik
        const uniqueSuffix = ["🙂", "🙏", "✨", "⭐", "🎀", ""][
          Math.floor(Math.random() * 6)
        ];

        const personalizedMessage = msgTemplate
          .replace(/{{nama}}/gi, name)
          .replace(/{{firstName}}/gi, firstName);
        // .trim() + ` ${uniqueSuffix}`;

        if (!personalizedMessage.trim()) {
          console.log(`⚠️ Pesan kosong, dilewati: ${customer.phoneNumber}`);
          fail++;
          continue;
        }

        let phone = (customer.phoneNumber || "").replace(/\D/g, "");
        if (!phone) {
          fail++;
          continue;
        }
        if (phone.startsWith("0")) phone = "62" + phone.slice(1);

        // Delay antar pesan agar natural (Safe mode)
        const delay = Math.floor(Math.random() * (14000 - 6000 + 1)) + 6000;
        await wait(delay);

        const result = await safeSend(phone, personalizedMessage);
        if (result) success++;
        else fail++;

        counter++;

        // Cooldown setiap 25 pesan
        if (counter % 25 === 0) {
          const cooldown =
            Math.floor(Math.random() * (300000 - 120000 + 1)) + 120000;
          console.log(`😴 Cooldown ${Math.round(cooldown / 1000)} detik...`);
          await wait(cooldown);
        }
      } catch (err) {
        console.log(`❌ ERROR nomor ${customer.phoneNumber}:`, err.message);
        fail++;
      }
    }

    // Delay antar batch
    const batchDelay = Math.floor(Math.random() * (50000 - 20000 + 1)) + 20000;
    console.log(`⏳ Menunggu batch delay ${batchDelay / 1000} detik...`);
    await wait(batchDelay);
  }

  console.log(`🎯 Selesai. Terkirim: ${success}, Gagal: ${fail}`);
  return { success, fail };
};

// export const sendWALocation = async (phone, latitude, longitude, address = "") => {
//   const formattedPhone = formatPhone(phone);

//   try {
//     const payload = {
//       // phone: "6289668125652",
//       phone: formattedPhone,
//       latitude,
//       longitude,
//       address,
//     };

//     const response = await axios.post(`${WA_URL}/send/location`, payload);

//     if (response.status < 200 || response.status >= 300) {
//       throw new Error(`WA Gateway error: ${response.status}`);
//     }

//     console.log(`[WA] Lokasi terkirim ke ${formattedPhone}`);
//     return response.data;

//   } catch (error) {
//     console.error(`[WA Error] Gagal kirim lokasi ke ${formattedPhone}:`, error.response?.data || error.message);
//     throw error;
//   }
// };

// export const sendWAButton = async (phone, text, footer, buttons) => {
//   const formattedPhone = formatPhone(phone);

//   try {
//     const payload = {
//       // phone: "6289668125652",
//       phone: formattedPhone,
//       message: text,
//       footer,
//       buttons
//     };

//     const res = await axios.post(`${WA_URL}/send/button`, payload);
//     console.log(`[WA] Button terkirim ke ${formattedPhone}`);
//     return res.data;

//   } catch (err) {
//     console.error(`[WA Error] Button gagal: ${formattedPhone}`, err.response?.data || err.message);
//     throw err;
//   }
// };
