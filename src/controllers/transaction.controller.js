// backend/src/controllers/transaction.controller.js
import { prisma } from "../lib/prisma.js";
import { sendWAMessage } from "../services/whatsapp.service.js";
import { sendTransactionReceipt } from "../services/transaction.service.js";
import MidtransClient from "midtrans-client";

const snap = new MidtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

/**
 * @route   POST /api/transactions
 * @desc    Membuat transaksi baru (DENGAN LOGIKA POIN & DISKON)
 */
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

    const finalAmount = (amountAfterVoucher - discountByPoints) > 0 ? (amountAfterVoucher - discountByPoints) : 0;

    // --- 4. PENENTUAN ALUR (CASH VS MIDTRANS) ---
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

      // JIKA CASH (Atau Non-Midtrans): Langsung Eksekusi Stok & Poin
      if (!isMidtrans) {
        for (const item of items) {
          await tx.product.update({ 
            where: { id: item.productId }, 
            data: { stock: { decrement: item.quantity } } 
          });
          await tx.stockHistory.create({
            data: { 
              productId: item.productId, 
              quantity: -item.quantity, 
              type: "OUT", 
              notes: "Penjualan Cash", 
              referenceType: "Transaction", 
              referenceId: transaction.id 
            }
          });
        }
        if (customerId) {
          await tx.customer.update({ 
            where: { id: customerId }, 
            data: { points: finalCustomerPoints, lastTransactionAt: new Date() } 
          });
          await tx.pointHistory.createMany({
            data: [
              { customerId, pointsChange: pointsEarned, reason: "Earned", transactionId: transaction.id },
              ...(pointsUsed > 0 ? [{ customerId, pointsChange: -pointsUsed, reason: "Redeemed", transactionId: transaction.id }] : [])
            ]
          });
        }
        // Kirim Struk via Service
        sendTransactionReceipt(transaction.id);
        return transaction;
      }

      // JIKA MIDTRANS: Buat Snap Token
      // Catatan: Stok & Poin akan diproses via Webhook saat status Settlement/Settled
      const parameter = {
        transaction_details: { 
          order_id: transaction.id.toString(), 
          gross_amount: Math.round(finalAmount) 
        },
        item_details: items.map(item => {
          const p = productMap.get(item.productId);
          return {
            id: p.id.toString(),
            price: Math.round(Number(p.sellingPrice)),
            quantity: item.quantity,
            name: p.name
          };
        }),
      };
      
      const midtransTx = await snap.createTransaction(parameter);
      return { ...transaction, snapToken: midtransTx.token };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Transaction Error:", error);
    res.status(400).json({ error: error.message });
  }
};

/**
 * @desc    Membatalkan transaksi (VOID)
 * @route   POST /api/transactions/:id/cancel
 */
export const cancelTransaction = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id; // Bisa null jika via webhook

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

      // 2. Kembalikan Stok Produk (Hanya jika transaksi tadinya COMPLETED)
      // Jika PENDING, stok biasanya belum dikurangi (tergantung logika bisnis Anda)
      // Namun di My Perfume POS, kita kurangi stok saat COMPLETED (Cash) atau Settlement (Midtrans).
      // Tunggu, jika PENDING di Kasir, kita biasanya belum kurangi stok.
      // TAPI jika ini VOID transaksi yang sudah sukses:
      if (transaction.status === "COMPLETED") {
        for (const item of transaction.details) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });

          await tx.stockHistory.create({
            data: {
              productId: item.productId,
              quantity: item.quantity,
              type: "IN",
              notes: `Pembatalan Transaksi #${transaction.id}`,
              referenceType: "Cancellation",
              referenceId: transaction.id,
              userId: userId || null,
            },
          });
        }

        // 3. Revisi Poin Pelanggan
        if (transaction.customerId) {
          let pointsChange = 0;
          if (transaction.pointsEarned > 0) pointsChange -= transaction.pointsEarned;
          if (transaction.pointsUsed > 0) pointsChange += transaction.pointsUsed;

          if (pointsChange !== 0) {
            await tx.customer.update({
              where: { id: transaction.customerId },
              data: { points: { increment: pointsChange } },
            });
            
            await tx.pointHistory.create({
              data: {
                customerId: transaction.customerId,
                pointsChange: pointsChange,
                reason: `Batalkan TRX #${transaction.id}`,
                transactionId: transaction.id,
              },
            });
          }
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
    res.status(400).json({ error: error.message || "Gagal membatalkan transaksi" });
  }
};

/**
 * @desc    Menambahkan pelanggan ke transaksi yang sudah selesai (Claim Poin)
 * @route   PUT /api/transactions/:id/assign-customer
 */
export const assignCustomerToTransaction = async (req, res) => {
  const { id } = req.params;
  const { customerId } = req.body;

  try {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: Number(id) },
      });

      if (!transaction) throw new Error("Transaksi tidak ditemukan");
      if (transaction.customerId)
        throw new Error("Transaksi ini sudah memiliki pelanggan.");
      if (transaction.status !== "COMPLETED")
        throw new Error("Hanya transaksi sukses yang bisa di-claim.");

      const pointsEarned = Math.floor(Number(transaction.finalAmount) / 30000);

      await tx.transaction.update({
        where: { id: Number(id) },
        data: {
          customerId: Number(customerId),
          pointsEarned: pointsEarned,
        },
      });

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
