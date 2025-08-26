import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';
import {
  endOfLocalMonth,
  fromLocalDate,
  nowLocal,
  startOfLocalMonth,
  toUTC,
} from '../common/dates';
import { normalizeDominio } from '../common/normalize';
import {
  AvailableDaysQueryDto,
  AvailabilityQueryDto,
  CreateAppointmentBodyDto,
} from './dto/public.dto';
import { AppointmentState, SlotStatus } from '@prisma/client';
import { verifyLinkToken } from 'src/common/token';
import { EmailService } from '../email/email.service';

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService, private emailService: EmailService) {}

  /**
   * Días del mes con >=1 slot FREE y precio vigente para el tipo de vehículo.
   */
  async getAvailableDays(q: AvailableDaysQueryDto) {
    const plant = await this.prisma.plant.findUnique({
      where: { slug: q.plantSlug },
    });
    if (!plant) throw new BadRequestException('Planta inválida');

    // Rango de mes (local -> UTC)
    const startL = startOfLocalMonth(q.month);
    const endL = endOfLocalMonth(q.month);
    const start = toUTC(startL).toJSDate();
    const end = toUTC(endL).toJSDate();

    // Validación: no publicar hoy ni días atrás; horizonte daysAhead
    const tomorrowLocal = nowLocal().plus({ days: 1 }).startOf('day');
    const horizonLocal = nowLocal()
      .plus({ days: plant.daysAhead })
      .endOf('day');

    // Consulta: agrupamos por fecha (día local) con al menos 1 FREE + price vigente
    const rows = await this.prisma.$queryRaw<Array<{ day_utc: Date }>>`
  SELECT DATE_TRUNC('day', "Slot"."startAt") AS day_utc
  FROM "Slot"
  WHERE "Slot"."plantId" = ${plant.id}
    AND "Slot"."status" = 'FREE'::"SlotStatus"
    AND "Slot"."startAt" >= ${start}
    AND "Slot"."startAt" <= ${end}
  GROUP BY day_utc
  ORDER BY day_utc ASC
`;

    // Filtramos por precio vigente para vehicleTypeId en ese día y reglas de publicación (>= mañana, <= horizonte)
    const pv = await this.prisma.plantVehicleType.findUnique({
      where: {
        plantId_vehicleTypeId: {
          plantId: plant.id,
          vehicleTypeId: q.vehicleTypeId,
        },
      },
      include: { priceRules: true },
    });
    if (!pv) return { days: [] as string[] };

    const validDays = rows
      .map((r) => DateTime.fromJSDate(r.day_utc).setZone('UTC')) // día UTC
      .map((dUTC) =>
        dUTC.setZone(process.env.APP_TZ || 'America/Argentina/Buenos_Aires'),
      ) // a local
      .map((dL) => dL.toFormat('yyyy-LL-dd'))
      .filter((dstr) => {
        const d = DateTime.fromISO(dstr, { zone: process.env.APP_TZ });
        if (d < tomorrowLocal || d > horizonLocal) return false;
        // Hay al menos una regla de precio que cubra el intervalo del día
        const anyPrice = pv.priceRules.some((pr) => {
          const vf = DateTime.fromJSDate(pr.validFrom);
          const vt = pr.validTo
            ? DateTime.fromJSDate(pr.validTo)
            : DateTime.fromISO('9999-12-31');
          // Cubre el día completo (o parte suficiente). Simplificamos: si la ventana [vf,vt] toca el día.
          return vf <= d.endOf('day').toUTC() && vt >= d.startOf('day').toUTC();
        });
        return anyPrice;
      });

    return { days: Array.from(new Set(validDays)) };
  }

  /**
   * Horarios (agregados) disponibles para un día específico local.
   * Devuelve una lista de "HH:mm" visibles mientras exista capacidad (>=1 línea libre).
   */
  async getAvailability(q: AvailabilityQueryDto) {
    const plant = await this.prisma.plant.findUnique({
      where: { slug: q.plantSlug },
    });
    if (!plant) throw new BadRequestException('Planta inválida');

    const dayStartLocal = fromLocalDate(q.date);
    const dayEndLocal = dayStartLocal.endOf('day');

    const start = dayStartLocal.toUTC().toJSDate();
    const end = dayEndLocal.toUTC().toJSDate();

    // “Capacidad agregada”: agrupamos por startAt (horario) ignorando la línea
    const freeSlots = await this.prisma.slot.groupBy({
      by: ['startAt'],
      where: {
        plantId: plant.id,
        status: SlotStatus.FREE,
        startAt: { gte: start, lte: end },
      },
      _count: true,
      orderBy: { startAt: 'asc' },
    });

    // Filtramos por precio vigente para ese tipo
    const pv = await this.prisma.plantVehicleType.findUnique({
      where: {
        plantId_vehicleTypeId: {
          plantId: plant.id,
          vehicleTypeId: q.vehicleTypeId,
        },
      },
      include: { priceRules: true },
    });
    if (!pv) return { times: [] as { time: string; capacity: number }[] };

    const times = freeSlots
      .map((s) => {
        const tLocal = DateTime.fromJSDate(s.startAt).setZone(
          process.env.APP_TZ || 'America/Argentina/Buenos_Aires',
        );
        return {
          time: tLocal.toFormat('HH:mm'),
          dtLocal: tLocal,
          capacity: s._count,
        };
      })
      .filter((item) => {
        // En “publicación” aplicamos: >= mañana y dentro del horizonte
        const tomorrowLocal = nowLocal().plus({ days: 1 }).startOf('day');
        const horizonLocal = nowLocal()
          .plus({ days: plant.daysAhead })
          .endOf('day');
        if (item.dtLocal < tomorrowLocal || item.dtLocal > horizonLocal)
          return false;

        // Tiene precio vigente en ese instante
        const anyPrice = pv.priceRules.some((pr) => {
          const vf = DateTime.fromJSDate(pr.validFrom);
          const vt = pr.validTo
            ? DateTime.fromJSDate(pr.validTo)
            : DateTime.fromISO('9999-12-31');
          const tUTC = item.dtLocal.toUTC();
          return vf <= tUTC && vt >= tUTC;
        });
        return anyPrice;
      })
      .map(({ time, capacity }) => ({ time, capacity }));

    return { times };
  }

  /**
   * Crea turno: asigna primera línea libre en el HH:mm seleccionado con fallback.
   * Aplica reglas: una activa por dominio en planta, ventana anual por aprobación/rechazo, y estados/bloqueos.
   */
  async createAppointment(
    params: { plantSlug: string; date: string },
    body: CreateAppointmentBodyDto,
  ) {
    const plant = await this.prisma.plant.findUnique({
      where: { slug: params.plantSlug },
    });
    if (!plant) throw new BadRequestException('Planta inválida');

    const dtLocal = fromLocalDate(params.date).plus({
      hours: parseInt(body.hour.slice(0, 2), 10),
      minutes: parseInt(body.hour.slice(3, 5), 10),
    });
    const startAt = dtLocal.toUTC().toJSDate();

    // Reserva desde día siguiente
    if (dtLocal < nowLocal().plus({ days: 1 }).startOf('day')) {
      throw new BadRequestException(
        'Solo se puede reservar a partir del día siguiente.',
      );
    }

    // Modos habilitados
    if (body.paymentMode === 'none' && !plant.enableNoPay)
      throw new BadRequestException('Modo sin pago deshabilitado.');
    if (
      (body.paymentMode === 'mp_online' || body.paymentMode === 'mp_cash') &&
      !plant.enableMercadoPago
    )
      throw new BadRequestException('MercadoPago deshabilitado.');

    // MP cash window
    if (body.paymentMode === 'mp_cash') {
      const minCash = nowLocal()
        .plus({ minutes: plant.cashWindowMinutes })
        .toUTC();
      if (dtLocal.toUTC() <= minCash)
        throw new BadRequestException(
          'Pago en efectivo solo disponible con mayor anticipación.',
        );
    }

    const dominio = normalizeDominio(body.dominio);

    // Reglas por dominio (una activa; anual por APROBADO/RECHAZADO)
    await this.ensureDomainRules(plant.id, dominio, dtLocal);

    // Precio vigente
    const pv = await this.prisma.plantVehicleType.findUnique({
      where: {
        plantId_vehicleTypeId: {
          plantId: plant.id,
          vehicleTypeId: body.vehicleTypeId,
        },
      },
      include: { priceRules: true },
    });
    if (!pv)
      throw new BadRequestException(
        'Tipo de vehículo no habilitado en la planta.',
      );

    const priceRule = pv.priceRules.find((pr) => {
      const vf = DateTime.fromJSDate(pr.validFrom);
      const vt = pr.validTo
        ? DateTime.fromJSDate(pr.validTo)
        : DateTime.fromISO('9999-12-31');
      const tUTC = dtLocal.toUTC();
      return vf <= tUTC && vt >= tUTC;
    });
    if (!priceRule)
      throw new BadRequestException('No hay tarifa vigente para ese horario.');

    // Transacción con lock atómico + fallback de línea
    const result = await this.prisma.$transaction(async (tx) => {
      // 1) Buscar TODOS los slots FREE en ese horario (capacidad agregada) ordenados por lineId
      const candidates = await tx.slot.findMany({
        where: { plantId: plant.id, startAt, status: SlotStatus.FREE },
        orderBy: [{ lineId: 'asc' }],
        select: { id: true, lineId: true, endAt: true },
      });
      if (candidates.length === 0) {
        throw new BadRequestException(
          'El horario se agotó. Probá otro cercano.',
        );
      }

      // 2) Intentar lockear uno por uno (updateMany condicional a status=FREE)
      let locked: { id: string; lineId: string | null; endAt: Date } | null =
        null;
      for (const c of candidates) {
        const res = await tx.slot.updateMany({
          where: { id: c.id, status: SlotStatus.FREE },
          data: { status: SlotStatus.LOCKED },
        });
        if (res.count === 1) {
          locked = c;
          break;
        }
        // si count=0, alguien te ganó ese slot; probá el siguiente
      }
      if (!locked) {
        throw new BadRequestException(
          'El horario se agotó. Probá otro cercano.',
        );
      }

      // 3) Asegurar Vehicle
      const vehicle = await tx.vehicle.upsert({
        where: { dominio },
        update: {},
        create: { dominio },
      });

      // 4) Crear Appointment y snapshot (precio capturado ahora)
      const state: AppointmentState =
        body.paymentMode === 'none'
          ? AppointmentState.EMAIL_PENDING
          : body.paymentMode === 'mp_online'
            ? AppointmentState.PENDING_PAYMENT
            : AppointmentState.AWAITING_CASH;

      const appt = await tx.appointment.create({
        data: {
          plantId: plant.id,
          lineId: locked.lineId ?? null,
          vehicleId: vehicle.id,
          vehicleTypeId: body.vehicleTypeId,
          slotId: locked.id,
          startAt,
          endAt: locked.endAt,
          state,
          unitPriceCents: priceRule.amountCents,
          currency: 'ARS',
          priceRuleId: priceRule.id,
          capturedAt: new Date(),
          paymentMode: body.paymentMode,
        },
      });

      await tx.appointmentData.create({
        data: {
          appointmentId: appt.id,
          nombre: body.nombre,
          email: body.email,
          telefono: body.telefono ?? null,
          dominio,
          marca: body.marca,
          modelo: body.modelo,
          anio: body.anio,
          combustible: body.combustible,
        },
      });

      // Nota: si body.paymentMode === 'none', luego en verify-email pasamos el slot a BOOKED y el appointment a CONFIRMED.
      // Para MP, el webhook hará la transición a CONFIRMED según corresponda.

      return appt;
    });

    // TODO: enviar email (verificación o inicio de pago)
    return { id: result.id, state: result.state };
  }

  private async ensureDomainRules(
    plantId: string,
    dominio: string,
    dtLocal: DateTime,
  ) {
    // Regla: una activa por dominio (EMAIL_PENDING | PENDING_PAYMENT | AWAITING_CASH | CONFIRMED)
    const active = await this.prisma.appointment.findFirst({
      where: {
        plantId,
        data: { is: { dominio } },
        state: {
          in: [
            'EMAIL_PENDING',
            'PENDING_PAYMENT',
            'AWAITING_CASH',
            'CONFIRMED',
          ] as any,
        },
      },
    });
    if (active)
      throw new BadRequestException(
        'Ya existe una reserva activa para ese dominio en esta planta.',
      );

    // Regla anual: si hay CONFIRMED APROBADO en mismo año => bloquear;
    // si hay CONFIRMED RECHAZADO => permitir retests ilimitados.
    const yearStart = dtLocal.startOf('year').toUTC().toJSDate();
    const yearEnd = dtLocal.endOf('year').toUTC().toJSDate();

    const confirmed = await this.prisma.appointment.findMany({
      where: {
        plantId,
        startAt: { gte: yearStart, lte: yearEnd },
        data: { is: { dominio } },
        state: 'CONFIRMED',
      },
      select: { result: true },
    });

    const hasApproved = confirmed.some((c) => c.result === 'APROBADO');
    if (hasApproved)
      throw new BadRequestException(
        'Ya cuenta con APROBADO este año. No puede reservar.',
      );

    // Si solo hay RECHAZADOS confirmados, se permite reservar (retests).
  }

  async verifyEmail(id: string, token: string) {
    // 1) Token firmado
    const v = verifyLinkToken(token);
    if (!v.ok || v.data.appointmentId !== id) {
      throw new ForbiddenException('Token inválido o vencido.');
    }

    // 2) Traer el appointment con datos necesarios
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        plant: { select: { lockMinutes: true, cancelReprogLimitHours: true, reschedulesLimit: true } },
        data: { select: { email: true } }, // Corregido para incluir email desde appointmentData
      },
    });
    if (!appt) throw new BadRequestException('Turno inválido.');

    // Idempotencia: si ya está confirmado, devolvemos OK
    if (appt.state === AppointmentState.CONFIRMED) return { ok: true };

    // Solo válido desde EMAIL_PENDING
    if (appt.state !== AppointmentState.EMAIL_PENDING) {
      throw new BadRequestException('Estado inválido para verificación.');
    }

    // 3) Chequeo de ventana (30′ por defecto, usando lockMinutes de la planta)
    const windowMinutes = appt.plant.lockMinutes ?? 30;
    const expiresAt = DateTime.fromJSDate(appt.createdAt).plus({
      minutes: windowMinutes,
    });
    if (DateTime.now() > expiresAt) {
      // Está vencido: dejamos que el watcher lo marque EXPIRED, pero no confirmamos
      throw new BadRequestException(
        'El enlace de verificación venció. Reservá nuevamente.',
      );
    }

    // 4) Transacción atómica:
    //    - Cambiamos el slot de LOCKED → BOOKED SOLO si sigue LOCKED (evita carreras)
    //    - Cambiamos el appointment a CONFIRMED SOLO si sigue EMAIL_PENDING
    await this.prisma.$transaction(async (tx) => {
      if (!appt.slotId) {
        // Con nuestro schema debería existir; defensivo por si quedó “legacy”
        throw new BadRequestException('El turno no tiene slot asignado.');
      }

      // Booking del slot con condición (idempotente / race-safe)
      const slotRes = await tx.slot.updateMany({
        where: { id: appt.slotId, status: SlotStatus.LOCKED },
        data: { status: SlotStatus.BOOKED },
      });
      if (slotRes.count !== 1) {
        // Otro proceso pudo haber tocado el slot; no confirmamos para evitar inconsistencias
        throw new BadRequestException(
          'No se pudo confirmar el turno (slot no disponible).',
        );
      }

      // Confirmación del appointment con condición (idempotente)
      const apptRes = await tx.appointment.updateMany({
        where: { id: appt.id, state: AppointmentState.EMAIL_PENDING },
        data: { state: AppointmentState.CONFIRMED },
      });
      if (apptRes.count !== 1) {
        // Revertimos el slot a LOCKED si no pudimos confirmar (muy raro, pero consistente)
        await tx.slot.update({
          where: { id: appt.slotId },
          data: { status: SlotStatus.LOCKED },
        });
        throw new BadRequestException('No se pudo confirmar el turno.');
      }

      // Enviar correo de confirmación
      if (!appt.data) {
        throw new Error('Los datos del turno no están disponibles.');
      }
      await this.emailService.sendMail(
        appt.data.email,
        'Confirmación de turno',
        `<h1>¡Tu turno ha sido confirmado!</h1><p>Gracias por verificar tu email. Tu turno está confirmado.</p>`
      );
    });

    return { ok: true };
  }

  async rescheduleByToken(
    id: string,
    token: string,
    body: { date: string; hour: string },
  ) {
    const v = verifyLinkToken(token);
    if (!v.ok || v.data.appointmentId !== id)
      throw new ForbiddenException('Token inválido');

    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        plant: true,
        slot: true,
        line: true,
        vehicleType: true,
        data: { select: { email: true } }, // Corregido para incluir email desde appointmentData
      },
    });
    if (!appt) throw new NotFoundException('Turno no encontrado');

    // Estados que permiten reprogramar
    const reschedulable = new Set<AppointmentState>([
      AppointmentState.CONFIRMED,
      AppointmentState.EMAIL_PENDING,
      AppointmentState.PENDING_PAYMENT,
      AppointmentState.AWAITING_CASH,
    ]);

    if (!reschedulable.has(appt.state)) {
      throw new BadRequestException('Este turno no puede reprogramarse');
    }

    // Límite de antelación
    const APP_TZ = process.env.APP_TZ || 'America/Argentina/Buenos_Aires';
    const startLocal = DateTime.fromJSDate(appt.startAt).setZone(APP_TZ);
    const nowLocal = DateTime.now().setZone(APP_TZ);
    const hoursDiff = startLocal.diff(nowLocal, 'hours').hours;
    console.log(hoursDiff, appt.plant.cancelReprogLimitHours);
    if (hoursDiff < appt.plant.cancelReprogLimitHours) {
      throw new ForbiddenException('Fuera de ventana de reprogramación');
    }

    // Límite de reprogramaciones
    if (appt.rescheduleCount >= appt.plant.reschedulesLimit) {
      throw new ForbiddenException('Límite de reprogramaciones alcanzado');
    }

    // Nueva fecha/hora (misma plant/vehicleType)
    const [h, m] = body.hour.split(':').map(Number);
    const local = DateTime.fromISO(body.date, { zone: APP_TZ }).set({
      hour: h,
      minute: m,
      second: 0,
      millisecond: 0,
    });
    if (!local.isValid) throw new BadRequestException('Fecha/hora inválidas');

    // Buscar un slot FREE para esa fecha/hora (capacidad agregada: cualquiera activo)
    const plant = appt.plant;
    const newStartUTC = local.toUTC().toJSDate();

    // EndAt lo deducimos por duración de la línea: buscamos por colisión exacta de startAt
    const candidate = await this.prisma.slot.findFirst({
      where: {
        plantId: plant.id,
        startAt: newStartUTC,
        status: SlotStatus.FREE,
      },
      orderBy: { lineId: 'asc' },
    });
    if (!candidate)
      throw new BadRequestException('No hay disponibilidad en ese horario');

    // Transacción:
    // - liberar slot anterior (si existía)
    // - asignar nuevo slot
    // - mantener precio y paymentMode
    // - incrementar rescheduleCount
    // - preservar vehicleTypeId (no permitido cambiar)
    return await this.prisma.$transaction(async (tx) => {
      // liberar slot anterior
      if (appt.slotId) {
        await tx.slot.update({
          where: { id: appt.slotId },
          data: { status: SlotStatus.FREE },
        });
      }

      // ocupar nuevo slot
      const newSlot = await tx.slot.update({
        where: { id: candidate.id },
        data: { status: SlotStatus.BOOKED },
      });

      // obtener duración desde el slot (endAt existente) o mantener el que ya tiene
      const newEndAt = newSlot.endAt;

      const updated = await tx.appointment.update({
        where: { id: appt.id },
        data: {
          slotId: newSlot.id,
          lineId: newSlot.lineId,
          startAt: newSlot.startAt,
          endAt: newEndAt,
          rescheduleCount: { increment: 1 },
          // estado: si estaba en EMAIL_PENDING/MP seguimos con el mismo (no cambiamos la lógica de pago)
          // unitPriceCents/capturedAt se mantienen (snapshot)
        },
      });

      // Enviar correo de reprogramación
      if (!appt.data) {
        throw new Error('Los datos del turno no están disponibles.');
      }
      await this.emailService.sendMail(
        appt.data.email,
        'Reprogramación de turno',
        `<h1>¡Tu turno ha sido reprogramado!</h1><p>Tu nuevo turno es el ${local.toFormat('dd/MM/yyyy')} a las ${body.hour}.</p>`
      );

      return {
        ok: true,
        id: updated.id,
        startAt: updated.startAt,
        endAt: updated.endAt,
      };
    });
  }

  async cancelByToken(id: string, token: string) {
    const v = verifyLinkToken(token);
    if (!v.ok || v.data.appointmentId !== id)
      throw new ForbiddenException('Token inválido');

    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: { plant: true, slot: true, data: { select: { email: true } } }, // Corregido para incluir email desde appointmentData
    });
    if (!appt) throw new NotFoundException('Turno no encontrado');

    // Estados cancelables por usuario
    const cancellable = new Set<AppointmentState>([
      AppointmentState.CONFIRMED,
      AppointmentState.EMAIL_PENDING,
      AppointmentState.PENDING_PAYMENT,
      AppointmentState.AWAITING_CASH,
    ]);

    if (!cancellable.has(appt.state)) {
      throw new BadRequestException('Este turno no puede cancelarse');
    }

    // Límite de antelación
    const APP_TZ = process.env.APP_TZ || 'America/Argentina/Buenos_Aires';
    const startLocal = DateTime.fromJSDate(appt.startAt).setZone(APP_TZ);
    const nowLocal = DateTime.now().setZone(APP_TZ);
    const hoursDiff = startLocal.diff(nowLocal, 'hours').hours;
    if (hoursDiff < appt.plant.cancelReprogLimitHours) {
      throw new ForbiddenException('Fuera de ventana de cancelación');
    }

    await this.prisma.$transaction(async (tx) => {
      // liberar slot si existía
      if (appt.slotId) {
        await tx.slot.update({
          where: { id: appt.slotId },
          data: { status: SlotStatus.FREE },
        });
      }

      // pasar a CANCELLED
      await tx.appointment.update({
        where: { id: appt.id },
        data: { state: AppointmentState.CANCELLED },
      });

      // Enviar correo de cancelación
      if (!appt.data) {
        throw new Error('Los datos del turno no están disponibles.');
      }
      await this.emailService.sendMail(
        appt.data.email,
        'Cancelación de turno',
        `<h1>Tu turno ha sido cancelado</h1><p>Si necesitas más información, contáctanos.</p>`
      );
    });

    return { ok: true };
  }
}
