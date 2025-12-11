import { Router } from 'express';
import { chatWithData } from '../controllers/ai.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = Router();

// Hanya Admin yang boleh ngobrol soal data bisnis
router.post('/ai/chat', protect, admin, chatWithData);



export default router;