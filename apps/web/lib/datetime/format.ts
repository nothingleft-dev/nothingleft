export type Instant = Date | string | number;

export const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Every IANA zone the runtime knows, for the profile picker. Empty on an old engine. */
export const supportedTimeZones = (): string[] =>
  typeof Intl.supportedValuesOf === 'function' ? [...Intl.supportedValuesOf('timeZone')] : [];

// The signed-in profile's zone (ui-conventions.md § Storage and conversion), set once by the shell,
// so a call site that passes no zone still renders in it rather than in the browser's.
let profileTimeZone: string | undefined;
export const setProfileTimeZone = (timeZone: string | undefined) => {
  profileTimeZone = timeZone;
};
const zoneOf = (timeZone?: string) => timeZone ?? profileTimeZone;

const toDate = (value: Instant) => (value instanceof Date ? value : new Date(value));

// en-US gives `Sep`, en-GB gives `Sept`; the parts are reassembled into day-month-year.
const dateParts = (timeZone?: string) =>
  new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: zoneOf(timeZone) });

const pick = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
  parts.find(p => p.type === type)?.value ?? '';

const timeParts = (timeZone?: string) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zoneOf(timeZone) });

// en-US names only American zones (`EDT`) and prints the rest as an offset; the regional
// English locales carry the abbreviation people there use (`IST`, `BST`, `AEST`).
const ZONE_NAME_LOCALES = ['en-US', 'en-GB', 'en-IN', 'en-AU', 'en-NZ', 'en-ZA', 'en-SG', 'en-CA'];

function zoneName(value: Date, timeZone?: string): string | undefined {
  let fallback: string | undefined;
  for (const locale of ZONE_NAME_LOCALES) {
    const name = new Intl.DateTimeFormat(locale, { timeZoneName: 'short', timeZone: zoneOf(timeZone) })
      .formatToParts(value)
      .find(p => p.type === 'timeZoneName')?.value;
    if (name && !/^(GMT|UTC)[+-]/.test(name)) return name;
    fallback ??= name;
  }
  return fallback;
}

/** `19 Sep 2026` */
export function formatDate(value: Instant, timeZone?: string) {
  const parts = dateParts(timeZone).formatToParts(toDate(value));
  return `${pick(parts, 'day')} ${pick(parts, 'month')} ${pick(parts, 'year')}`;
}

/** `Sunday, 20 Sep 2026` — page headers only. */
export function formatLongDate(value: Instant, timeZone?: string) {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: zoneOf(timeZone) }).format(
    toDate(value),
  );
  return `${weekday}, ${formatDate(value, timeZone)}`;
}

/** `8:48pm` */
export function formatTime(value: Instant, timeZone?: string) {
  return timeParts(timeZone).format(toDate(value)).replace(' ', '').toLowerCase();
}

/** `19 Sep 2026, 8:48pm` */
export function formatDateTime(value: Instant, timeZone?: string) {
  return `${formatDate(value, timeZone)}, ${formatTime(value, timeZone)}`;
}

/** `19 Sep 2026, 8:48pm IST` — the tooltip form. */
export function formatDateTimeWithZone(value: Instant, timeZone?: string) {
  const zone = zoneName(toDate(value), timeZone);
  return zone ? `${formatDateTime(value, timeZone)} ${zone}` : formatDateTime(value, timeZone);
}

/**
 * Calendar dates (`due_date`, `start_date`, `work_date`) arrive as `YYYY-MM-DD` and are never
 * timezone-converted, so they are formatted as UTC noon to keep the day stable.
 */
export function formatCalendarDate(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return formatDate(new Date(Date.UTC(y, m - 1, d, 12)), 'UTC');
}

/** `19 Sep`, with the year only when it is not the current one — dense list cells. */
export function formatCalendarDateShort(isoDate: string, now: Instant = Date.now()) {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const parts = dateParts('UTC').formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  const thisYear = toDate(now).getFullYear() === y;
  return thisYear
    ? `${pick(parts, 'day')} ${pick(parts, 'month')}`
    : `${pick(parts, 'day')} ${pick(parts, 'month')} ${y}`;
}

/** `Sep 2026` — a timeline's month band. */
export function formatCalendarMonth(isoDate: string) {
  const [, month, year] = formatCalendarDate(isoDate).split(' ');
  return `${month} ${year}`;
}

/** `Tue` — a day column's heading. Calendar dates are read at UTC noon, like formatCalendarDate. */
export function formatCalendarWeekday(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

/** `21–25 Sep 2026`, `28 Sep – 2 Oct 2026`, `29 Dec 2026 – 2 Jan 2027`: a date range, sharing what both ends share. */
export function formatCalendarRange(from: string, to: string) {
  if (from === to) return formatCalendarDate(from);
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const [fd, fMonth] = formatCalendarDate(from).split(' ');
  const end = formatCalendarDate(to);
  if (fy !== ty) return `${formatCalendarDate(from)} – ${end}`;
  if (fm !== tm) return `${fd} ${fMonth} – ${end}`;
  return `${fd}–${end}`;
}

/** Today as `YYYY-MM-DD` in the viewer's zone: the day a due date is compared against. */
export function todayCalendarDate(timeZone?: string, now: Instant = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: zoneOf(timeZone),
  }).formatToParts(toDate(now));
  return `${pick(parts, 'year')}-${pick(parts, 'month')}-${pick(parts, 'day')}`;
}

/** An instant's calendar date and minutes past midnight in the zone: what a date-and-time picker edits. */
export function zonedDateAndMinutes(value: Instant, timeZone?: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zoneOf(timeZone),
  }).formatToParts(toDate(value));
  return {
    date: `${pick(parts, 'year')}-${pick(parts, 'month')}-${pick(parts, 'day')}`,
    minutes: Number(pick(parts, 'hour')) * 60 + Number(pick(parts, 'minute')),
  };
}

/** The instant a wall-clock date and time names in the zone, as an ISO string. */
export function instantFromZoned(date: string, minutes: number, timeZone?: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // Two passes settle the offset, including across a daylight-saving change.
  let guess = wall;
  for (let i = 0; i < 2; i += 1) {
    const seen = zonedDateAndMinutes(guess, timeZone);
    const [sy, sm, sd] = seen.date.split('-').map(Number) as [number, number, number];
    const seenWall = Date.UTC(sy, sm - 1, sd, Math.floor(seen.minutes / 60), seen.minutes % 60);
    guess += wall - seenWall;
  }
  return new Date(guess).toISOString();
}

/** `9:30am`, `9.30 pm`, `21:30`, `9pm` → minutes past midnight; null when it names no time. */
export function parseTimeOfDay(text: string): number | null {
  const match = /^\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a|p)?\s*$/i.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const half = match[3]?.toLowerCase()[0];
  if (minute > 59) return null;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === 'p' ? 12 : 0);
  } else if (hour > 23) return null;
  return hour * 60 + minute;
}

/** Minutes past midnight as `9:30am`. */
export function formatTimeOfDay(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, '0');
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute}${hour < 12 ? 'am' : 'pm'}`;
}
