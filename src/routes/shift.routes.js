import { Router } from 'express';
import { startShift, endShift, getCurrentShift } from '../controllers/shift.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/shifts/start', protect, startShift);
router.post('/shifts/end', protect, endShift);
router.get('/shifts/current', protect, getCurrentShift);

export default router;