import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';
@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDay(date: string) {
    const start = DateTime.fromISO(date, {
      zone: process.env.APP_TZ || 'America/Argentina/Buenos_Aires',
    })
      .startOf('day')
      .toUTC()
      .toJSDate();
    const end = DateTime.fromISO(date, {
      zone: process.env.APP_TZ || 'America/Argentina/Buenos_Aires',
    })
      .endOf('day')
      .toUTC()
      .toJSDate();
    const appts = await this.prisma.appointment.findMany({
      where: { startAt: { gte: start, lte: end } },
      include: { data: true, line: true, plant: true },
    });
    return { items: appts };
  }

  async updateLineDuration(
    lineId: string,
    body: {
      durationMinutes: number;
      effectiveFrom: string;
      maxShiftMinutes?: number;
    },
  ) {
    const effectiveFrom = DateTime.fromISO(body.effectiveFrom).toJSDate();
    if (!effectiveFrom) throw new BadRequestException('effectiveFrom inválido');
    const cfg = await this.prisma.lineConfig.create({
      data: {
        lineId,
        durationMinutes: body.durationMinutes,
        effectiveFrom,
        maxShiftMinutes: body.maxShiftMinutes ?? 10,
      },
    });
    // TODO: regeneración inmediata + reubicación (en próxima iteración)
    return { ok: true, config: cfg };
  }
}
