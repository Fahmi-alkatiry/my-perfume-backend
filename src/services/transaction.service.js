// backend/src/services/transaction.service.js
import { prisma } from "../lib/prisma.js";
import { sendWAMessage } from "./whatsapp.service.js";

/**
 * Buat dan kirim struk belanja via WhatsApp
 * @param {number} transactionId 
 */
export const sendTransactionReceipt = async (transactionId) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: Number(transactionId) },
      include: {
        customer: true,
        details: {
          include: { product: true }
        }
      }
    });

    if (!transaction || !transaction.customer || !transaction.customer.phoneNumber) {
      console.log(`[Receipt] Skip WA for TRX #${transactionId}: No customer/phone`);
      return;
    }

    const { customer, details } = transaction;

    const dateStr = new Date(transaction.createdAt).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const timeStr = new Date(transaction.createdAt).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Buat detail item
    const itemsList = details
      .map((item) => {
        return `${item.product.name} x${item.quantity} = Rp ${(
          Number(item.priceAtTransaction) * item.quantity
        ).toLocaleString("id-ID")}`;
      })
      .join("\n");

    const totalAllDiscount =
      (Number(transaction.discountByVoucher) || 0) + (Number(transaction.discountByPoints) || 0);

    // Susun baris diskon secara kondisional
    const voucherRow =
      Number(transaction.discountByVoucher) > 0
        ? `🎟️ Voucher       : -Rp ${Number(transaction.discountByVoucher).toLocaleString("id-ID")}\n`
        : "";

    const pointDiscountRow =
      Number(transaction.discountByPoints) > 0
        ? `🎁 Potong Poin   : -Rp ${Number(transaction.discountByPoints).toLocaleString("id-ID")}\n`
        : "";

    const message = `🧾 *My Perfume - Struk Belanja*

📍 Jl. Raya Panglegur, Kota Pamekasan
🗓️ ${dateStr} | ⏰ ${timeStr}
👤 Pelanggan: ${customer.name}

━━━━━━━━━━━━━━━━
   *Detail Pesanan*
━━━━━━━━━━━━━━━━
${itemsList}

━━━━━━━━━━━━━━━━
💰 *Ringkasan*
━━━━━━━━━━━━━━━━
💵 Subtotal      : Rp ${Number(transaction.totalPrice).toLocaleString("id-ID")}
${voucherRow}${pointDiscountRow}${totalAllDiscount > 0 ? `━━━━━━━━━━━━━━━━\n` : ""}💳 *Total Bayar   : Rp ${Number(transaction.finalAmount).toLocaleString("id-ID")}*

━━━━━━━━━━━━━━━━
✨ *Info Poin*
━━━━━━━━━━━━━━━━
📈 Poin Didapat : +${transaction.pointsEarned}
📉 Poin Ditukar : -${transaction.pointsUsed}
🏆 *Total Poin   : ${customer.points}*

━━━━━━━━━━━━━━━━
🙏 Terima kasih telah berbelanja di My Perfume!
Simpan nomor ini untuk info promo dan katalog terbaru.
IG: @Myperfumeee_
`;

    await sendWAMessage(customer.phoneNumber, message);
    console.log(`[Receipt] Sent WA for TRX #${transactionId} to ${customer.phoneNumber}`);
  } catch (error) {
    console.error(`[Receipt Error] Failed to send WA for TRX #${transactionId}:`, error);
  }
};
