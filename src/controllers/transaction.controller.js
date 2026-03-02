// backend/src/controllers/transaction.controller.js
import { prisma } from "../lib/prisma.js";
import { sendWAMessage } from "../services/whatsapp.service.js";
import { snap } from "../services/midtrans.service.js";

/**
 * @route   POST /api/transactions
 * @desc    Membuat transaksi baru (DENGAN LOGIKA POIN & DISKON)
 */

// import { prisma } from "../lib/prisma.js";
// import { sendWAMessage } from "../services/whatsapp.service.js";

export const createTransaction = async (req, res) => {
  const { items, userId, paymentMethodId, customerId, usePoints, voucherId } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "Keranjang tidak boleh kosong" });
  }

  try {
    // --- 1. PRE-CALCULATION & VALIDASI STOK ---
    const productIds = items.map((item) => item.productId);
    const productsInCart = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(productsInCart.map((p) => [p.id, p]));

    let totalAmount = 0;
    let totalCostTransaction = 0;
    const transactionDetailsData = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Produk ID ${item.productId} hilang.`);
      if (product.stock < item.quantity) throw new Error(`Stok ${product.name} habis.`);

      const subtotal = Number(product.sellingPrice) * item.quantity;
      const totalCost = Number(product.purchasePrice) * item.quantity;
      totalAmount += subtotal;
      totalCostTransaction += totalCost;

      transactionDetailsData.push({
        productId: product.id,
        quantity: item.quantity,
        priceAtTransaction: product.sellingPrice,
        purchasePriceAtTransaction: product.purchasePrice,
        subtotal: subtotal,
        totalCostOfGoods: totalCost,
        totalMargin: subtotal - totalCost,
      });
    }

    // --- 2. LOGIKA VOUCHER ---
    let discountByVoucher = 0;
    let usedVoucherId = null;
    if (voucherId) {
      const voucher = await prisma.voucher.findUnique({ where: { id: Number(voucherId) } });
      if (voucher && voucher.isActive && totalAmount >= Number(voucher.minPurchase)) {
        discountByVoucher = voucher.type === "FIXED" ? Number(voucher.value) : (totalAmount * Number(voucher.value)) / 100;
        if (voucher.maxDiscount && discountByVoucher > Number(voucher.maxDiscount)) discountByVoucher = Number(voucher.maxDiscount);
        usedVoucherId = voucher.id;
      }
    }

    // --- 3. LOGIKA POIN (VIRTUAL POINTS) ---
    let discountByPoints = 0;
    let pointsUsed = 0;
    let pointsEarned = 0;
    let finalCustomerPoints = 0;
    let amountAfterVoucher = totalAmount - discountByVoucher;
    if (amountAfterVoucher < 0) amountAfterVoucher = 0;

    if (customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: Number(customerId) } });
      const potentialPoints = Math.floor(amountAfterVoucher / 30000);
      const totalVirtualPoints = customer.points + potentialPoints;

      if (usePoints && totalVirtualPoints >= 10) {
        discountByPoints = 30000;
        pointsUsed = 10;
        pointsEarned = potentialPoints;
        finalCustomerPoints = totalVirtualPoints - 10;
      } else {
        pointsEarned = potentialPoints;
        finalCustomerPoints = totalVirtualPoints;
      }
    }

    const finalAmount = amountAfterVoucher - discountByPoints > 0 ? amountAfterVoucher - discountByPoints : 0;

    // --- 4. PENENTUAN ALUR (CASH VS MIDTRANS) ---
    // Cari nama payment method (Pastikan di DB ada nama 'CASH' atau 'MIDTRANS')
    const method = await prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
    const isMidtrans = method?.name.toUpperCase().includes("MIDTRANS");

    const result = await prisma.$transaction(async (tx) => {
      // Simpan Transaksi Master
      const transaction = await tx.transaction.create({
        data: {
          totalPrice: totalAmount,
          discountByVoucher,
          voucherId: usedVoucherId,
          discountByPoints,
          finalAmount,
          totalMargin: totalAmount - totalCostTransaction - discountByVoucher - discountByPoints,
          pointsEarned,
          pointsUsed,
          status: isMidtrans ? "PENDING" : "COMPLETED",
          userId,
          paymentMethodId,
          customerId,
          details: { create: transactionDetailsData },
        },
      });

      // JIKA CASH: Langsung Eksekusi Stok & Poin
      if (!isMidtrans) {
        for (const item of items) {
          await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
          await tx.stockHistory.create({
            data: { productId: item.productId, quantity: -item.quantity, type: "OUT", notes: "Penjualan Cash", referenceType: "Transaction", referenceId: transaction.id }
          });
        }
        if (customerId) {
          await tx.customer.update({ where: { id: customerId }, data: { points: finalCustomerPoints, lastTransactionAt: new Date() } });
          await tx.pointHistory.createMany({
            data: [
              { customerId, pointsChange: pointsEarned, reason: "Earned", transactionId: transaction.id },
              ...(pointsUsed > 0 ? [{ customerId, pointsChange: -pointsUsed, reason: "Redeemed", transactionId: transaction.id }] : [])
            ]
          });
          // Kirim WA Langsung
          sendReceiptWA(transaction.id, finalCustomerPoints);
        }
        return transaction;
      }

      // JIKA MIDTRANS: Buat Token
      const parameter = {
        transaction_details: { order_id: transaction.id.toString(), gross_amount: Math.round(finalAmount) },
        customer_details: customerId ? { first_name: (await tx.customer.findUnique({where:{id:customerId}})).name } : undefined
      };
      const midtransTx = await snap.createTransaction(parameter);
      return { ...transaction, snapToken: midtransTx.token };
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// --- FUNGSI KIRIM WA (Pemisah agar bersih) ---
async function sendReceiptWA(transactionId, currentPoints) {
  const trx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { details: { include: { product: true } }, customer: true }
  });

  if (!trx.customer?.phoneNumber) return;

  const itemsList = trx.details.map(d => `${d.product.name} x${d.quantity}`).join("\n");
  const voucherRow = trx.discountByVoucher > 0 ? `🎟️ Voucher : -Rp ${Number(trx.discountByVoucher).toLocaleString("id-ID")}\n` : "";
  const pointRow = trx.discountByPoints > 0 ? `🎁 Poin    : -Rp ${Number(trx.discountByPoints).toLocaleString("id-ID")}\n` : "";

  const msg = `🧾 *My Perfume - Struk*
👤: ${trx.customer.name}
━━━━━━━━━━━━━━━━
${itemsList}
━━━━━━━━━━━━━━━━
💵 Subtotal : Rp ${Number(trx.totalPrice).toLocaleString("id-ID")}
${voucherRow}${pointRow}💳 *Total   : Rp ${Number(trx.finalAmount).toLocaleString("id-ID")}*
━━━━━━━━━━━━━━━━
🏆 Total Poin: ${currentPoints}
🙏 Terima Kasih!`;

  sendWAMessage(trx.customer.phoneNumber, msg);
}
/**
 * @desc    Membatalkan transaksi (VOID)
 * @route   POST /api/transactions/:id/cancel
 */

export const cancelTransaction = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // Admin yang melakukan pembatalan

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Ambil data transaksi beserta detailnya
      const transaction = await tx.transaction.findUnique({
        where: { id: Number(id) },
        include: { details: true, customer: true },
      });

      if (!transaction) throw new Error("Transaksi tidak ditemukan");
      if (transaction.status === "CANCELLED")
        throw new Error("Transaksi sudah dibatalkan sebelumnya");

      // 2. Kembalikan Stok Produk
      for (const item of transaction.details) {
        // Tambah stok kembali
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });

        // Catat di history stok (IN karena pembatalan)
        await tx.stockHistory.create({
          data: {
            productId: item.productId,
            quantity: item.quantity,
            type: "IN",
            notes: `Pembatalan Transaksi #${transaction.id}`,
            referenceType: "Cancellation",
            referenceId: transaction.id,
            userId: userId,
          },
        });
      }

      // 3. Revisi Poin Pelanggan (Jika ada pelanggan)
      if (transaction.customerId) {
        let pointsChange = 0;

        // a. Tarik kembali poin yang didapat (Kurangi)
        if (transaction.pointsEarned > 0) {
          pointsChange -= transaction.pointsEarned;
          await tx.pointHistory.create({
            data: {
              customerId: transaction.customerId,
              pointsChange: -transaction.pointsEarned,
              reason: `Cancel TRX #${transaction.id} (Revert Earned)`,
              transactionId: transaction.id,
            },
          });
        }

        // b. Kembalikan poin yang dipakai diskon (Tambah)
        if (transaction.pointsUsed > 0) {
          pointsChange += transaction.pointsUsed;
          await tx.pointHistory.create({
            data: {
              customerId: transaction.customerId,
              pointsChange: transaction.pointsUsed,
              reason: `Cancel TRX #${transaction.id} (Refund Used)`,
              transactionId: transaction.id,
            },
          });
        }

        // Update total poin di master customer
        if (pointsChange !== 0) {
          await tx.customer.update({
            where: { id: transaction.customerId },
            data: { points: { increment: pointsChange } },
          });
        }
      }

      // 4. Ubah Status Transaksi
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: "CANCELLED" },
      });
    });

    res.json({ message: "Transaksi berhasil dibatalkan" });
  } catch (error) {
    console.error(error);
    res
      .status(400)
      .json({ error: error.message || "Gagal membatalkan transaksi" });
  }
};

/**
 * @desc    Menambahkan pelanggan ke transaksi yang sudah selesai (Claim Poin)
 * @route   PUT /api/transactions/:id/assign-customer
 */
export const assignCustomerToTransaction = async (req, res) => {
  const { id } = req.params; // ID Transaksi
  const { customerId } = req.body; // ID Pelanggan yang mau ditautkan

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Cek Transaksi
      const transaction = await tx.transaction.findUnique({
        where: { id: Number(id) },
      });

      if (!transaction) throw new Error("Transaksi tidak ditemukan");
      if (transaction.customerId)
        throw new Error("Transaksi ini sudah memiliki pelanggan.");
      if (transaction.status !== "COMPLETED")
        throw new Error("Hanya transaksi sukses yang bisa di-claim.");

      // 2. Hitung Poin yang seharusnya didapat
      // Rumus: Total Bayar / 30.000
      const pointsEarned = Math.floor(Number(transaction.finalAmount) / 30000);

      // 3. Update Transaksi
      await tx.transaction.update({
        where: { id: Number(id) },
        data: {
          customerId: Number(customerId),
          pointsEarned: pointsEarned,
        },
      });

      // 4. Update Pelanggan (Tambah Poin) & Buat History
      if (pointsEarned > 0) {
        await tx.customer.update({
          where: { id: Number(customerId) },
          data: {
            points: { increment: pointsEarned },
            lastTransactionAt: new Date(),
          },
        });

        await tx.pointHistory.create({
          data: {
            customerId: Number(customerId),
            pointsChange: pointsEarned,
            reason: `Claim Poin Susulan TRX #${transaction.id}`,
            transactionId: transaction.id,
          },
        });
      }
    });

    res.json({ message: "Pelanggan berhasil ditautkan dan poin ditambahkan." });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || "Gagal update transaksi" });
  }
};
