import axios from 'axios';
import 'dotenv/config';

const WA_URL = process.env.WA_GATEWAY_URL;

// Fungsi Helper: Format Nomor HP (08 -> 628, hapus spasi/strip)
const formatPhone = (phone) => {
  let p = String(phone).trim();
  p = p.replace(/[^0-9]/g, ''); // Hapus karakter aneh
  if (p.startsWith('0')) {
    p = '62' + p.substring(1);
  }
  if (p.startsWith('8')) {
    p = '62' + p;
  }
  return p; // GoWA butuh format 628xxx@s.whatsapp.net atau 628xxx
};

/**
 * Mengirim Pesan Teks
 * @param {string} phone - Nomor Tujuan
 * @param {string} message - Isi Pesan
 */
export const sendWAMessage = async (phone, message) => {
  try {
    const formattedPhone = formatPhone(phone);
    
    // Payload sesuai dokumentasi GoWA REST API
    const payload = {
      phone: formattedPhone,
      message: message,
    };

    const response = await axios.post(`${WA_URL}/send/message`, payload, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' } // GoWA kadang butuh form-urlencoded atau JSON, cek docs v6+
    });
    
    // Note: GoWA v6 ke atas biasanya support JSON:
    // const response = await axios.post(`${WA_URL}/send/message`, payload);

    console.log(`[WA] Sent to ${formattedPhone}`);
    return response.data;
  } catch (error) {
    console.error(`[WA Error] Gagal kirim ke ${phone}:`, error.message);
    return null; // Jangan throw error agar transaksi tidak batal cuma gara-gara WA gagal
  }
};

/**
 * Mengirim Broadcast (Dengan Jeda agar aman)
 * @param {Array} phones - Array Nomor HP
 * @param {string} message - Isi Pesan
 */
// export const sendBroadcast = async (phones, message) => {
//   let success = 0;

//   for (const phone of phones) {
//     try {
//       await sendWAMessage(phone, message);

//       success++;

//       // Random delay 2–6 detik
//       const delay = Math.floor(Math.random() * (6000 - 2000)) + 2000;
//       console.log(`Tunggu ${delay}ms sebelum kirim ke nomor berikutnya...`);
      
//       await new Promise(resolve => setTimeout(resolve, delay));
      
//     } catch (err) {
//       console.error(`Gagal kirim ke ${phone}`, err);
//     }
//   }

//   return success;
// };

export const sendBroadcast = async (customers, message) => {
  let success = 0;

  for (const customer of customers) {
    try {
      const personalizedMessage = message
        .replace(/{{nama}}/gi, customer.name || "Kak");

      // FIX: gunakan phoneNumber, bukan customer.phone
      await sendWAMessage(customer.phoneNumber, personalizedMessage);

      success++;

      const delay = Math.floor(Math.random() * (6000 - 2000 + 1)) + 2000;
      await new Promise(resolve => setTimeout(resolve, delay));

    } catch (err) {
      console.log(`❌ Gagal kirim ke ${customer.phoneNumber} | Error:`, err.message);
    }
  }

  return success;
};
