// src/controllers/midtrans.controller.js
import { prisma } from '../lib/prisma.js';
import MidtransClient from 'midtrans-client';
import crypto from 'crypto';
import { sendTransactionReceipt } from '../services/transaction.service.js';

const snap = new MidtransClient.Snap({
  isProduction: false, // change to true in production
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

/**
 * @desc Generate Snap token for a transaction
 * @route POST /api/midtrans/token
 */
export const createSnapToken = async (req, res) => {
  const { transactionId } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId required' });
  }
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: Number(transactionId) },
      include: { details: { include: { product: true } } },
    });
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    // Build items for Midtrans
    const items = transaction.details.map((d) => ({
      id: d.productId.toString(),
      price: Number(d.priceAtTransaction),
      quantity: d.quantity,
      name: d.product.name,
    }));
    const parameter = {
      transaction_details: {
        order_id: transaction.id.toString(),
        gross_amount: Number(transaction.finalAmount),
      },
      item_details: items,
    };
    const token = await snap.createTransaction(parameter);
    return res.json({ token });
  } catch (error) {
    console.error('Snap token error:', error);
    return res.status(500).json({ error: 'Failed to create Snap token' });
  }
};

/**
 * @desc Midtrans webhook handler
 * @route POST /api/midtrans/webhook
 */
export const midtransWebhook = async (req, res) => {
  const payload = req.body;

  try {
    // Official notification handler correctly verifies the signature
    const statusResponse = await snap.transaction.notification(payload);
    const { order_id, transaction_status, fraud_status } = statusResponse;

    console.log(`[Midtrans Webhook] Verified notification for Order #${order_id}. Status: ${transaction_status}, Fraud: ${fraud_status}`);

    // Payment Logic
    if (transaction_status === 'capture') {
      if (fraud_status === 'accept') {
        // Success for credit cards
        await updateToCompleted(order_id);
      }
    } else if (transaction_status === 'settlement') {
      // Success for non-credit cards (GOPAY, QRIS, etc)
      await updateToCompleted(order_id);
    } else if (transaction_status === 'cancel' || transaction_status === 'deny' || transaction_status === 'expire') {
      // Failure
      await prisma.transaction.update({
        where: { id: Number(order_id) },
        data: { status: 'CANCELLED' },
      });
      console.log(`[Midtrans] Status updated to CANCELLED for TRX #${order_id}`);
    } else if (transaction_status === 'pending') {
      // Keep as PENDING
      console.log(`[Midtrans] TRX #${order_id} is still PENDING`);
    }

    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('[Midtrans Webhook Error]:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Helper to avoid duplication
async function updateToCompleted(orderId) {
  await prisma.transaction.update({
    where: { id: Number(orderId) },
    data: { status: 'COMPLETED' },
  });
  
  // Send WA receipt
  try {
    await sendTransactionReceipt(orderId);
  } catch (err) {
    console.error('Failed to send receipt:', err);
  }
  
  console.log(`[Midtrans] Status updated to COMPLETED for TRX #${orderId}`);
}
