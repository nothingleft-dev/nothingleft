import { TriangleAlert } from 'lucide-react';
import type { Seats } from '@nothingleft/types';
import { nextSeatOrdinal, seatNoticeApplies } from '@lib/seats';
import { formatCount, plural } from '@lib/numbers';

/**
 * docs/limits-and-billing.md § Seats: nothing is blocked and nothing degrades. The
 * promise that the first twenty seats stay free is stated in the product, so it has to
 * be honoured — which is why the wording is the doc's, not a paraphrase.
 */
export function SeatNotice({ seats }: { seats: Seats }) {
  if (!seatNoticeApplies(seats)) return null;

  return (
    <div className="flex gap-2.5 rounded-md border border-warning-fg/25 bg-warning-bg px-3 py-2.5 text-warning-fg">
      <TriangleAlert className="mt-px size-icon-sm flex-none" />
      <p className="text-xs leading-5">
        Adding your {nextSeatOrdinal(seats)} member. The first {seats.free} members of every organisation are free
        forever. Seats beyond that will cost around $5/user/month once billing launches — we’ll give you plenty of
        notice first.
      </p>
    </div>
  );
}

/** The organisation-settings banner: a count rather than the next-member sentence. */
export function SeatBanner({ seats }: { seats: Seats }) {
  if (!seatNoticeApplies(seats) || seats.free === null) return null;

  return (
    <div className="flex gap-2.5 rounded-md border border-warning-fg/25 bg-warning-bg px-3 py-2.5 text-warning-fg">
      <TriangleAlert className="mt-px size-icon-sm flex-none" />
      <p className="text-xs leading-5">
        {seats.over > 0
          ? `${plural(seats.used, 'member')}, ${formatCount(seats.over)} over the ${seats.free} free seats. Nothing changes today, and your first ${seats.free} seats stay free when paid plans arrive.`
          : `${plural(seats.used, 'member')}, all ${seats.free} free seats in use. Adding more blocks nothing, and the first ${seats.free} stay free permanently.`}
      </p>
    </div>
  );
}
