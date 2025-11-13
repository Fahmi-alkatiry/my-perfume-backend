// backend/src/routes/transaction.routes.js
import { Router } from 'express';
import { createTransaction } from '../controllers/transaction.controller.js';
import { protect } from '../middleware/auth.middleware.js'; // <-- 1. IMPOR

const router = Router();


router.post('/transactions', protect, createTransaction);


export default router;