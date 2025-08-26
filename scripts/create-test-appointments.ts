import { PrismaClient, AppointmentState } from '@prisma/client';
import { signLinkToken } from '../src/common/token';

const prisma = new PrismaClient();

async function main() {
  // Crear un turno con estado EMAIL_PENDING
  const emailPendingAppointment = await prisma.appointment.create({
    data: {
      plantId: 'test-plant-id',
      vehicleTypeId: 'test-vehicle-type-id',
      vehicleId: 'test-vehicle-id',
      slotId: 'test-slot-id',
      startAt: new Date(),
      endAt: new Date(Date.now() + 3600000), // +1 hora
      state: AppointmentState.EMAIL_PENDING,
      unitPriceCents: 1000,
      currency: 'ARS',
      paymentMode: 'none',
    },
  });

  const emailPendingToken = signLinkToken({
    appointmentId: emailPendingAppointment.id,
  });
  console.log('EMAIL_PENDING Appointment:', emailPendingAppointment);
  console.log('Token:', emailPendingToken);

  // Crear un turno con estado CONFIRMED
  const confirmedAppointment = await prisma.appointment.create({
    data: {
      plantId: 'test-plant-id',
      vehicleTypeId: 'test-vehicle-type-id',
      vehicleId: 'test-vehicle-id',
      slotId: 'test-slot-id',
      startAt: new Date(),
      endAt: new Date(Date.now() + 3600000), // +1 hora
      state: AppointmentState.CONFIRMED,
      unitPriceCents: 1000,
      currency: 'ARS',
      paymentMode: 'none',
    },
  });

  const confirmedToken = signLinkToken({
    appointmentId: confirmedAppointment.id,
  });
  console.log('CONFIRMED Appointment:', confirmedAppointment);
  console.log('Token:', confirmedToken);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
