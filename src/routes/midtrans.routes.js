// src/routes/midtrans.routes.js
import { Router } from 'express';
import { createSnapToken, midtransWebhook } from '../controllers/midtrans.controller.js';
import { protect } from '../middleware/auth.middleware.js'; // ensure token endpoint is protected

const router = Router();

// Generate Snap token – protected (only authenticated staff)
router.post('/midtrans/token', protect, createSnapToken);

// Webhook – public endpoint, Midtrans will POST notifications
router.post('/midtrans/webhook', midtransWebhook);

export default router;
