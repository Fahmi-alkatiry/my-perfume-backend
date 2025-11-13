// backend/src/routes/paymentMethod.routes.js
import { Router } from 'express';
import {
  getAllPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from '../controllers/paymentMethod.controller.js';

// Impor middleware keamanan
import { protect, admin } from '../middleware/auth.middleware.js';

const router = Router();

// Aturannya:
// SEMUA user yang login (Kasir/Admin) boleh MELIHAT (GET) daftar metode
router.get('/payment-methods', protect, getAllPaymentMethods);

// Hanya ADMIN yang boleh MENGELOLA (Create, Update, Delete)
router.post('/payment-methods', protect, admin, createPaymentMethod);
router.put('/payment-methods/:id', protect, admin, updatePaymentMethod);
router.delete('/payment-methods/:id', protect, admin, deletePaymentMethod);

export default router;