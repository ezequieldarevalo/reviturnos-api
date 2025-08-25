import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const plant = await prisma.plant.findFirst({
    where: { slug: 'planta-demo' },
  });
  if (!plant) throw new Error('No se encontró planta-demo');

  const line2 = await prisma.line.create({
    data: { plantId: plant.id, name: 'Línea 2', isActive: true },
  });

  await prisma.lineConfig.create({
    data: {
      lineId: line2.id,
      durationMinutes: 30,
      effectiveFrom: new Date(),
      maxShiftMinutes: 10,
    },
  });

  console.log('OK: creada Línea 2 =>', line2.id);
}

main().then(() => prisma.$disconnect());
