// backend/src/middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * @desc Middleware untuk memproteksi route (Memastikan user sudah login)
 */
export const protect = async (req, res, next) => {
  let token;

  // 1. Cek apakah header Authorization ada dan menggunakan format Bearer
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // 2. Ambil token dari header (format: "Bearer <token>")
      token = req.headers.authorization.split(' ')[1];

      // 3. Verifikasi token
      const decoded = jwt.verify(token, JWT_SECRET);

      // 4. Ambil data user dari database (tanpa password)
      // Ini memastikan user masih ada di database
      req.user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
        },
      });

      if (!req.user) {
        return res.status(401).json({ error: 'User tidak ditemukan' });
      }

      // 5. Lanjutkan ke controller selanjutnya
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa' });
    }
  }

  // Jika tidak ada token sama sekali
  if (!token) {
    res.status(401).json({ error: 'Tidak ada token, otorisasi ditolak' });
  }
};

/**
 * @desc Middleware untuk membatasi akses (Hanya untuk Admin)
 * @note Jalankan middleware ini SETELAH 'protect'
 */
export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    // 403 Forbidden = Tahu siapa Anda, tapi Anda dilarang masuk
    res.status(403).json({ error: 'Akses ditolak, khusus Admin' });
  }
};