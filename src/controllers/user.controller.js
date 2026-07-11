// backend/src/controllers/user.controller.js
import { prisma } from "../lib/prisma.js";
import bcrypt from "bcryptjs";

/**
 * @desc    Mendapatkan semua user
 * @route   GET /api/users
 * @access  Private/Admin
 */
export const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
      },
      orderBy: {
        id: "asc",
      },
    });
    res.json(users);
  } catch (error) {
    console.error("Gagal memuat user:", error);
    res.status(500).json({ error: "Gagal memuat daftar user" });
  }
};

/**
 * @desc    Membuat user baru
 * @route   POST /api/users
 * @access  Private/Admin
 */
export const createUser = async (req, res) => {
  try {
    const { name, username, password, role } = req.body;

    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: "Semua field wajib diisi" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        name,
        username,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
      },
    });

    res.status(201).json(newUser);
  } catch (error) {
    console.error("Gagal membuat user:", error);
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Username sudah digunakan" });
    }
    res.status(500).json({ error: "Gagal membuat user baru" });
  }
};

/**
 * @desc    Mengupdate user (nama, username, role, password opsional)
 * @route   PUT /api/users/:id
 * @access  Private/Admin
 */
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, username, password, role } = req.body;

    if (!name || !username || !role) {
      return res.status(400).json({ error: "Nama, username, dan role wajib diisi" });
    }

    const updateData = {
      name,
      username,
      role,
    };

    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await prisma.user.update({
      where: { id: Number(id) },
      data: updateData,
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Gagal update user:", error);
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Username sudah digunakan" });
    }
    res.status(500).json({ error: "Gagal mengupdate user" });
  }
};

/**
 * @desc    Menghapus user
 * @route   DELETE /api/users/:id
 * @access  Private/Admin
 */
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === Number(id)) {
      return res.status(400).json({ error: "Anda tidak bisa menghapus akun Anda sendiri" });
    }

    await prisma.user.delete({
      where: { id: Number(id) },
    });

    res.json({ message: "User berhasil dihapus" });
  } catch (error) {
    console.error("Gagal menghapus user:", error);
    res.status(500).json({ error: "Gagal menghapus user. User mungkin memiliki data transaksi terkait." });
  }
};
