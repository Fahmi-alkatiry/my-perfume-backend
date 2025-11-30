// backend/src/routes/product.routes.js
import { Router } from 'express';
import {
  getAllProducts,
  createProduct,
  getProductById,
  updateProduct,
  deleteProduct,
  addStock,
  adjustStock,
} from '../controllers/product.controller.js';

// --- 1. IMPOR MIDDLEWARE ---
import { protect, admin } from '../middleware/auth.middleware.js';

const router = Router();

// --- 2. TERAPKAN ATURAN ---
router.route('/products')
  .get(protect, getAllProducts) // Siapapun (Admin/Kasir) bisa LIHAT
  .post(protect, admin, createProduct); // Hanya Admin bisa BUAT

router.route('/products/:id')
  .get(protect, getProductById) // Siapapun bisa LIHAT by ID
  .put(protect, admin, updateProduct) // Hanya Admin bisa UPDATE
  .delete(protect, admin, deleteProduct); // Hanya Admin bisa HAPUS

router.post('/products/:id/add-stock', protect, admin, addStock);

router.post('/products/:id/adjust-stock', protect, admin, adjustStock);

export default router;