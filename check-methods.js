import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const methods = await prisma.paymentMethod.findMany();
  console.log(JSON.stringify(methods, null, 2));
}
main().finally(() => prisma.$disconnect());
