// backend/src/routes/expense.routes.js
import { Router } from 'express';
import {
  getExpenses,
  createExpense,
  deleteExpense,
} from '../controllers/expense.controller.js';

// Impor middleware keamanan
import { protect, admin } from '../middleware/auth.middleware.js';

const router = Router();

// --- Rute Utama Pengeluaran ---
// Hanya ADMIN yang boleh melihat dan menambah pengeluaran
router.route('/expenses')
  .get(protect, admin, getExpenses)    // GET: Lihat daftar pengeluaran
  .post(protect, admin, createExpense); // POST: Catat pengeluaran baru

// --- Rute Detail Pengeluaran ---
router.route('/expenses/:id')
  .delete(protect, admin, deleteExpense); // DELETE: Hapus pengeluaran

export default router;