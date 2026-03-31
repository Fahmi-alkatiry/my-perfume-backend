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
            `Stok ${product.name} kurang. Sisa: ${product.stock}`,
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
          }),
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
            `Minimal belanja kurang (Min: ${Number(voucher.minPurchase)})`,
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
      let finalCustomerPoints = 0;
      const pointLogsToCreate = [];

      // Harga SEMENTARA setelah kena voucher (sebelum kena poin)
      let amountForPointCalculation = totalAmount - discountByVoucher;
      if (amountForPointCalculation < 0) amountForPointCalculation = 0;

      // Harga Akhir (yang akan dibayar)
      let finalAmount = amountForPointCalculation;

      if (customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: Number(customerId) },
        });
        if (!customer) throw new Error("Pelanggan hilang.");

        // 1. HITUNG POTENSI POIN DARI BELANJAAN SEKARANG
        // Meskipun belum dibayar, kita "hitung dulu" poin yang akan didapat
        const potentialPointsFromCurrent = Math.floor(
          amountForPointCalculation / 30000,
        );

        // 2. TOTAL POIN VIRTUAL (Poin Lama + Poin Baru)
        const totalVirtualPoints = customer.points + potentialPointsFromCurrent;

        if (usePoints) {
          // Gunakan totalVirtualPoints untuk validasi, bukan hanya customer.points
          if (totalVirtualPoints < 10) {
            throw new Error(
              `Poin tidak cukup. Total poin Anda (termasuk transaksi ini) baru ${totalVirtualPoints}.`,
            );
          }

          discountByPoints = 30000;
          pointsUsed = 10;

          // Potong harga
          finalAmount = amountForPointCalculation - discountByPoints;
          if (finalAmount < 0) finalAmount = 0;

          // 3. UPDATE SALDO AKHIR: (Poin Lama + Poin Baru) - 10
          pointsEarned = potentialPointsFromCurrent;
          finalCustomerPoints = totalVirtualPoints - 10;

          // Log Penggunaan
          pointLogsToCreate.push({
            customerId: customer.id,
            pointsChange: -10,
            reason: "Redeemed (Instant Reward)",
          });
        } else {
          // Jika tidak tukar poin, poin hanya bertambah
          pointsEarned = potentialPointsFromCurrent;
          finalCustomerPoints = totalVirtualPoints;
        }

        // Log Penambahan Poin
        if (pointsEarned > 0) {
          pointLogsToCreate.push({
            customerId: customer.id,
            pointsChange: pointsEarned,
            reason: "Earned (Transaction)",
          });
        }

        // Update Data Pelanggan
        await tx.customer.update({
          where: { id: customer.id },
          data: { points: finalCustomerPoints, lastTransactionAt: new Date() },
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
            (discountByVoucher || 0) -
            (discountByPoints || 0),

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

      // --- E. LOGIKA DANA CADANGAN TOKO (20% DARI MARGIN) ---
      const margin = Number(createdTransaction.totalMargin || 0);
      if (margin > 0 && createdTransaction.status === "COMPLETED") {
        const reserveFund = Math.floor(margin * 0.20);
        
        if (reserveFund > 0) {
          // Cari saldo saat ini
          const currentStoreCash = await tx.storeCash.findFirst();
          
          if (currentStoreCash) {
            await tx.storeCash.update({
              where: { id: currentStoreCash.id },
              data: { balance: { increment: reserveFund } }
            });
          } else {
            await tx.storeCash.create({
              data: { balance: reserveFund }
            });
          }

          // Catat Riwayat
          await tx.storeCashHistory.create({
            data: {
              amount: reserveFund,
              type: "IN",
              description: `Alokasi margin (20%) dari Trx #${createdTransaction.id}`,
              transactionId: createdTransaction.id
            }
          });
        }
      }


      if (customerId) {
        // Pastikan bukan Guest
        // Ambil data customer (pastikan sudah di-fetch sebelumnya)
        const customerData = await tx.customer.findUnique({
          where: { id: Number(customerId) },
        });

        if (customerData && customerData.phoneNumber) {
          const dateStr = new Date().toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });

          const timeStr = new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          });

          // Buat detail item
          const itemsList = items
            .map((item) => {
              const p = productMap.get(item.productId);
              return `${p.name} x${item.quantity} = Rp ${(
                p.sellingPrice * item.quantity
              ).toLocaleString("id-ID")}`;
            })
            .join("\n");

          const totalAllDiscount =
            (discountByVoucher || 0) + (discountByPoints || 0);

          // 2. Susun baris diskon secara kondisional
          const voucherRow =
            discountByVoucher > 0
              ? `🎟️ Voucher       : -Rp ${Number(discountByVoucher).toLocaleString("id-ID")}\n`
              : "";

          const pointDiscountRow =
            discountByPoints > 0
              ? `🎁 Potong Poin   : -Rp ${Number(discountByPoints).toLocaleString("id-ID")}\n`
              : "";

          const message = `🧾 *My Perfume - Struk Belanja*

📍 Jl. Raya Panglegur, Kota Pamekasan
🗓️ ${dateStr} | ⏰ ${timeStr}
👤 Pelanggan: ${customerData.name}

━━━━━━━━━━━━━━━━
   *Detail Pesanan*
━━━━━━━━━━━━━━━━
${itemsList}

━━━━━━━━━━━━━━━━
💰 *Ringkasan*
━━━━━━━━━━━━━━━━
💵 Subtotal      : Rp ${Number(totalAmount).toLocaleString("id-ID")}
${voucherRow}${pointDiscountRow}${totalAllDiscount > 0 ? `━━━━━━━━━━━━━━━━\n` : ""}💳 *Total Bayar   : Rp ${Number(finalAmount).toLocaleString("id-ID")}*

━━━━━━━━━━━━━━━━
✨ *Info Poin*
━━━━━━━━━━━━━━━━
📈 Poin Didapat : +${pointsEarned}
📉 Poin Ditukar : -${pointsUsed}
🏆 *Total Poin   : ${finalCustomerPoints}*

━━━━━━━━━━━━━━━━
🙏 Terima kasih telah berbelanja di My Perfume!
Simpan nomor ini untuk info promo dan katalog terbaru.
IG: @Myperfumeee_
`;

          // Kirim (Fire and Forget - jangan await agar kasir tidak nunggu)
          try {
            // Tetap tanpa await jika ingin cepat, tapi tambahkan .catch
            sendWAMessage(customerData.phoneNumber, message).catch((err) => {
              console.error("Gagal kirim WA (Background):", err.message);
            });
          } catch (e) {
            console.error("Fungsi sendWAMessage bermasalah:", e);
          }
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

      // 4. Tarik Kembali Dana Cadangan Toko (Jika Ada)
      const storeCashHistory = await tx.storeCashHistory.findFirst({
        where: { transactionId: transaction.id, type: "IN" }
      });

      if (storeCashHistory) {
        const currentStoreCash = await tx.storeCash.findFirst();
        if (currentStoreCash) {
          await tx.storeCash.update({
            where: { id: currentStoreCash.id },
            data: { balance: { decrement: storeCashHistory.amount } }
          });

          await tx.storeCashHistory.create({
            data: {
              amount: storeCashHistory.amount,
              type: "OUT",
              description: `Batal Trx #${transaction.id} (Revert Margin)`,
              transactionId: transaction.id
            }
          });
        }
      }

      // 5. Ubah Status Transaksi
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
