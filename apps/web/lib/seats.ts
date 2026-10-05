import type { Seats } from '@nothingleft/types';

/**
 * The notice starts at the 20th member, not the 21st: docs/limits-and-billing.md § Seats
 * words it as "adding your 21st member", which is the one being added while 20 are used.
 */
export const seatNoticeApplies = (seats: Seats) => seats.free !== null && seats.used >= seats.free;

export const nextSeatOrdinal = (seats: Seats) => {
  const n = seats.used + 1;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
};
