import { AsyncLocalStorage } from 'node:async_hooks';
import { ACTIVITY_COALESCE_WINDOW_MS, NOTIFICATION_FANOUT_DELAY_MS } from '@nothingleft/types';
import { FANOUT_SINCE_MARGIN_MS } from '@config/constants';
import type { FanoutJob, JobQueue } from '@lib/jobs';

export interface Pending {
  job: FanoutJob;
  key: string;
  startAfter: Date;
}

/** What the current request changed that someone may hear about, keyed by subject. */
export const pending = new AsyncLocalStorage<Map<string, Pending>>();

const since = (at: Date) => new Date(at.getTime() - ACTIVITY_COALESCE_WINDOW_MS - FANOUT_SINCE_MARGIN_MS).toISOString();
const deferred = (at: Date) => new Date(at.getTime() + NOTIFICATION_FANOUT_DELAY_MS);

function remember(entry: Pending): void {
  const store = pending.getStore();
  if (store && !store.has(entry.key)) store.set(entry.key, entry);
}

/** Called by the one writer of issue history, so every issue write is covered without a call per service. */
export function recordIssueTouched(orgId: number, issueId: number, at: Date): void {
  const key = `issue:${issueId}`;
  remember({
    key,
    startAfter: deferred(at),
    job: { type: 'issue', org_id: orgId, issue_id: issueId, since: since(at) },
  });
}

export function recordArticleTouched(orgId: number, articleId: number, actorId: number, at: Date): void {
  const key = `article:${articleId}`;
  remember({
    key,
    startAfter: deferred(at),
    job: { type: 'article', org_id: orgId, article_id: articleId, actor_id: actorId, since: since(at) },
  });
}

// A sprint starting or finishing is a deliberate act that coalescing never rewrites, so it goes at once.
export function recordSprintEvent(job: Extract<FanoutJob, { type: 'sprint' }>, at: Date): void {
  remember({ key: `sprint:${job.sprint_id}:${job.kind}`, startAfter: at, job });
}

/** A job's writes get the same fan-out a request's do; sent even after a failure, for what had committed. */
export async function withNotifications<T>(
  queue: () => JobQueue,
  report: (error: unknown) => void,
  body: () => Promise<T>,
): Promise<T> {
  const store = new Map<string, Pending>();
  try {
    return await pending.run(store, body);
  } finally {
    const sent = await Promise.allSettled(
      [...store.values()].map(entry =>
        queue().send('notify.fanout', entry.job, { startAfter: entry.startAfter, singletonKey: entry.key }),
      ),
    );
    for (const result of sent) if (result.status === 'rejected') report(result.reason);
  }
}
