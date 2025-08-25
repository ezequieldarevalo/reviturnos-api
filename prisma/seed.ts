import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Crear planta demo
  const plant = await prisma.plant.upsert({
    where: { slug: 'planta-demo' },
    update: {},
    create: {
      slug: 'planta-demo',
      name: 'Planta Demo',
      contactEmail: 'demo@reviturnos.com',
      daysAhead: 30,
      lockMinutes: 30,
      cashWindowMinutes: 4320,
      cancelReprogLimitHours: 24,
      reschedulesLimit: 2,
      minYearAllowed: 1970,
      enableNoPay: true,
      enableMercadoPago: true,
    },
  });

  // Crear línea
  const line = await prisma.line.create({
    data: {
      plantId: plant.id,
      name: 'Línea 1',
      isActive: true,
    },
  });

  // Configuración de la línea (duración 30 min desde hoy)
  await prisma.lineConfig.create({
    data: {
      lineId: line.id,
      durationMinutes: 30,
      effectiveFrom: new Date(),
      maxShiftMinutes: 10,
    },
  });

  // Tipo de vehículo
  const vehicleType = await prisma.vehicleType.upsert({
    where: { name: 'Auto' },
    update: {},
    create: {
      name: 'Auto',
      active: true,
    },
  });

  // Vincular planta + tipo de vehículo
  const plantVehicleType = await prisma.plantVehicleType.upsert({
    where: {
      plantId_vehicleTypeId: {
        plantId: plant.id,
        vehicleTypeId: vehicleType.id,
      },
    },
    update: {},
    create: {
      plantId: plant.id,
      vehicleTypeId: vehicleType.id,
    },
  });

  // Regla de precio vigente desde hoy sin vencimiento
  await prisma.priceRule.create({
    data: {
      plantVehicleTypeId: plantVehicleType.id,
      validFrom: new Date(),
      amountCents: 10000, // 100 ARS
      currency: 'ARS',
    },
  });

  // Horario semanal: Lunes a Viernes de 09:00 a 17:00
  for (let d = 1; d <= 5; d++) {
    await prisma.weeklySchedule.create({
      data: {
        plantId: plant.id,
        dayOfWeek: d,
        start: '09:00',
        end: '17:00',
      },
    });
  }

  console.log('🌱 Seed ejecutado con éxito');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect();
  });
