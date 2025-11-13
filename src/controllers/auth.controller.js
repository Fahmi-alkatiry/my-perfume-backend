// backend/src/controllers/auth.controller.js
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Pastikan Anda memiliki JWT_SECRET di file .env
// Tambahkan baris ini di file .env Anda:
// JWT_SECRET="SECRET_KEY_ANDA_YANG_SANGAT_RAHASIA"
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET in .env file');
}

/**
 * @desc    Mendaftarkan user baru (Kasir/Admin)
 * @route   POST /api/auth/register
 */
export const register = async (req, res) => {
  try {
    const { name, username, password, role } = req.body;

    // Validasi input
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'Semua field wajib diisi' });
    }

    // 1. Enkripsi password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 2. Simpan user ke database
    const newUser = await prisma.user.create({
      data: {
        name,
        username,
        password: hashedPassword,
        role: role, // Role harus 'ADMIN' atau 'CASHIER' (sesuai Enum)
      },
    });

    // Hapus password dari objek respons
    delete newUser.password;

    res.status(201).json({ message: 'User berhasil didaftarkan', user: newUser });
  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') { // Error unik (username sudah ada)
      return res.status(400).json({ error: 'Username sudah digunakan' });
    }
    res.status(500).json({ error: 'Gagal mendaftarkan user' });
  }
};

/**
 * @desc    Login user (Kasir/Admin)
 * @route   POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Cari user berdasarkan username
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return res.status(404).json({ error: 'Username tidak ditemukan' });
    }

    // 2. Bandingkan password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Password salah' }); // 401 = Unauthorized
    }

    // 3. Buat JSON Web Token (JWT)
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: '1d', // Token berlaku selama 1 hari
    });

    // Kirim token sebagai respons
    res.json({
      message: 'Login berhasil',
      token: token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal login' });
  }
};

/**
 * @desc    Mendapatkan data user yang sedang login
 * @route   GET /api/auth/me
 */
export const getMe = async (req, res) => {
  // Kita mendapatkan 'req.user' dari middleware 'protect'
  // yang sudah kita buat sebelumnya
  if (req.user) {
    res.json(req.user);
  } else {
    res.status(404).json({ error: 'User tidak ditemukan' });
  }
};