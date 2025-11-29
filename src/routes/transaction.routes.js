// backend/src/routes/transaction.routes.js
import { Router } from 'express';
import { cancelTransaction, createTransaction } from '../controllers/transaction.controller.js';
import { admin, protect } from '../middleware/auth.middleware.js'; // <-- 1. IMPOR

const router = Router();


router.post('/transactions', protect, createTransaction);

router.post('/transactions/:id/cancel', protect, admin, cancelTransaction);


export default router;