// src/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";

// Impor router produk kita
import productRoutes from "./routes/product.routes.js";
import transactionRoutes from "./routes/transaction.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import authRoutes from "./routes/auth.routes.js";
import reportRoutes from "./routes/report.routes.js";

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json()); // Penting agar server bisa membaca req.body (JSON)

// Route utama
app.get("/", (req, res) => {
  res.send("My Perfume POS API (ESM Version) is running!");
});

// Gunakan router produk kita
// Semua URL di product.routes.js akan diawali dengan /api
// Contoh: GET /api/products
app.use("/api", authRoutes);
app.use("/api", productRoutes);
app.use("/api", transactionRoutes);
app.use("/api", customerRoutes);
app.use("/api", reportRoutes);
// Jalankan server
app.listen(port, () => {
  console.log(`[Server]: API running at http://localhost:${port}`);
});
