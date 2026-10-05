const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `19 Sep 2026` from `2026-09-19`; a calendar date, never shifted by a timezone. */
export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number) as [number, number, number];
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** The calendar date `days` after `date`. */
export function addCalendarDays(date: string, days: number): string {
  return new Date(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
