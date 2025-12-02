// backend/src/routes/broadcast.routes.js
import { Router } from 'express';
import { sendPromo } from '../controllers/broadcast.controller.js';

// --- 1. IMPOR MIDDLEWARE ---
import { protect, admin } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/broadcast/promo', protect, admin, sendPromo);


export default router;