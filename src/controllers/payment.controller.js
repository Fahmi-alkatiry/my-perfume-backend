import { snap } from "../services/midtrans.service.js";
import { prisma } from "../lib/prisma.js";
// Import fungsi kirim WA yang sudah kita buat tadi

export const handleMidtransNotification = async (req, res) => {
  try {
    const statusResponse = await snap.transaction.notification(req.body);
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;

    if (transactionStatus === 'settlement' || transactionStatus === 'capture') {
      await prisma.$transaction(async (tx) => {
        const trx = await tx.transaction.findUnique({
          where: { id: Number(orderId) },
          include: { details: true, customer: true }
        });

        if (trx.status === 'COMPLETED') return;

        // 1. Potong Stok & History
        for (const d of trx.details) {
          await tx.product.update({ where: { id: d.productId }, data: { stock: { decrement: d.quantity } } });
        }

        // 2. Update Poin Customer (Gunakan data poin dari database transaksi)
        if (trx.customerId) {
          const customer = await tx.customer.findUnique({ where: { id: trx.customerId } });
          const finalPoints = customer.points + trx.pointsEarned - trx.pointsUsed;
          
          await tx.customer.update({
            where: { id: trx.customerId },
            data: { points: finalPoints, lastTransactionAt: new Date() }
          });

          // 3. Update Status
          await tx.transaction.update({ where: { id: trx.id }, data: { status: 'COMPLETED' } });
          
          // 4. Kirim WA (Panggil fungsi sendReceiptWA di sini)
          // sendReceiptWA(trx.id, finalPoints);
        }
      });
    }
    res.status(200).send('OK');
  } catch (error) {
    res.status(500).send(error.message);
  }
};


export const createPaymentToken = async (req, res) => {
  try {
    const { orderId, grossAmount, customerDetails } = req.body;

    const parameter = {
      transaction_details: {
        order_id: orderId, // Gunakan ID transaksi dari database kamu
        gross_amount: grossAmount,
      },
    //   customer_details: {
    //     first_name: customerDetails.name,
    //     email: customerDetails.email || "customer@mail.com",
    //     phone: customerDetails.phone,
    //   },
      // Kamu bisa tambahkan item_details di sini kalau mau lebih detail
    };

    const transaction = await snap.createTransaction(parameter);
    
    // transactionToken ini yang akan dipake Frontend buat buka Pop-up
    res.status(200).json({ token: transaction.token });
  } catch (error) {
    console.error("Midtrans Error:", error);
    res.status(500).json({ error: "Gagal membuat token pembayaran" });
  }
};