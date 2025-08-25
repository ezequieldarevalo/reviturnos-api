import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhooksService {
  constructor(private prisma: PrismaService) {}

  async handleMP(headers: Record<string, string>, payload: any) {
    // 1) Verificar firma por header (clave por planta)
    // *Stub seguro*: guardamos evento con idempotencia y respondemos 200; el flujo de acreditación lo implementamos luego.
    const eventId = (payload?.id ?? payload?.data?.id ?? '') + '';
    if (!eventId) throw new BadRequestException('Evento inválido');

    // Idempotencia
    const exists = await this.prisma.paymentEvent.findUnique({
      where: { eventId },
    });
    if (exists) return { ok: true, dedup: true };

    await this.prisma.paymentEvent.create({
      data: {
        plantId: payload?.external_reference?.plantId ?? null,
        provider: 'MP',
        eventId,
        payload,
      },
    });

    // TODO:
    // - Validar external_reference { plantId, appointmentId }
    // - si payment approved y turno en PENDING_PAYMENT/AWAITING_CASH => BOOKED + CONFIRMED
    // - si llega tarde (turno EXPIRED) => “pago acreditado sin turno” (gestión manual)
    return { ok: true };
  }
}
