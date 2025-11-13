// backend/src/routes/auth.routes.js
import { Router } from 'express';
import { register, login } from '../controllers/auth.controller.js';

const router = Router();

router.post('/auth/register', register);
router.post('/auth/login', login);

export default router;