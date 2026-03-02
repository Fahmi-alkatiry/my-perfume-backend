// src/routes/payment.routes.js
import express from 'express';
import { createPaymentToken, handleMidtransNotification } from '../controllers/payment.controller.js';

const router = express.Router();

// Endpoint untuk frontend minta token
router.post('/token', createPaymentToken);

// Endpoint UNTUK MIDTRANS (Webhook)
// PERINGATAN: Jangan beri middleware auth/login di sini, 
// karena yang akses adalah SERVER Midtrans, bukan user kamu.
router.post('/notification', handleMidtransNotification);

export default router;