
// backend/src/routes/report.routes.js
import { Router } from 'express';
import { getReportSummary, getTransactionHistory } from '../controllers/report.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js'; // Impor middleware

const router = Router();

// Kita lindungi route ini.
// Mungkin Anda ingin hanya ADMIN yang bisa lihat laporan?
// Jika ya, gunakan [protect, admin].
// Jika Kasir juga boleh, cukup 'protect'.
router.get('/reports/summary', protect, admin, getReportSummary);

router.get('/reports/transactions', protect, admin, getTransactionHistory);

export default router;