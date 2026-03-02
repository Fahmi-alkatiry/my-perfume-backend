import midtransClient from 'midtrans-client';

// 1. Pastikan file .env terbaca (Opsional jika sudah di-load di server.js)
// import 'dotenv/config'; 

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const MIDTRANS_CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY;

// Validasi sederhana agar server tidak crash jika lupa isi .env
if (!MIDTRANS_SERVER_KEY || !MIDTRANS_CLIENT_KEY) {
  console.error("❌ ERROR: Midtrans Keys belum diatur di file .env!");
}

// 2. Instance SNAP (Untuk memunculkan pop-up pembayaran di Frontend)
export const snap = new midtransClient.Snap({
  isProduction: false, // FALSE = Mode Sandbox (Testing)
  serverKey: MIDTRANS_SERVER_KEY,
  clientKey: MIDTRANS_CLIENT_KEY,
});

// 3. Instance CORE API (Penting: Untuk cek status, cancel, atau refund via server)
export const coreApi = new midtransClient.CoreApi({
  isProduction: false,
  serverKey: MIDTRANS_SERVER_KEY,
  clientKey: MIDTRANS_CLIENT_KEY,
});