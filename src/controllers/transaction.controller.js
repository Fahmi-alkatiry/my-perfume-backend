// backend/src/controllers/transaction.controller.js
import { prisma } from "../lib/prisma.js";
import { sendWAMessage } from "../services/whatsapp.service.js";

/**
 * @desc    Membuat transaksi baru (DENGAN LOGIKA POIN & DISKON)
 * @route   POST /api/transactions
 */

export const createTransaction = async (req, res) => {
  // 1. Terima voucherId dari body (bisa null jika tidak pakai)
  const { items, userId, paymentMethodId, customerId, usePoints, voucherId } =
    req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "Keranjang tidak boleh kosong" });
  }

  try {
    const newTransaction = await prisma.$transaction(async (tx) => {
      // --- A. LOGIKA STOK (SAMA SEPERTI SEBELUMNYA) ---
      const productIds = items.map((item) => item.productId);
      const productsInCart = await tx.product.findMany({
        where: { id: { in: productIds } },
      });
      const productMap = new Map(productsInCart.map((p) => [p.id, p]));

      let totalAmount = 0; // Total Harga Jual Barang
      let totalCostTransaction = 0; // Total Harga Modal (HPP)
      const transactionDetailsData = [];
      const stockHistoryData = [];
      const stockUpdatePromises = [];

      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Produk ID ${item.productId} hilang.`);
        if (product.stock < item.quantity)
          throw new Error(
            `Stok ${product.name} kurang. Sisa: ${product.stock}`
          );

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

        stockHistoryData.push({
          productId: product.id,
          quantity: -item.quantity,
          type: "OUT",
          notes: "Penjualan",
          referenceType: "Transaction",
          userId: userId || null,
        });

        stockUpdatePromises.push(
          tx.product.update({
            where: { id: product.id },
            data: { stock: { decrement: item.quantity } },
          })
        );
      }

      // --- B. LOGIKA VOUCHER (BARU!) ---
      let discountByVoucher = 0;
      let usedVoucherId = null;

      if (voucherId) {
        // Cari voucher
        const voucher = await tx.voucher.findUnique({
          where: { id: Number(voucherId) },
        });

        // Validasi Ulang (Double Check Security di Server)
        if (!voucher) throw new Error("Voucher tidak ditemukan.");
        if (!voucher.isActive) throw new Error("Voucher tidak aktif.");

        const now = new Date();
        if (now < voucher.startDate || now > voucher.endDate)
          throw new Error("Voucher sudah kedaluwarsa atau belum mulai.");

        if (voucher.usageLimit > 0 && voucher.usedCount >= voucher.usageLimit)
          throw new Error("Kuota voucher sudah habis.");

        if (totalAmount < Number(voucher.minPurchase))
          throw new Error(
            `Minimal belanja kurang (Min: ${Number(voucher.minPurchase)})`
          );

        // Hitung Nominal Diskon Voucher
        if (voucher.type === "FIXED") {
          discountByVoucher = Number(voucher.value);
        } else {
          // Persentase
          discountByVoucher = (totalAmount * Number(voucher.value)) / 100;
          // Cek Cap (Maksimal Diskon)
          if (
            voucher.maxDiscount &&
            discountByVoucher > Number(voucher.maxDiscount)
          ) {
            discountByVoucher = Number(voucher.maxDiscount);
          }
        }

        // Pastikan diskon tidak lebih besar dari total belanja
        if (discountByVoucher > totalAmount) discountByVoucher = totalAmount;

        usedVoucherId = voucher.id;

        // Update Counter Voucher (+1 terpakai)
        await tx.voucher.update({
          where: { id: voucher.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      // --- C. LOGIKA POIN & DISKON POIN ---
      let discountByPoints = 0;
      let pointsUsed = 0;
      let pointsEarned = 0;
      let customerPoints = 0;
      const pointLogsToCreate = [];

      // Harga SEMENTARA setelah kena voucher (sebelum kena poin)
      let amountAfterVoucher = totalAmount - discountByVoucher;
      if (amountAfterVoucher < 0) amountAfterVoucher = 0;

      // Harga Akhir (yang akan dibayar)
      let finalAmount = amountAfterVoucher;

      if (customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: Number(customerId) },
        });
        if (!customer) throw new Error("Pelanggan hilang.");
        customerPoints = customer.points;

        // Gunakan Poin? (Potong lagi setelah voucher)
        if (usePoints) {
          if (customerPoints < 10) throw new Error("Poin kurang dari 10.");

          discountByPoints = 30000; // Rule: 10 Poin = 30rb
          pointsUsed = 10;
          customerPoints -= 10;

          // Kurangi harga akhir
          finalAmount = amountAfterVoucher - discountByPoints;
          if (finalAmount < 0) finalAmount = 0; // Gak boleh minus

          pointLogsToCreate.push({
            customerId: customer.id,
            pointsChange: -10,
            reason: "Redeemed (Discount)",
          });
        }

        // Hitung Poin Baru (Dari Final Amount yang dibayar uang asli)
        const newPoints = Math.floor(finalAmount / 30000);
        if (newPoints > 0) {
          pointsEarned = newPoints;
          customerPoints += newPoints;
          pointLogsToCreate.push({
            customerId: customer.id,
            pointsChange: newPoints,
            reason: "Earned (Transaction)",
          });
        }

        // Update Customer Master Data
        await tx.customer.update({
          where: { id: customer.id },
          data: { points: customerPoints, lastTransactionAt: new Date() },
        });
      }

      // --- D. BUAT TRANSAKSI (SIMPAN KE DB) ---
      const createdTransaction = await tx.transaction.create({
        data: {
          totalPrice: totalAmount, // Harga asli barang
          totalDiscount: 0, // (Reserved untuk diskon item manual)

          // Simpan data diskon
          discountByVoucher: discountByVoucher,
          voucherId: usedVoucherId,
          discountByPoints: discountByPoints,

          finalAmount: finalAmount, // Uang yang harus dibayar kasir

          // Margin = (Total Jual - Total Modal) - Diskon Voucher - Diskon Poin
          totalMargin:
            totalAmount -
            totalCostTransaction -
            discountByVoucher -
            discountByPoints,

          pointsEarned,
          pointsUsed,
          status: "COMPLETED",
          userId: userId || null,
          paymentMethodId: paymentMethodId || null,
          customerId: customerId || null,

          details: {
            create: transactionDetailsData,
          },
        },
      });

      // Link Point History ke Transaksi (Jika ada log poin)
      if (pointLogsToCreate.length > 0) {
        await tx.pointHistory.createMany({
          data: pointLogsToCreate.map((log) => ({
            ...log,
            transactionId: createdTransaction.id,
          })),
        });
      }

      // Jalankan update stok
      await Promise.all(stockUpdatePromises);

      // Simpan history stok
      await tx.stockHistory.createMany({
        data: stockHistoryData.map((h) => ({
          ...h,
          referenceId: createdTransaction.id,
        })),
      });
      

      if (customerId) {
        // Pastikan bukan Guest
        // Ambil data customer (pastikan sudah di-fetch sebelumnya)
        const customerData = await tx.customer.findUnique({
          where: { id: Number(customerId) },
        });

        if (customerData && customerData.phoneNumber) {
          const dateStr = new Date().toLocaleDateString("id-ID");

          // Buat detail item
          const itemsList = items
            .map((item) => {
              const p = productMap.get(item.productId);
              return `${p.name} x${item.quantity} = Rp ${(
                p.sellingPrice * item.quantity
              ).toLocaleString("id-ID")}`;
            })
            .join("\n");

          const message = `*My Perfume - Struk Belanja* 🛍️
Tanggal: ${dateStr}
Pelanggan: ${customerData.name}

*Detail Pesanan:*
${itemsList}

*Total: Rp ${finalAmount.toLocaleString("id-ID")}*

Terima kasih telah berbelanja! Simpan nomor ini untuk info promo.`;

          // Kirim (Fire and Forget - jangan await agar kasir tidak nunggu)
          sendWAMessage(customerData.phoneNumber, message);
        }
      }

      return createdTransaction;
    });

    res.status(201).json(newTransaction);
  } catch (error) {
    console.error("Transaksi Gagal:", error);
    res
      .status(400)
      .json({ error: error.message || "Gagal memproses transaksi" });
  }
};

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
