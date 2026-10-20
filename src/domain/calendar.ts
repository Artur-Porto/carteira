// Calendar arithmetic on YYYY-MM-DD dates, free of time zones, and business days from the ANBIMA
// holiday list (SPEC: "Juros em dias úteis, base 252, com o calendário de feriados").
import type { IsoDate } from './types';

const DAY_MS = 86_400_000;
const utc = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: IsoDate, days: number): IsoDate => fromUtc(utc(date) + days * DAY_MS);

/** Calendar days from `from` to `to`; negative when `to` comes first. */
export const daysBetween = (from: IsoDate, to: IsoDate): number => Math.round((utc(to) - utc(from)) / DAY_MS);

/** 0 is Sunday and 6 is Saturday. */
export const weekday = (date: IsoDate): number => new Date(utc(date)).getUTCDay();

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const isoOf = (year: number, month: number, day: number): IsoDate =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * The same day `months` later. When that month has no such day, the period ends on the first
 * day after it, as Lei 810/1949 rules for civil years and months (29/02 + 1 year = 01/03).
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = daysInMonth(year, month);
  return d > last ? addDays(isoOf(year, month, last), 1) : isoOf(year, month, d);
}

export const addYears = (date: IsoDate, years: number): IsoDate => addMonths(date, years * 12);

/** Whole years from `from` to `on`, counted by anniversaries as in addYears. */
export function completedYears(from: IsoDate, on: IsoDate): number {
  if (on < from) return 0;
  let years = Number(on.slice(0, 4)) - Number(from.slice(0, 4));
  while (years > 0 && addYears(from, years) > on) years--;
  return years;
}

export const monthOf = (date: IsoDate): string => date.slice(0, 7);

/** Business days: Monday to Friday, except national holidays. */
export class BusinessCalendar {
  private readonly holidays: ReadonlySet<IsoDate>;

  constructor(holidays: Iterable<IsoDate>) {
    this.holidays = new Set(holidays);
  }

  isBusinessDay(date: IsoDate): boolean {
    const wd = weekday(date);
    return wd !== 0 && wd !== 6 && !this.holidays.has(date);
  }

  /** Business days d with from <= d < to: the days that accrue interest between two dates. */
  businessDaysBetween(from: IsoDate, to: IsoDate): number {
    let count = 0;
    for (let d = from; d < to; d = addDays(d, 1)) if (this.isBusinessDay(d)) count++;
    return count;
  }

  /** The business days d with from <= d < to, oldest first. */
  *businessDays(from: IsoDate, to: IsoDate): Generator<IsoDate> {
    for (let d = from; d < to; d = addDays(d, 1)) if (this.isBusinessDay(d)) yield d;
  }

  /** The date `count` business days after `date` (before it, for a negative count). */
  addBusinessDays(date: IsoDate, count: number): IsoDate {
    const step = count < 0 ? -1 : 1;
    let d = date;
    for (let left = Math.abs(count); left > 0; ) {
      d = addDays(d, step);
      if (this.isBusinessDay(d)) left--;
    }
    return d;
  }
}
