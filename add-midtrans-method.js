import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const method = await prisma.paymentMethod.upsert({
    where: { id: 3 }, // Assuming 3 is next or just use unique name
    update: {},
    create: {
      id: 3,
      name: "Midtrans",
      description: "Pembayaran online via Midtrans Snap"
    }
  });
  console.log("Payment method added:", JSON.stringify(method, null, 2));
}
main().finally(() => prisma.$disconnect());
