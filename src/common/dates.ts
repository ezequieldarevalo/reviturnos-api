import { DateTime } from 'luxon';

const APP_TZ = process.env.APP_TZ || 'America/Argentina/Buenos_Aires';

export const toUTC = (dt: DateTime) => dt.toUTC();
export const fromLocalDate = (yyyyMmDd: string) =>
  DateTime.fromISO(yyyyMmDd, { zone: APP_TZ }).startOf('day');
export const startOfLocalMonth = (yyyyMm: string) =>
  DateTime.fromISO(yyyyMm + '-01', { zone: APP_TZ }).startOf('month');
export const endOfLocalMonth = (yyyyMm: string) =>
  DateTime.fromISO(yyyyMm + '-01', { zone: APP_TZ }).endOf('month');
export const nowLocal = () => DateTime.now().setZone(APP_TZ);

export const clampToBusinessDay = (dt: DateTime) => dt.startOf('day');
