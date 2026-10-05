import { DEFAULT_WORKDAY_MINUTES, DEFAULT_WORKWEEK_DAYS } from '@nothingleft/types';

export interface WorkCalendar {
  workdayMinutes: number;
  workweekDays: number;
}

export const DEFAULT_WORK_CALENDAR: WorkCalendar = {
  workdayMinutes: DEFAULT_WORKDAY_MINUTES,
  workweekDays: DEFAULT_WORKWEEK_DAYS,
};

const TOKEN = /^(\d+)([wdhm])$/;

/** `1w 1d 1h 1m` → integer minutes, or `null` when the text is not a duration. */
export function parseDuration(input: string, calendar: WorkCalendar = DEFAULT_WORK_CALENDAR): number | null {
  const tokens = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const unit = {
    m: 1,
    h: 60,
    d: calendar.workdayMinutes,
    w: calendar.workdayMinutes * calendar.workweekDays,
  };

  let total = 0;
  const seen = new Set<string>();
  for (const token of tokens) {
    const match = TOKEN.exec(token);
    if (!match) return null;
    const [, amount, suffix] = match as unknown as [string, string, keyof typeof unit];
    if (seen.has(suffix)) return null;
    seen.add(suffix);
    total += Number(amount) * unit[suffix];
  }
  return total;
}

/** integer minutes → `1w 1d 1h 1m`; zero renders as `0m`. */
export function formatDuration(minutes: number, calendar: WorkCalendar = DEFAULT_WORK_CALENDAR): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';

  const weekMinutes = calendar.workdayMinutes * calendar.workweekDays;
  let rest = Math.round(minutes);
  const parts: string[] = [];

  const take = (size: number, suffix: string) => {
    const n = Math.floor(rest / size);
    if (n > 0) {
      parts.push(`${n}${suffix}`);
      rest -= n * size;
    }
  };

  take(weekMinutes, 'w');
  take(calendar.workdayMinutes, 'd');
  take(60, 'h');
  take(1, 'm');
  return parts.join(' ');
}
