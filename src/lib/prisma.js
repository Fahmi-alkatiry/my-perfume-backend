// src/lib/prisma.js
import { PrismaClient } from '@prisma/client';

// Membuat satu instance client untuk digunakan di seluruh aplikasi
export const prisma = new PrismaClient();