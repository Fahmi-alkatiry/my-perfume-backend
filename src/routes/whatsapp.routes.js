// backend/src/routes/whatsapp.routes.js
import { Router } from "express";
import {
  getStatus,
  restart,
  logout,
  testSend,
} from "../controllers/whatsapp.controller.js";
import { protect, admin } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/whatsapp/status", protect, getStatus);
router.post("/whatsapp/restart", protect, admin, restart);
router.post("/whatsapp/logout", protect, admin, logout);
router.post("/whatsapp/test-send", protect, admin, testSend);

export default router;
