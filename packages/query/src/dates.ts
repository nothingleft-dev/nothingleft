import type { DateValue, Weekday } from './ast.ts';

/** Inclusive calendar-day period, both ends `YYYY-MM-DD`. */
export interface Period {
  start: string;
  end: string;
}

export interface DateContext {
  /** Today's calendar date in the user's timezone, `YYYY-MM-DD`. */
  today: string;
  weekStartsOn?: Weekday;
}

const DAY = 24 * 60 * 60 * 1000;

function toUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return toIso(new Date(toUtc(date).getTime() + days * DAY));
}

function addMonths(date: string, months: number): string {
  const utc = toUtc(date);
  const day = utc.getUTCDate();
  const target = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toIso(target);
}

function isoWeekday(date: string): Weekday {
  const day = toUtc(date).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

function weekOf(date: string, weekStartsOn: Weekday): Period {
  const offset = (isoWeekday(date) - weekStartsOn + 7) % 7;
  const start = addDays(date, -offset);
  return { start, end: addDays(start, 6) };
}

function monthOf(date: string): Period {
  const utc = toUtc(date);
  const start = toIso(new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), 1)));
  const end = toIso(new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + 1, 0)));
  return { start, end };
}

function yearOf(date: string): Period {
  const year = date.slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

const day = (date: string): Period => ({ start: date, end: date });

/**
 * A date value as a whole-day period, or `null` for values finer than a day
 * (`Now`, `{minus 24h}`), which compile resolves against the clock instead.
 */
export function resolveDatePeriod(value: DateValue, context: DateContext): Period | null {
  const { today } = context;
  const weekStartsOn = context.weekStartsOn ?? 1;
  switch (value.kind) {
    case 'date':
      return day(value.date);
    case 'month':
      return monthOf(`${value.month}-01`);
    case 'weekday': {
      const week = weekOf(today, weekStartsOn);
      return day(addDays(week.start, (value.weekday - weekStartsOn + 7) % 7));
    }
    case 'relative':
      switch (value.unit) {
        case 'd':
          return day(addDays(today, value.sign * value.amount));
        case 'w':
          return day(addDays(today, value.sign * value.amount * 7));
        case 'M':
          return day(addMonths(today, value.sign * value.amount));
        case 'y':
          return day(addMonths(today, value.sign * value.amount * 12));
        default:
          return null;
      }
    case 'keyword':
      switch (value.keyword) {
        case 'today':
          return day(today);
        case 'yesterday':
          return day(addDays(today, -1));
        case 'tomorrow':
          return day(addDays(today, 1));
        case 'now':
          return null;
        case 'this week':
          return weekOf(today, weekStartsOn);
        case 'last week':
          return weekOf(addDays(today, -7), weekStartsOn);
        case 'next week':
          return weekOf(addDays(today, 7), weekStartsOn);
        case 'this month':
          return monthOf(today);
        case 'last month':
          return monthOf(addMonths(monthOf(today).start, -1));
        case 'next month':
          return monthOf(addMonths(monthOf(today).start, 1));
        case 'this year':
          return yearOf(today);
        case 'last year':
          return yearOf(addMonths(today, -12));
        case 'next year':
          return yearOf(addMonths(today, 12));
      }
  }
}

/** The calendar date an instant falls on in an IANA timezone, `YYYY-MM-DD`. */
export function dateInZone(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(instant)
    .slice(0, 10);
}

/** The wall-clock hour (0–23) and weekday (0 = Sunday) at an instant in a timezone. */
export function clockInZone(instant: Date, timezone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(instant);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    parts.find(p => p.type === 'weekday')?.value ?? 'Sun',
  );
  return { hour, weekday };
}
