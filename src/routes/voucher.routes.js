import { Router } from 'express';
import { 
  checkVoucher, 
  getAllVouchers, 
  createVoucher, 
  updateVoucher, 
  deleteVoucher 
} from '../controllers/voucher.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = Router();

// Untuk Kasir (Cek Kode)
router.post('/vouchers/check', protect, checkVoucher);

// Untuk Admin (CRUD)
router.route('/vouchers')
  .get(protect, admin, getAllVouchers)
  .post(protect, admin, createVoucher);

router.route('/vouchers/:id')
  .put(protect, admin, updateVoucher)
  .delete(protect, admin, deleteVoucher);

export default router;