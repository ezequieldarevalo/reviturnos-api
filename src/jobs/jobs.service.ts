import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentState, SlotStatus } from '@prisma/client';
import { SlotGeneratorService } from './slot-generator.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  constructor(
    private prisma: PrismaService,
    private slots: SlotGeneratorService, // <-- inyectamos el generador
  ) {}

  /** 02:00 AR – generar o extender slots dentro del horizonte daysAhead por planta */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async generateSlotsNightly() {
    await this.slots.generateAllPlants();
    this.logger.log('generateSlotsNightly: OK');
  }

  /** Expiraciones (cada 5 min) */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async watcherExpirations() {
    // EMAIL_PENDING > 30' => EXPIRED
    const emailExpired = await this.prisma.appointment.findMany({
      where: {
        state: AppointmentState.EMAIL_PENDING,
        createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
      },
    });
    for (const a of emailExpired) {
      await this.expireAppointment(a.id, 'EMAIL_TIMEOUT');
    }

    // PENDING_PAYMENT > lockMinutes y AWAITING_CASH > cashWindowMinutes (por planta)
    const plants = await this.prisma.plant.findMany();
    for (const plant of plants) {
      const lockMs = plant.lockMinutes * 60 * 1000;
      const mpExpired = await this.prisma.appointment.findMany({
        where: {
          plantId: plant.id,
          state: AppointmentState.PENDING_PAYMENT,
          createdAt: { lt: new Date(Date.now() - lockMs) },
        },
      });
      for (const a of mpExpired) {
        await this.expireAppointment(a.id, 'CHECKOUT_TIMEOUT');
      }

      const cashMs = plant.cashWindowMinutes * 60 * 1000;
      const cashExpired = await this.prisma.appointment.findMany({
        where: {
          plantId: plant.id,
          state: AppointmentState.AWAITING_CASH,
          createdAt: { lt: new Date(Date.now() - cashMs) },
        },
      });
      for (const a of cashExpired) {
        await this.expireAppointment(a.id, 'CASH_TIMEOUT');
      }
    }
  }

  private async expireAppointment(
    appointmentId: string,
    reason: 'CHECKOUT_TIMEOUT' | 'CASH_TIMEOUT' | 'EMAIL_TIMEOUT',
  ) {
    await this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id: appointmentId },
        data: { state: 'EXPIRED' },
      });
      if (appt.slotId) {
        // Con el schema nuevo, Slot ya no guarda appointmentId; solo liberamos el estado
        await tx.slot.update({
          where: { id: appt.slotId },
          data: { status: SlotStatus.FREE },
        });
      }
      await tx.expirationLog.create({ data: { appointmentId, reason } });
      // TODO: enviar email al usuario
    });
  }

  /** Recordatorios día anterior 09:00 (cron min) – *stub* */
  @Cron('0 9 * * *') // 09:00 local del server
  async reminders() {
    // Buscar turnos CONFIRMED con startAt mañana: enviar recordatorio. *Stub de envío de correo*
  }

  /** (Opcional) Llamado manual para generar slots on-demand desde un endpoint admin */
  async generateSlotsNow() {
    await this.slots.generateAllPlants();
    return { ok: true };
  }
}
