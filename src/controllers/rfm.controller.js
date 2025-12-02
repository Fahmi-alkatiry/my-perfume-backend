import { prisma } from '../lib/prisma.js';

/**
 * @desc    Menjalankan Analisis RFM dan mengupdate data pelanggan
 * @route   POST /api/rfm/analyze
 */
export const analyzeRFM = async (req, res) => {
  try {
    // 1. Ambil Data Agregasi per Pelanggan
    // Kita butuh: Kapan terakhir beli? Berapa kali? Berapa totalnya?
    const customersData = await prisma.customer.findMany({
      where: { transactions: { some: {} } }, // Hanya yg pernah transaksi
      include: {
        transactions: {
          where: { status: 'COMPLETED' },
          select: { createdAt: true, finalAmount: true }
        }
      }
    });

    if (customersData.length === 0) {
      return res.status(400).json({ error: "Belum ada data transaksi untuk dianalisis." });
    }

    const today = new Date();
    
    // 2. Hitung Nilai Mentah (Raw Values)
    let rfmData = customersData.map(customer => {
      // Recency: Hari sejak transaksi terakhir (Makin kecil makin bagus)
      const lastTx = new Date(Math.max(...customer.transactions.map(t => new Date(t.createdAt))));
      const recencyDays = Math.floor((today - lastTx) / (1000 * 60 * 60 * 24));
      
      // Frequency: Jumlah transaksi (Makin besar makin bagus)
      const frequency = customer.transactions.length;

      // Monetary: Total uang (Makin besar makin bagus)
      const monetary = customer.transactions.reduce((sum, t) => sum + Number(t.finalAmount), 0);

      return { id: customer.id, recencyDays, frequency, monetary };
    });

    // 3. Fungsi Helper untuk Scoring (Quintile 1-5)
    // Membagi data menjadi 5 kelompok (20% teratas dapat nilai 5, dst)
    const scoreMetric = (data, key, isAscending = true) => {
      // Urutkan data
      const sorted = [...data].sort((a, b) => isAscending ? a[key] - b[key] : b[key] - a[key]);
      
      return data.map(item => {
        // Cari posisi item ini di array yang sudah diurutkan
        const rank = sorted.findIndex(x => x.id === item.id);
        const percentile = (rank + 1) / sorted.length;

        // Beri skor 1-5
        let score = 1;
        if (percentile > 0.8) score = 5;
        else if (percentile > 0.6) score = 4;
        else if (percentile > 0.4) score = 3;
        else if (percentile > 0.2) score = 2;
        
        // Tambahkan properti score baru ke item (misal: recencyScore)
        return { ...item, [`${key}Score`]: score };
      });
    };

    // 4. Terapkan Scoring
    // Recency: Ascending (Hari makin dikit = Skor makin TINGGI/Baik ? OOPS, Quintile logika basic: 
    // Top 20% nilai TERBESAR dpt skor 5. 
    // Recency days kecil = BAGUS. Jadi kita urutkan DESCENDING (Hari banyak di atas), 
    // supaya Hari Sedikit ada di Bawah (percentile > 0.8) -> Skor 5.
    // ATAU LEBIH MUDAH: Recency kita urutkan Descending (Hari besar ke kecil).
    // 100 hari, 50 hari, 2 hari. 
    // 2 hari ada di index akhir (percentile 1.0) -> Skor 5. Benar.
    rfmData = scoreMetric(rfmData, 'recencyDays', false); // False = Descending

    // Frequency: Ascending (Beli banyak = Skor 5)
    rfmData = scoreMetric(rfmData, 'frequency', true);

    // Monetary: Ascending (Uang banyak = Skor 5)
    rfmData = scoreMetric(rfmData, 'monetary', true);

    // 5. Tentukan Segmen (Logic Sederhana Rata-rata RFM)
    const updates = rfmData.map(item => {
      // Gabungkan skor R dan F (M seringkali berkorelasi dengan F)
      const averageScore = (item.recencyDaysScore + item.frequencyScore + item.monetaryScore) / 3;
      
      let segment = "Lost";
      if (averageScore >= 4.5) segment = "Champions";      // Pelanggan Emas
      else if (averageScore >= 3.5) segment = "Loyal";     // Setia
      else if (averageScore >= 2.5) segment = "Potential"; // Potensial
      else if (averageScore >= 1.5) segment = "At Risk";   // Berisiko pergi
      else segment = "Lost";                               // Sudah pergi/Jarang sekali
      
      // Siapkan Promise update database
      return prisma.customer.update({
        where: { id: item.id },
        data: {
          recencyScore: item.recencyDaysScore,
          frequencyScore: item.frequencyScore,
          monetaryScore: item.monetaryScore,
          rfmSegment: segment,
          lastAnalysisDate: new Date()
        }
      });
    });

    // 6. Eksekusi Update Massal
    await prisma.$transaction(updates);

    res.json({ 
      message: "Analisis RFM Selesai", 
      processed: updates.length 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal melakukan analisis RFM' });
  }
};