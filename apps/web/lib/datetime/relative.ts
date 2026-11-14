import { formatDate, type Instant } from '@lib/datetime/format';
import { plural } from '@lib/numbers';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const RELATIVE_WINDOW_MS = 7 * DAY;

/** `just now` · `12 minutes ago` · `3 days ago` · `in 2 hours`; absolute date at 7 days or beyond. */
export function formatRelative(value: Instant, now: Instant = Date.now(), timeZone?: string) {
  const target = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const reference = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const delta = reference - target;
  const magnitude = Math.abs(delta);

  if (magnitude >= RELATIVE_WINDOW_MS) return formatDate(target, timeZone);
  if (magnitude < MINUTE) return 'just now';

  const phrase =
    magnitude < HOUR
      ? plural(Math.floor(magnitude / MINUTE), 'minute')
      : magnitude < DAY
        ? plural(Math.floor(magnitude / HOUR), 'hour')
        : plural(Math.floor(magnitude / DAY), 'day');

  return delta >= 0 ? `${phrase} ago` : `in ${phrase}`;
}

/** `now` · `12m` · `3h` · `2d`; `19 Sep` at 7 days or beyond, with the year only when it differs. For phone rows. */
export function formatRelativeShort(value: Instant, now: Instant = Date.now(), timeZone?: string) {
  const target = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const reference = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const elapsed = Math.max(0, reference - target);

  if (elapsed >= RELATIVE_WINDOW_MS) {
    const [day, month, year] = formatDate(target, timeZone).split(' ');
    return year === formatDate(reference, timeZone).split(' ')[2] ? `${day} ${month}` : `${day} ${month} ${year}`;
  }
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  return `${Math.floor(elapsed / DAY)}d`;
}
