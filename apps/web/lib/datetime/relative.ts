import { formatDate, type Instant } from '@lib/datetime/format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const RELATIVE_WINDOW_MS = 7 * DAY;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

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
