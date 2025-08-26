import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import crypto from 'crypto';
import { AppointmentState, SlotStatus } from '@prisma/client';
import { EmailService } from '../email/email.service';

/**
 * Convención: secreto por planta desde env:
 * MP_WEBHOOK_SECRET_<PLANT_SLUG_UPPER>=<secreto>
 */
function getPlantSecret(slug: string) {
  const key = `MP_WEBHOOK_SECRET_${slug.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
  return process.env[key] || process.env.MP_WEBHOOK_SECRET || ''; // fallback global opcional
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  constructor(private prisma: PrismaService, private emailService: EmailService) {}

  async handleMercadoPago(input: {
    headers: Record<string, string>;
    rawBody: Buffer;
    payload: any;
  }) {
    const { headers, rawBody, payload } = input;

    // Idempotencia base por header x-request-id o por el propio id del evento
    const eventId =
      headers['x-request-id'] ||
      payload?.id ||
      payload?.data?.id ||
      crypto.randomUUID();

    // Registrar y cortar si ya lo procesamos
    const exists = await this.prisma.paymentEvent.findUnique({
      where: { eventId },
    });
    if (exists) {
      this.logger.log(`MP webhook idempotente: ${eventId}`);
      return;
    }

    // Persistir crudo (si falla, lanzará; si pasa, seguimos)
    await this.prisma.paymentEvent.create({
      data: {
        plantId: '', // lo rellenamos luego si podemos inferirlo (update)
        provider: 'MP',
        eventId,
        payload: payload ?? {},
      },
    });

    // Payloads posibles:
    // A) "Directo" (recomendado para dev): trae external_reference y status.
    // B) Minimal: { type: 'payment', data: { id } } => requiere fetch a API MP (pendiente).
    const extRef = payload?.external_reference;
    const status = (
      payload?.status ||
      payload?.data?.status ||
      ''
    ).toLowerCase();

    if (!extRef) {
      // Sin external_reference no podemos vincular; queda registrado el evento.
      this.logger.warn(`MP webhook sin external_reference. eventId=${eventId}`);
      return;
    }

    // Por diseño: external_reference = JSON.stringify({ plantId, appointmentId })
    let ref: { plantId?: string; appointmentId?: string } = {};
    try {
      ref = typeof extRef === 'string' ? JSON.parse(extRef) : extRef;
    } catch {
      /* noop */
    }

    if (!ref.plantId || !ref.appointmentId) {
      this.logger.warn(`external_reference inválido: ${extRef}`);
      return;
    }

    // Resolvemos plant + secreto y verificamos firma
    // Firma: por simplicidad usamos HMAC del cuerpo con secreto por planta y lo comparamos contra 'x-signature'
    const plant = await this.prisma.plant.findUnique({
      where: { id: ref.plantId },
    });
    if (!plant) {
      this.logger.warn(`Plant no encontrada para ${ref.plantId}`);
      return;
    }

    const secret = getPlantSecret(plant.slug);
    if (secret) {
      const provided = headers['x-signature'] || '';
      const calc = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
      // Permitimos hex o base64 según config de MP; acá probamos ambas
      const calcB64 = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64');
      const okSig = provided === calc || provided === calcB64;
      if (!okSig) {
        this.logger.warn(
          `Firma inválida para plant=${plant.slug}. provided=${provided?.slice(0, 12)}...`,
        );
        return;
      }
    } else {
      // En dev, si no hay secreto configurado, dejamos pasar pero logueamos.
      this.logger.warn(
        `Sin secreto configurado para plant=${plant.slug}. Saltando verificación de firma (DEV).`,
      );
    }

    // Actualizar el PaymentEvent con plantId
    await this.prisma.paymentEvent.update({
      where: { eventId },
      data: { plantId: plant.id },
    });

    // Buscar appointment
    const appt = await this.prisma.appointment.findUnique({
      where: { id: ref.appointmentId },
      include: {
        slot: true,
        plant: true,
        data: { select: { email: true } }, // Corregido para incluir el email desde appointmentData
      },
    });

    if (!appt) {
      this.logger.warn(
        `Appointment ${ref.appointmentId} no encontrado (pago recibido).`,
      );
      return;
    }

    // Estados esperados para MP
    // approved  -> confirmar turno
    // in_process/pending -> mantener PENDING_PAYMENT / AWAITING_CASH
    // rejected/cancelled -> no tocar (o liberar si así lo definen más adelante)
    const approved = status === 'approved';

    // Caso pago tardío: appointment expirado
    if (approved && appt.state === AppointmentState.EXPIRED) {
      await this.prisma.auditLog.create({
        data: {
          plantId: appt.plantId,
          action: 'MP_LATE_PAYMENT',
          entity: 'Appointment',
          entityId: appt.id,
          reason: 'Pago acreditado sin turno',
          to: payload ?? {},
        },
      });
      this.logger.warn(
        `Pago tardío con turno expirado. appointmentId=${appt.id}`,
      );
      return;
    }

    // Transición a CONFIRMED si aplica
    if (
      approved &&
      (appt.state === AppointmentState.PENDING_PAYMENT ||
        appt.state === AppointmentState.AWAITING_CASH)
    ) {
      await this.prisma.$transaction(async (tx) => {
        // BOOKED el slot si aún está LOCKED
        if (appt.slotId) {
          await tx.slot.updateMany({
            where: { id: appt.slotId, status: SlotStatus.LOCKED },
            data: { status: SlotStatus.BOOKED },
          });
        }
        await tx.appointment.update({
          where: { id: appt.id },
          data: {
            state: AppointmentState.CONFIRMED,
            paymentExternalId: String(payload.id ?? payload?.data?.id ?? ''),
            capturedAt: new Date(),
          },
        });

        // Enviar correo de confirmación
        if (!appt.data?.email) {
          this.logger.warn(
            `El email no está disponible para el turno ${appt.id}`,
          );
          return;
        }
        await this.emailService.sendMail(
          appt.data.email,
          'Confirmación de turno',
          `<h1>¡Tu turno ha sido confirmado!</h1><p>Gracias por tu pago. Tu turno está confirmado.</p>`,
        );
      });
      this.logger.log(`Appointment confirmado por MP. id=${appt.id}`);
      return;
    }

    // Otros estados: solo registramos
    this.logger.log(
      `MP webhook registrado. appointment=${appt.id} status=${status || 'unknown'}`,
    );
  }
}
