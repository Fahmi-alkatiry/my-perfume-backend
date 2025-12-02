import { Router } from 'express';
import { analyzeRFM } from '../controllers/rfm.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = Router();

// Hanya Admin yang bisa memicu analisis
router.post('/rfm/analyze', protect, admin, analyzeRFM);

export default router;