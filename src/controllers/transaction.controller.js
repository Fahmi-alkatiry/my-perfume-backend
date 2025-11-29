// backend/src/controllers/transaction.controller.js
import { prisma } from '../lib/prisma.js';

/**
 * @desc    Membuat transaksi baru (DENGAN LOGIKA POIN & DISKON)
 * @route   POST /api/transactions
 */
export const createTransaction = async (req, res) => {
  // Frontend sekarang mengirim data tambahan:
  // {
  //   items: [ { productId: 1, quantity: 2 }, ... ],
  //   userId: 1,
  //   paymentMethodId: 1,
  //   customerId: 5,       // <-- BARU (Opsional)
  //   usePoints: true      // <-- BARU (Opsional, default false)
  // }
  const { items, userId, paymentMethodId, customerId, usePoints } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Keranjang tidak boleh kosong' });
  }

  try {
    const newTransaction = await prisma.$transaction(async (tx) => {
      // 1. --- LOGIKA STOK (SAMA SEPERTI SEBELUMNYA) ---
      const productIds = items.map((item) => item.productId);
      const productsInCart = await tx.product.findMany({
        where: { id: { in: productIds } },
      });

      const productMap = new Map(productsInCart.map((p) => [p.id, p]));

      let totalAmount = 0; // Subtotal (Total harga barang)
      let totalMargin = 0;
      const transactionDetailsData = [];
      const stockHistoryData = [];
      const stockUpdatePromises = [];

      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Produk dengan ID ${item.productId} tidak ditemukan.`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Stok tidak cukup untuk ${product.name}. Sisa: ${product.stock}`);
        }

        const priceAtSale = product.sellingPrice;
        const costAtSale = product.purchasePrice;
        const subtotal = Number(priceAtSale) * item.quantity;
        const totalCost = Number(costAtSale) * item.quantity;
        const margin = subtotal - totalCost;

        totalAmount += subtotal;
        totalMargin += margin;

        transactionDetailsData.push({
          productId: product.id,
          quantity: item.quantity,
          priceAtTransaction: priceAtSale,
          purchasePriceAtTransaction: costAtSale,
          subtotal: subtotal,
          totalCostOfGoods: totalCost,
          totalMargin: margin,
        });

        stockHistoryData.push({
          productId: product.id,
          quantity: -item.quantity,
          type: 'OUT',
          notes: 'Penjualan',
          referenceType: 'Transaction',
          userId: userId || null,
        });

        stockUpdatePromises.push(
          tx.product.update({
            where: { id: product.id },
            data: { stock: { decrement: item.quantity } },
          })
        );
      } // Selesai loop item

      // 2. --- LOGIKA POIN & DISKON (BARU) ---
      let discountByPoints = 0;
      let pointsUsed = 0;
      let pointsEarned = 0;
      let finalAmount = totalAmount; // Total akhir = Subtotal (untuk saat ini)
      let customerPoints = 0;
      const pointLogsToCreate = [];

      if (customerId) {
        // Ambil data pelanggan (HARUS di dalam 'tx' agar transaksional)
        const customer = await tx.customer.findUnique({
          where: { id: Number(customerId) },
        });

        if (!customer) {
          throw new Error('Pelanggan tidak ditemukan.');
        }
        customerPoints = customer.points;

        // Logika #1: Gunakan Poin (Tukar Diskon)
        if (usePoints) {
          if (customerPoints < 10) {
            throw new Error('Poin pelanggan tidak cukup untuk diskon (Kurang dari 10).');
          }
          // Terapkan diskon
          discountByPoints = 30000;
          pointsUsed = 10;
          customerPoints -= 10; // Kurangi poin
          finalAmount = totalAmount - discountByPoints; // Hitung ulang total akhir

          // Catat di log untuk PointHistory
          pointLogsToCreate.push({
            customerId: customer.id,
            pointsChange: -10, // Poin berkurang
            reason: 'Redeemed',
          });
        }

        // Logika #2: Dapatkan Poin
        // Poin dihitung dari TOTAL AKHIR yang dibayar (setelah diskon)
        const newPoints = Math.floor(finalAmount / 30000);
        if (newPoints > 0) {
          pointsEarned = newPoints;
          customerPoints += newPoints; // Tambah poin

          // Catat di log untuk PointHistory
          pointLogsToCreate.push({
            customerId: customer.id,
            pointsChange: pointsEarned, // Poin bertambah
            reason: 'Earned',
          });
        }
      } // Selesai logika jika ada customerId

      // 3. --- BUAT TRANSAKSI UTAMA (UPGRADED) ---
      const createdTransaction = await tx.transaction.create({
        data: {
          totalPrice: totalAmount, // Total asli sebelum diskon
          totalDiscount: 0, // (Diskon umum, kita belum pakai)
          discountByPoints: discountByPoints, // Diskon dari poin
          finalAmount: finalAmount, // Total yang dibayar
          totalMargin: totalMargin, // (Margin belum dikurangi diskon)
          
          pointsEarned: pointsEarned,
          pointsUsed: pointsUsed,

          status: 'COMPLETED',
          userId: userId || null,
          paymentMethodId: paymentMethodId || null,
          customerId: customerId || null,
    
          // Buat TransactionDetail secara inline (Cascade)
          details: {
            create: transactionDetailsData,
          },
        },
      });

      // 4. --- UPDATE STOK & BUAT HISTORY (DI LUAR CREATE) ---
      
      // Update Stok (sudah disiapkan di atas)
      await Promise.all(stockUpdatePromises);
      
      // Buat StockHistory (hubungkan dgn ID transaksi)
      await tx.stockHistory.createMany({
        data: stockHistoryData.map((h) => ({
          ...h,
          referenceId: createdTransaction.id,
        })),
      });

      // 5. --- UPDATE PELANGGAN & POIN HISTORY (BARU) ---
      if (customerId) {
        // Update total poin pelanggan
        await tx.customer.update({
          where: { id: Number(customerId) },
          data: {
            points: customerPoints, // Poin baru yang sudah dihitung
            lastTransactionAt: new Date(),
          },
        });

        // Buat PointHistory (hubungkan dgn ID transaksi)
        if (pointLogsToCreate.length > 0) {
          await tx.pointHistory.createMany({
            data: pointLogsToCreate.map((log) => ({
              ...log,
              transactionId: createdTransaction.id,
            })),
          });
        }
      }
      
      return createdTransaction;
    });

    // Jika $transaction berhasil
    res.status(201).json(newTransaction);

  } catch (error) {
    console.error("Gagal membuat transaksi:", error);
    // Kirim pesan error spesifik ke frontend
    if (
      error.message.startsWith("Stok tidak cukup") ||
      error.message.startsWith("Produk dengan ID") ||
      error.message.startsWith("Pelanggan tidak ditemukan") ||
      error.message.startsWith("Poin pelanggan tidak cukup")
    ) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Terjadi kesalahan internal" });
    }
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
        include: { details: true, customer: true }
      });

      if (!transaction) throw new Error("Transaksi tidak ditemukan");
      if (transaction.status === 'CANCELLED') throw new Error("Transaksi sudah dibatalkan sebelumnya");

      // 2. Kembalikan Stok Produk
      for (const item of transaction.details) {
        // Tambah stok kembali
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } }
        });

        // Catat di history stok (IN karena pembatalan)
        await tx.stockHistory.create({
          data: {
            productId: item.productId,
            quantity: item.quantity,
            type: 'IN',
            notes: `Pembatalan Transaksi #${transaction.id}`,
            referenceType: 'Cancellation',
            referenceId: transaction.id,
            userId: userId
          }
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
                    transactionId: transaction.id
                }
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
                    transactionId: transaction.id
                }
            });
        }

        // Update total poin di master customer
        if (pointsChange !== 0) {
            await tx.customer.update({
                where: { id: transaction.customerId },
                data: { points: { increment: pointsChange } }
            });
        }
      }

      // 4. Ubah Status Transaksi
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: 'CANCELLED' }
      });
    });

    res.json({ message: "Transaksi berhasil dibatalkan" });

  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || "Gagal membatalkan transaksi" });
  }
};