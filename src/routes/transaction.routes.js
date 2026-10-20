// backend/src/routes/transaction.routes.js
import { Router } from 'express';
import {
  assignCustomerToTransaction,
  cancelTransaction,
  createTransaction,
  getTodayTransactions,
} from '../controllers/transaction.controller.js';
import { admin, protect } from '../middleware/auth.middleware.js';

const router = Router();

// Route transaksi hari ini khusus Kasir (dan Admin) - tanpa profit
router.get('/transactions/today', protect, getTodayTransactions);

router.post('/transactions', protect, createTransaction);
router.post('/transactions/:id/cancel', protect, admin, cancelTransaction);
router.put('/transactions/:id/assign-customer', protect, admin, assignCustomerToTransaction);

export default router;
