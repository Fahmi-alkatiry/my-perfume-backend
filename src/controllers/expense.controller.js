import { prisma } from '../lib/prisma.js';

// Get All Expenses (dengan Filter Tanggal & Pagination)
export const getExpenses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (startDate && endDate) {
      const start = new Date(startDate); start.setHours(0,0,0,0);
      const end = new Date(endDate); end.setHours(23,59,59,999);
      where.date = { gte: start, lte: end };
    }

    const [expenses, totalCount] = await prisma.$transaction([
      prisma.expense.findMany({
        where, skip, take: limit,
        orderBy: { date: 'desc' },
        include: { user: { select: { name: true } } }
      }),
      prisma.expense.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    res.json({ data: expenses, pagination: { totalCount, totalPages, currentPage: page, limit } });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data pengeluaran' });
  }
};

// Create Expense
export const createExpense = async (req, res) => {
  try {
    const { name, amount, category, date } = req.body;
    const userId = req.user.id;

    const newExpense = await prisma.expense.create({
      data: {
        name,
        amount: Number(amount),
        category,
        date: date ? new Date(date) : new Date(),
        userId
      }
    });
    res.status(201).json(newExpense);
  } catch (error) {
    res.status(500).json({ error: 'Gagal menyimpan pengeluaran' });
  }
};

// Delete Expense
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.expense.delete({ where: { id: Number(id) } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus pengeluaran' });
  }
};