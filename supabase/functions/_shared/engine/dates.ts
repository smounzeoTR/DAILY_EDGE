// Calendar arithmetic on YYYY-MM-DD strings (UTC-based, no time zone involved).
import type { ISODate } from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: ISODate, days: number): ISODate {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

// Number of days from `from` to `to` (positive when `to` is later)
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

// The n days before `date`: [date-1, date-2, ..., date-n]
export function previousDays(date: ISODate, n: number): ISODate[] {
  return Array.from({ length: n }, (_, i) => addDays(date, -(i + 1)));
}

// Program week (1-based) of a program day
export function weekOfDay(programDay: number): number {
  return Math.floor((programDay - 1) / 7) + 1;
}
