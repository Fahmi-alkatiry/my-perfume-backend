import { Router } from 'express';
import { startShift, endShift, getCurrentShift, updateShift } from '../controllers/shift.controller.js';
import { admin, protect } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/shifts/start', protect, startShift);
router.post('/shifts/end', protect, endShift);
router.get('/shifts/current', protect, getCurrentShift);

router.put('/shifts/:id', protect, admin, updateShift);

export default router;