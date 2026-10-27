// src/services/whatsapp.service.js
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";
import { prisma } from "../lib/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = path.resolve(__dirname, "../../baileys_auth");

// Pastikan direktori auth ada
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let authState = null;
let isConnected = false;
let isConnecting = false;
let isManualRestart = false;
let currentQr = null;
let currentQrImage = null;
let connectionStatus = "disconnected"; // "disconnected" | "connecting" | "qr_ready" | "connected"
let connectedUser = null;
let reconnectTimer = null;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Format nomor telepon ke format JID WhatsApp (@s.whatsapp.net)
 */
export const formatPhone = (phone) => {
  let p = String(phone).trim().replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (p.startsWith("8")) p = "62" + p;
  if (!p.endsWith("@s.whatsapp.net")) p = p + "@s.whatsapp.net";
  return p;
};

/**
 * Ekstrak nomor telepon asli pelanggan dari pesan WhatsApp (mengatasi isu WhatsApp Multi-Device @lid)
 */
export const resolvePhoneNumberFromMessage = async (msg, currentAuthState) => {
  const key = msg.key || {};
  const remoteJid = key.remoteJid || "";
  const remoteJidAlt = key.remoteJidAlt || "";
  const participantAlt = key.participantAlt || "";
  const participant = key.participant || "";

  // 1. Cek candidate yang berakhiran '@s.whatsapp.net' (Phone Number JID)
  const jidCandidates = [remoteJidAlt, participantAlt, remoteJid, participant];
  for (const jid of jidCandidates) {
    if (jid && typeof jid === "string" && jid.endsWith("@s.whatsapp.net")) {
      const pn = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
      // Nomor telepon asli umumnya antara 9 sampai 14 digit dan bukan LID (LID berawalan 250... 15 digit)
      if (pn && pn.length >= 9 && pn.length <= 14) {
        return pn;
      }
    }
  }

  // 2. Jika remoteJid atau participant berakhiran '@lid', lakukan reverse lookup dari Baileys auth keys
  const lidJid = remoteJid.endsWith("@lid") ? remoteJid : (participant.endsWith("@lid") ? participant : null);
  if (lidJid) {
    const lidUser = lidJid.split("@")[0].split(":")[0].replace(/\D/g, "");

    // Coba via signalRepository Baileys jika ada
    try {
      if (sock?.signalRepository?.lidMapping?.getPNForLID) {
        const resolvedPn = await sock.signalRepository.lidMapping.getPNForLID(lidJid);
        if (resolvedPn) {
          const clean = resolvedPn.split("@")[0].split(":")[0].replace(/\D/g, "");
          if (clean && clean.length >= 9 && clean.length <= 14) {
            return clean;
          }
        }
      }
    } catch (e) {
      // lanjut ke fallback
    }

    // Coba via currentAuthState.keys (lid-mapping reverse)
    try {
      if (currentAuthState?.keys?.get) {
        const mapping = await currentAuthState.keys.get("lid-mapping", [`${lidUser}_reverse`]);
        const mappedPn = mapping?.[`${lidUser}_reverse`];
        if (mappedPn) {
          const clean = String(mappedPn).split("@")[0].split(":")[0].replace(/\D/g, "");
          if (clean && clean.length >= 9 && clean.length <= 14) {
            return clean;
          }
        }
      }
    } catch (e) {
      // lanjut ke fallback
    }

    // Coba baca langsung file reverse mapping di direktori auth
    try {
      const reverseFilePath = path.resolve(AUTH_DIR, `lid-mapping-${lidUser}_reverse.json`);
      if (fs.existsSync(reverseFilePath)) {
        const fileContent = fs.readFileSync(reverseFilePath, "utf8");
        const parsed = JSON.parse(fileContent);
        const clean = String(parsed).split("@")[0].split(":")[0].replace(/\D/g, "");
        if (clean && clean.length >= 9 && clean.length <= 14) {
          return clean;
        }
      }
    } catch (e) {
      // lanjut ke fallback
    }
  }

  // 3. Fallback jika bukan @lid
  if (!remoteJid.endsWith("@lid")) {
    const fallback = remoteJid.split("@")[0].split(":")[0].replace(/\D/g, "");
    if (fallback.length >= 9 && fallback.length <= 14) {
      return fallback;
    }
  }

  return null;
};

/**
 * Inisialisasi koneksi Baileys Socket
 */
export const connectToWhatsApp = async () => {
  if (isConnecting) {
    console.log("[WhatsApp/Baileys] Sedang dalam proses inisialisasi, abaikan panggilan duplikat.");
    return sock;
  }
  isConnecting = true;
  connectionStatus = "connecting";

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || "silent" });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    authState = state;
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(
      `[WhatsApp/Baileys] Memulai koneksi (WA Version: v${version.join(".")}, Latest: ${isLatest})...`
    );

    // Bersihkan instance lama jika masih ada
    if (sock) {
      try {
        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("creds.update");
        sock.end();
      } catch (e) {}
      sock = null;
    }

    sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: ["My Perfume POS", "Chrome", "1.0.0"],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQr = qr;
        try {
          currentQrImage = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
          connectionStatus = "qr_ready";
          console.log("[WhatsApp/Baileys] QR Code baru siap untuk di-scan melalui Web UI (/whatsapp).");
        } catch (err) {
          console.error("[WhatsApp/Baileys] Gagal membuat data URL QR Code:", err);
        }
      }

      if (connection === "close") {
        isConnected = false;
        isConnecting = false;
        connectionStatus = "disconnected";
        connectedUser = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || "Unknown error";
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        console.log(
          `[WhatsApp/Baileys] Koneksi terputus (${errorMessage}, status: ${statusCode || "N/A"}).`
        );

        if (isManualRestart) {
          console.log("[WhatsApp/Baileys] Restart manual, lewati penjadwalan reconnect.");
          isManualRestart = false;
          return;
        }

        if (!isLoggedOut) {
          console.log("[WhatsApp/Baileys] Mencoba menghubungkan kembali dalam 5 detik...");
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            connectToWhatsApp();
          }, 5000);
        } else {
          currentQr = null;
          currentQrImage = null;
          console.warn(
            "[WhatsApp/Baileys] Sesi perangkat telah logout. Silakan restart di Web UI untuk scan QR baru."
          );
        }
      } else if (connection === "open") {
        isConnected = true;
        isConnecting = false;
        isManualRestart = false;
        connectionStatus = "connected";
        currentQr = null;
        currentQrImage = null;

        const rawUser = sock?.user;
        connectedUser = rawUser
          ? {
              id: rawUser.id?.split(":")[0] || rawUser.id || "",
              name: rawUser.name || "My Perfume Store",
            }
          : null;

        console.log(`[WhatsApp/Baileys] Berhasil terhubung sebagai ${connectedUser?.id || "Perangkat Terhubung"}`);
      }
    });

    // Listener Pesan Masuk (Auto-Reply Pendaftaran Member)
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        try {
          // Abaikan jika bukan pesan teks atau dikirim oleh diri sendiri
          if (!msg.message || msg.key.fromMe) continue;

          const remoteJid = msg.key.remoteJid;
          // Abaikan status broadcast atau grup WhatsApp (hanya private chat)
          if (!remoteJid || remoteJid === "status@broadcast" || remoteJid.endsWith("@g.us")) {
            continue;
          }

          // Ekstrak pesan teks (mendukung format pesan biasa maupun extended)
          const text = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ""
          ).trim();

          const lowerText = text.toLowerCase();
          const isMemberKeyword = lowerText === "member" || lowerText === "daftar member" || lowerText === "join member";

          if (isMemberKeyword) {
            // Ekstrak nomor WhatsApp pengirim dengan akurat (mengatasi nomor LID internal WhatsApp)
            const cleanPhone = await resolvePhoneNumberFromMessage(msg, authState);

            console.log(`[WhatsApp/Bot] Permintaan member dari JID: ${remoteJid}, Terdeteksi No HP: ${cleanPhone || "UNRESOLVED_LID"}`);

            // Cek apakah nomor sudah terdaftar di database pelanggan
            let existingCustomer = null;
            if (cleanPhone) {
              try {
                const variations = [cleanPhone];
                if (cleanPhone.startsWith("62")) {
                  variations.push("0" + cleanPhone.slice(2));
                  variations.push("+" + cleanPhone);
                } else if (cleanPhone.startsWith("0")) {
                  variations.push("62" + cleanPhone.slice(1));
                }

                existingCustomer = await prisma.customer.findFirst({
                  where: {
                    phoneNumber: { in: variations },
                  },
                });
              } catch (dbErr) {
                console.error("[WhatsApp/Bot] Gagal memeriksa data pelanggan di DB:", dbErr.message);
              }
            }

            if (existingCustomer) {
              // Jika nomor sudah terdaftar sebagai member
              const displayPhone = cleanPhone || existingCustomer.phoneNumber;
              const alreadyMemberMsg = 
`🌸 *Member My Perfume* 🌸

Halo Kak *${existingCustomer.name}*! 👋
Nomor WhatsApp Kakak (*+${displayPhone}*) sudah terdaftar sebagai member resmi My Perfume ✨

💰 Poin kamu saat ini: *${existingCustomer.points || 0} Poin*
Yuk, sebutkan nomor HP ini saat transaksi di kasir untuk kumpulkan lebih banyak poin & promo menarik! 🎁`;

              await sock.sendMessage(remoteJid, { text: alreadyMemberMsg }, { quoted: msg });
              console.log(`[WhatsApp/Bot] Info member sudah terdaftar dikirim ke ${displayPhone}`);
            } else {
              // Jika nomor belum terdaftar, buat tautan registrasi
              // Jika nomor HP berhasil terdeteksi, tambahkan query ?phone=...
              // Jika tidak terdeteksi (LID murni), arahkan ke halaman registrasi umum
              const registerUrl = cleanPhone
                ? `https://myperfumee.my.id/register?phone=${cleanPhone}`
                : `https://myperfumee.my.id/register`;

              const registerMsg = 
`🌸 *Member My Perfume* 🌸

Terima kasih sudah tertarik bergabung! Yuk, lengkapi data dirimu melalui link di bawah ini:

${registerUrl}

Nikmati keuntungan menarik:
✨ Bonus Poin tiap belanja
✨ Info Promo Tercepat`;

              await sock.sendMessage(remoteJid, { text: registerMsg }, { quoted: msg });
              console.log(`[WhatsApp/Bot] Link pendaftaran member berhasil dikirim ke ${cleanPhone || remoteJid}`);
            }
          }
        } catch (msgErr) {
          console.error("[WhatsApp/Bot] Error saat memproses pesan masuk:", msgErr);
        }
      }
    });

    isConnecting = false;
    return sock;
  } catch (error) {
    isConnecting = false;
    isConnected = false;
    connectionStatus = "disconnected";
    console.error("[WhatsApp/Baileys] Gagal menginisialisasi soket:", error);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connectToWhatsApp();
    }, 5000);
  }
};

/**
 * Mendapatkan status koneksi WhatsApp saat ini
 */
export const getWhatsAppStatus = () => {
  return {
    status: connectionStatus,
    isConnected,
    isConnecting,
    qrImage: currentQrImage,
    user: connectedUser,
  };
};

/**
 * Restart koneksi WhatsApp secara manual
 */
export const restartWhatsApp = async () => {
  if (isConnecting) return;
  isManualRestart = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    if (sock) {
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert");
      sock.end();
      sock = null;
    }
  } catch (e) {
    console.error("[WhatsApp/Baileys] Error ending sock:", e);
  }

  isConnected = false;
  isConnecting = false;
  currentQr = null;
  currentQrImage = null;
  connectionStatus = "connecting";

  return connectToWhatsApp();
};

/**
 * Logout perangkat dan bersihkan file session untuk pairing ulang
 */
export const logoutWhatsApp = async () => {
  isManualRestart = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    if (sock) {
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert");
      await Promise.race([
        sock.logout().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      try {
        sock.end();
      } catch {}
      sock = null;
    }
  } catch (e) {
    console.error("[WhatsApp/Baileys] Error logging out:", e);
  }

  isConnected = false;
  isConnecting = false;
  currentQr = null;
  currentQrImage = null;
  connectedUser = null;
  connectionStatus = "disconnected";

  try {
    if (fs.existsSync(AUTH_DIR)) {
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      } catch (rmErr) {
        // Fallback jika direktori sedang dikunci process di Windows
        const files = fs.readdirSync(AUTH_DIR);
        for (const file of files) {
          try {
            fs.rmSync(path.join(AUTH_DIR, file), { recursive: true, force: true });
          } catch {}
        }
      }
      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }
    }
  } catch (e) {
    console.error("[WhatsApp/Baileys] Gagal mereset direktori sesi:", e);
  }

  setTimeout(() => {
    isManualRestart = false;
    connectToWhatsApp();
  }, 1500);

  return { success: true, message: "Berhasil logout WhatsApp dan mereset sesi." };
};

/**
 * Menunggu soket siap mengirim pesan
 */
const ensureConnected = async (timeoutMs = 15000) => {
  if (sock && isConnected) return true;

  if (!sock && !isConnecting) {
    connectToWhatsApp();
  }

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (sock && isConnected) return true;
    await wait(500);
  }

  throw new Error(
    "WhatsApp belum terhubung (Koneksi offline atau belum scan QR). Silakan scan QR terlebih dahulu di menu WhatsApp Web."
  );
};

/**
 * Mengirim pesan WhatsApp satuan
 */
export const sendWAMessage = async (phone, message) => {
  if (!message || !message.trim()) {
    throw new Error("Pesan kosong");
  }

  await ensureConnected();

  const formattedJid = formatPhone(phone);

  try {
    const result = await sock.sendMessage(formattedJid, {
      text: message.trim(),
    });

    console.log(`[WhatsApp/Baileys] Pesan terkirim ke ${formattedJid}`);
    return result;
  } catch (error) {
    console.error(`[WhatsApp/Baileys Error] Gagal kirim ke ${formattedJid}:`, error.message);
    throw error;
  }
};

/**
 * Mengirim pesan dengan mekanisme retry otomatis
 */
export async function safeSend(phone, msg, retry = 2) {
  try {
    await sendWAMessage(phone, msg);
    return true;
  } catch (err) {
    const errorMsg = String(err?.message || "").toLowerCase();
    if (
      errorMsg.includes("not on whatsapp") ||
      errorMsg.includes("invalid_jid") ||
      errorMsg.includes("not-authorized")
    ) {
      console.log(`[WhatsApp/Baileys] Skip retry untuk ${phone}: nomor tidak terdaftar.`);
      return false;
    }

    if (retry > 0) {
      const retryDelay = Math.floor(Math.random() * 5000) + 4000;
      console.log(`[WhatsApp/Baileys] Retry untuk ${phone} (${retry}x sisa dalam ${retryDelay}ms)...`);
      await wait(retryDelay);
      return safeSend(phone, msg, retry - 1);
    }
    return false;
  }
}

/**
 * Broadcast pesan batch ke banyak pelanggan
 */
export const sendBroadcastBatch = async (
  customers,
  message,
  batchSize = 3
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

        const msgTemplate = customer.personalizedMessage || message || "";

        const personalizedMessage = msgTemplate
          .replace(/{{nama}}/gi, name)
          .replace(/{{firstName}}/gi, firstName);

        if (!personalizedMessage.trim()) {
          console.log(`[WhatsApp/Baileys] Pesan kosong, dilewati: ${customer.phoneNumber}`);
          fail++;
          continue;
        }

        let phone = (customer.phoneNumber || "").replace(/\D/g, "");
        if (!phone) {
          fail++;
          continue;
        }
        if (phone.startsWith("0")) phone = "62" + phone.slice(1);

        const delay = Math.floor(Math.random() * 15000) + 10000;
        await wait(delay);

        const result = await safeSend(phone, personalizedMessage);
        if (result) success++;
        else fail++;

        counter++;

        if (counter % 25 === 0) {
          const cooldown =
            Math.floor(Math.random() * (180000 - 60000 + 1)) + 60000;
          console.log(`[WhatsApp/Baileys] Cooldown ${Math.round(cooldown / 1000)} detik...`);
          await wait(cooldown);
        }
      } catch (err) {
        console.error(`[WhatsApp/Baileys] ERROR nomor ${customer.phoneNumber}:`, err.message);
        fail++;
      }
    }

    const batchDelay = Math.floor(Math.random() * (30000 - 15000 + 1)) + 15000;
    console.log(`[WhatsApp/Baileys] Menunggu batch delay ${batchDelay / 1000} detik...`);
    await wait(batchDelay);
  }

  console.log(`[WhatsApp/Baileys] Selesai broadcast. Terkirim: ${success}, Gagal: ${fail}`);
  return { success, fail };
};

export const initWhatsApp = () => {
  connectToWhatsApp();
};
