
// backend/src/routes/report.routes.js
import { Router } from 'express';
import { getDashboardCharts, getLowStockProducts, getReportSummary, getShiftHistory, getStockHistory, getTransactionHistory } from '../controllers/report.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js'; // Impor middleware
import { getStockForecast } from '../controllers/forecast.controller.js';

const router = Router();

// Kita lindungi route ini.
// Mungkin Anda ingin hanya ADMIN yang bisa lihat laporan?
// Jika ya, gunakan [protect, admin].
// Jika Kasir juga boleh, cukup 'protect'.
router.get('/reports/summary', protect, admin, getReportSummary);

router.get('/reports/transactions', protect, admin, getTransactionHistory);

router.get('/reports/low-stock', protect, admin, getLowStockProducts);

router.get('/reports/stock-history', protect, admin, getStockHistory);

router.get('/reports/charts', protect, admin, getDashboardCharts);


router.get('/reports/forecast', protect, admin, getStockForecast);

router.get('/reports/shifts', protect, admin, getShiftHistory);

export default router;