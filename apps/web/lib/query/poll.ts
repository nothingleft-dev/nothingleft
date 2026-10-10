// Intervals per frontend-guide.md § lib/query. A query that failed stops polling until a
// refocus or an invalidation succeeds, so an outage is not met with more requests.
const every =
  (ms: number) =>
  (query: { state: { status: string } }): number | false =>
    query.state.status === 'error' ? false : ms;

export const POLL = {
  list: every(30_000),
  figures: every(60_000),
  admin: every(60_000),
  // A dialog waiting on something the user is doing elsewhere, such as an agent's first call.
  waiting: every(3_000),
  // A job the user started and is watching, such as moving files to their own bucket: it
  // moves 50 files per batch, so a faster poll would mostly redraw the same figures.
  progress: every(5_000),
  // An import or an export running in the background (owner, 10 Oct 2026).
  job: every(10_000),
} as const;
