import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime, Interval } from 'luxon';

const APP_TZ = process.env.APP_TZ || 'America/Argentina/Buenos_Aires';
type Tramo = { start: string; end: string };

@Injectable()
export class SlotGeneratorService {
  private readonly logger = new Logger(SlotGeneratorService.name);
  constructor(private prisma: PrismaService) {}

  async generateAllPlants() {
    const plants = await this.prisma.plant.findMany({
      include: {
        lines: { include: { configs: true } },
        weeklySchedules: true,
        scheduleExceptions: true,
      },
    });

    for (const plant of plants) {
      try {
        await this.generateForPlant({
          plantId: plant.id,
          daysAhead: plant.daysAhead,
          weekly: plant.weeklySchedules,
          exceptions: plant.scheduleExceptions,
          lines: plant.lines,
        });
      } catch (e) {
        this.logger.error(
          `Slot gen error en plant ${plant.slug}`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }
  }

  async generateForPlant(input: {
    plantId: string;
    daysAhead: number;
    weekly: { dayOfWeek: number; start: string; end: string }[];
    exceptions: { date: Date; start: string; end: string }[];
    lines: {
      id: string;
      isActive: boolean;
      configs: { durationMinutes: number; effectiveFrom: Date }[];
    }[];
  }) {
    const { plantId, daysAhead, weekly, exceptions, lines } = input;

    const tomorrow = DateTime.now()
      .setZone(APP_TZ)
      .plus({ days: 1 })
      .startOf('day');
    const horizon = DateTime.now()
      .setZone(APP_TZ)
      .plus({ days: daysAhead })
      .endOf('day');

    const weeklyByDow = new Map<number, Tramo[]>();
    for (const w of weekly) {
      if (!weeklyByDow.has(w.dayOfWeek)) weeklyByDow.set(w.dayOfWeek, []);
      weeklyByDow.get(w.dayOfWeek)!.push({ start: w.start, end: w.end });
    }

    const excByDate = new Map<string, Tramo[]>();
    for (const ex of exceptions) {
      const dLocal = DateTime.fromJSDate(ex.date)
        .setZone(APP_TZ)
        .toFormat('yyyy-LL-dd');
      if (!excByDate.has(dLocal)) excByDate.set(dLocal, []);
      excByDate.get(dLocal)!.push({ start: ex.start, end: ex.end });
    }

    const createBuffer: {
      plantId: string;
      lineId: string | null;
      startAt: Date;
      endAt: Date;
      status: 'FREE';
      generated: boolean;
    }[] = [];

    for (
      let cursor = tomorrow;
      cursor <= horizon;
      cursor = cursor.plus({ days: 1 })
    ) {
      const dowDb = cursor.weekday === 7 ? 0 : cursor.weekday; // domingo=0
      const tramos = weeklyByDow.get(dowDb) ?? [];
      if (!tramos.length) continue;

      const key = cursor.toFormat('yyyy-LL-dd');
      const exc = excByDate.get(key) ?? [];

      for (const line of lines) {
        if (!line.isActive) continue;

        const endOfDayLocal = cursor.endOf('day');
        const cfg = line.configs
          .filter((c) => DateTime.fromJSDate(c.effectiveFrom) <= endOfDayLocal)
          .sort((a, b) => +a.effectiveFrom - +b.effectiveFrom)
          .at(-1);
        if (!cfg || cfg.durationMinutes <= 0) continue;

        for (const t of tramos) {
          const tramo = this.intervalLocal(cursor, t.start, t.end);
          if (!tramo.isValid || !tramo.start || !tramo.end || tramo.isEmpty())
            continue;

          const usable = this.subtractExceptions(
            tramo,
            exc.map((e) => this.intervalLocal(cursor, e.start, e.end)),
          );
          for (const sub of usable) {
            const subStart = sub.start!;
            const subEnd = sub.end!;
            for (
              let cur = subStart;
              cur.plus({ minutes: cfg.durationMinutes }) <= subEnd;
              cur = cur.plus({ minutes: cfg.durationMinutes })
            ) {
              const end = cur.plus({ minutes: cfg.durationMinutes });
              createBuffer.push({
                plantId,
                lineId: line.id,
                startAt: cur.toUTC().toJSDate(),
                endAt: end.toUTC().toJSDate(),
                status: 'FREE',
                generated: true,
              });
            }
          }
        }
      }
    }

    if (createBuffer.length) {
      await this.prisma.slot.createMany({
        data: createBuffer,
        skipDuplicates: true,
      });
    }
  }

  private intervalLocal(
    dayLocal: DateTime,
    hhmmStart: string,
    hhmmEnd: string,
  ): Interval {
    const [sh, sm] = hhmmStart.split(':').map(Number);
    const [eh, em] = hhmmEnd.split(':').map(Number);
    const start = dayLocal.set({
      hour: sh,
      minute: sm,
      second: 0,
      millisecond: 0,
    });
    const end = dayLocal.set({
      hour: eh,
      minute: em,
      second: 0,
      millisecond: 0,
    });
    return Interval.fromDateTimes(start, end);
  }

  private subtractExceptions(
    base: Interval,
    exceptions: Interval[],
  ): Interval[] {
    let segments: Interval[] = [base];
    for (const ex of exceptions) {
      const next: Interval[] = [];
      for (const seg of segments) {
        if (!seg.overlaps(ex)) {
          next.push(seg);
          continue;
        }
        const inter = seg.intersection(ex);
        if (!seg.start || !seg.end || !inter || !inter.start || !inter.end) {
          next.push(seg);
          continue;
        }
        if (seg.start < inter.start)
          next.push(Interval.fromDateTimes(seg.start, inter.start));
        if (inter.end < seg.end)
          next.push(Interval.fromDateTimes(inter.end, seg.end));
      }
      segments = next;
      if (!segments.length) break;
    }
    return segments.filter(
      (s) => s.isValid && !!s.start && !!s.end && s.length('minutes') > 0,
    );
  }
}
