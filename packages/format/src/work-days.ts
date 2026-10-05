export interface WorkWeek {
  workweekDays: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekStartsOn: number;
}

const DAY_MS = 86_400_000;
const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Calendar days from `from` to `to`, both included; 0 when the range runs backwards. */
export function calendarDaysBetween(from: string, to: string): number {
  const span = Math.round((dayOf(to) - dayOf(from)) / DAY_MS) + 1;
  return span > 0 ? span : 0;
}

/** The working days of a range: `workweekDays` days of each week, counted from `weekStartsOn`. */
export function workingDaysBetween(from: string, to: string, week: WorkWeek): string[] {
  const days: string[] = [];
  for (let ms = dayOf(from), end = dayOf(to); ms <= end; ms += DAY_MS) {
    const offset = (new Date(ms).getUTCDay() - week.weekStartsOn + 7) % 7;
    if (offset < week.workweekDays) days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}
