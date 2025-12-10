// backend/src/routes/customer.routes.js
import { Router } from 'express';
import {
  getAllCustomers,
  createCustomer,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory,
  getCustomerPointHistory,
} from '../controllers/customer.controller.js';

// --- 1. IMPOR MIDDLEWARE ---
import { protect, admin } from '../middleware/auth.middleware.js';

const router = Router();


// --- 2. TERAPKAN ATURAN ---
router.route('/customers')
  .get(protect, getAllCustomers) // Siapapun bisa LIHAT
  .post(protect, createCustomer); // Siapapun (Kasir) bisa BUAT pelanggan baru

router.route('/customers/:id')
  .get(protect, getCustomerById) // Siapapun bisa LIHAT by ID
  .put(protect, updateCustomer) // Siapapun (Kasir) bisa UPDATE (misal poin)
  .delete(protect, admin, deleteCustomer); // Hanya Admin bisa HAPUS

  router.get('/customers/:id/history', protect, getCustomerHistory);

  router.get('/customers/:id/points', protect, getCustomerPointHistory);

export default router;