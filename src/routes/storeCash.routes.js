// backend/src/routes/storeCash.routes.js
import express from "express";
import { getStoreCash, useStoreCash } from "../controllers/storeCash.controller.js";
import { protect, admin } from "../middleware/auth.middleware.js";

const router = express.Router();

// Hanya Admin yang bisa melihat dan menggunakan Kas Toko
router.get("/", protect, admin, getStoreCash);
router.post("/use", protect, admin, useStoreCash);

export default router;
