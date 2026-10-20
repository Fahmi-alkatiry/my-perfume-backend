// backend/src/controllers/whatsapp.controller.js
import {
  getWhatsAppStatus,
  restartWhatsApp,
  logoutWhatsApp,
  sendWAMessage,
} from "../services/whatsapp.service.js";

/**
 * @desc    Cek status koneksi dan QR code WhatsApp saat ini
 * @route   GET /api/whatsapp/status
 * @access  Private/Admin
 */
export const getStatus = async (req, res) => {
  try {
    const status = getWhatsAppStatus();
    res.json(status);
  } catch (error) {
    console.error("[WhatsApp Controller] Gagal memuat status:", error);
    res.status(500).json({ error: "Gagal mengambil status WhatsApp" });
  }
};

/**
 * @desc    Restart koneksi soket Baileys
 * @route   POST /api/whatsapp/restart
 * @access  Private/Admin
 */
export const restart = async (req, res) => {
  try {
    await restartWhatsApp();
    res.json({ message: "Proses restart koneksi WhatsApp telah dimulai." });
  } catch (error) {
    console.error("[WhatsApp Controller] Gagal restart:", error);
    res.status(500).json({ error: "Gagal me-restart koneksi WhatsApp" });
  }
};

/**
 * @desc    Logout perangkat dan hapus sesi auth
 * @route   POST /api/whatsapp/logout
 * @access  Private/Admin
 */
export const logout = async (req, res) => {
  try {
    const result = await logoutWhatsApp();
    res.json(result);
  } catch (error) {
    console.error("[WhatsApp Controller] Gagal logout:", error);
    res.status(500).json({ error: "Gagal logout WhatsApp" });
  }
};

/**
 * @desc    Kirim pesan uji coba untuk memverifikasi koneksi
 * @route   POST /api/whatsapp/test-send
 * @access  Private/Admin
 */
export const testSend = async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "Nomor WhatsApp tujuan wajib diisi." });
    }

    const testMsg = message || "Halo! Ini adalah pesan tes dari My Perfume POS (Baileys Connected) ✨";
    await sendWAMessage(phone, testMsg);

    res.json({ message: `Pesan tes berhasil dikirim ke ${phone}` });
  } catch (error) {
    console.error("[WhatsApp Controller] Gagal kirim pesan tes:", error);
    res.status(400).json({ error: error.message || "Gagal mengirim pesan tes WhatsApp" });
  }
};
