import { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import {
  JOB_DIGEST_CRON,
  JOB_DUE_CRON,
  JOB_GC_CRON,
  JOB_NOTIFICATIONS_PURGE_CRON,
  JOB_ORG_DELETE_CRON,
  JOB_ORG_DELETION_REMINDER_CRON,
  JOB_PURGE_CRON,
  JOB_RECONCILE_CRON,
  JOB_SNAPSHOT_CRON,
  JOB_SWEEP_CRON,
  JOB_TRANSFER_SWEEP_CRON,
  EXPORT_JOB_EXPIRE_SECONDS,
  JOB_GIT_PURGE_CRON,
  JOB_GIT_RECONCILE_CRON,
} from '@config/constants';
import type { GitEventsJob } from '@services/git-ingest.service';
import type { GitBackfillJob } from '@services/git-repositories.service';

export interface JobHandlers {
  'session.gc': () => Promise<number>;
  'tokens.gc': () => Promise<number>;
  'issues.purge': () => Promise<number>;
  'attachments.sweep': () => Promise<number>;
  'sprint.snapshot': () => Promise<number>;
  'notifications.due': (now?: Date) => Promise<number>;
  'email.digest': (now?: Date) => Promise<number>;
  'notifications.purge': (now?: Date) => Promise<number>;
  'org.deletion_reminder': (now?: Date) => Promise<number>;
  'org.delete': (now?: Date) => Promise<number>;
  'storage.reconcile': (now?: Date) => Promise<number>;
  'transfers.sweep': (now?: Date) => Promise<number>;
  'git.purge': (now?: Date) => Promise<number>;
  'git.reconcile': (now?: Date) => Promise<number>;
}

export type FanoutJob =
  | { type: 'issue'; org_id: number; issue_id: number; since: string }
  | { type: 'article'; org_id: number; article_id: number; actor_id: number; since: string }
  | {
      type: 'sprint';
      org_id: number;
      sprint_id: number;
      kind: 'sprint_started' | 'sprint_finished';
      actor_id: number;
      user_ids: number[];
    };

export interface AvatarMirrorJob {
  user_id: number;
}

export interface StorageMigrateJob {
  org_id: number;
  /** A continuation run starts after the last file the previous run reached. */
  after_id?: number;
}

export interface ImportCsvJob {
  org_id: number;
  job_id: number;
}

export interface ExportOrgJob {
  org_id: number;
  job_id: number;
}

/** Jobs sent with data by a write, rather than run on a schedule. */
export interface QueuedHandlers {
  'notify.fanout': (data: FanoutJob, now?: Date) => Promise<number>;
  'avatar.mirror': (data: AvatarMirrorJob) => Promise<number>;
  'storage.migrate': (data: StorageMigrateJob, now?: Date) => Promise<number>;
  'import.csv': (data: ImportCsvJob, now?: Date) => Promise<number>;
  'export.org': (data: ExportOrgJob, now?: Date) => Promise<number>;
  'git.process_events': (data: GitEventsJob, now?: Date) => Promise<number>;
  'git.backfill': (data: GitBackfillJob) => Promise<number>;
}

export type QueuedJob = {
  [K in keyof QueuedHandlers]: { name: K; data: Parameters<QueuedHandlers[K]>[0] };
}[keyof QueuedHandlers];

export interface SendOptions {
  startAfter: Date;
  /** One queued job per key: a second send while the first waits is dropped. */
  singletonKey: string;
}

export interface JobQueue {
  send<K extends keyof QueuedHandlers>(
    name: K,
    data: Parameters<QueuedHandlers[K]>[0],
    options: SendOptions,
  ): Promise<void>;
}

/** Tests run no pg-boss: sends are kept here, and a test runs them through `app.queuedHandlers`. */
export interface RecordingQueue extends JobQueue {
  pending: (QueuedJob & { options: SendOptions })[];
}

/** Runs one recorded job through its handler, as pg-boss would once its start time passed. */
export function runQueued(handlers: QueuedHandlers, job: QueuedJob, now?: Date): Promise<number> {
  switch (job.name) {
    case 'notify.fanout':
      return handlers[job.name](job.data, now);
    case 'storage.migrate':
      return handlers[job.name](job.data, now);
    case 'import.csv':
      return handlers[job.name](job.data, now);
    case 'export.org':
      return handlers[job.name](job.data, now);
    case 'git.process_events':
      return handlers[job.name](job.data, now);
    case 'git.backfill':
      return handlers[job.name](job.data);
    case 'avatar.mirror':
      return handlers[job.name](job.data);
  }
}

export function recordingQueue(): RecordingQueue {
  const pending: RecordingQueue['pending'] = [];
  return {
    pending,
    async send(name, data, options) {
      if (pending.some(p => p.name === name && p.options.singletonKey === options.singletonKey)) return;
      pending.push({ name, data, options } as QueuedJob & { options: SendOptions });
    },
  };
}

const SCHEDULES: Record<keyof JobHandlers, string> = {
  'session.gc': JOB_GC_CRON,
  'tokens.gc': JOB_GC_CRON,
  'issues.purge': JOB_PURGE_CRON,
  'attachments.sweep': JOB_SWEEP_CRON,
  'sprint.snapshot': JOB_SNAPSHOT_CRON,
  'notifications.due': JOB_DUE_CRON,
  'email.digest': JOB_DIGEST_CRON,
  'notifications.purge': JOB_NOTIFICATIONS_PURGE_CRON,
  'org.deletion_reminder': JOB_ORG_DELETION_REMINDER_CRON,
  'org.delete': JOB_ORG_DELETE_CRON,
  'storage.reconcile': JOB_RECONCILE_CRON,
  'transfers.sweep': JOB_TRANSFER_SWEEP_CRON,
  'git.purge': JOB_GIT_PURGE_CRON,
  'git.reconcile': JOB_GIT_RECONCILE_CRON,
};

const QUEUE_OPTIONS: Partial<Record<keyof QueuedHandlers, { expireInSeconds: number }>> = {
  'export.org': { expireInSeconds: EXPORT_JOB_EXPIRE_SECONDS },
};

declare module 'fastify' {
  interface FastifyInstance {
    jobHandlers: JobHandlers;
    queuedHandlers: QueuedHandlers;
    jobQueue: JobQueue;
  }
}

export interface Jobs {
  queue: JobQueue;
  stop(): Promise<void>;
}

// Direct URL: pg-boss uses LISTEN/NOTIFY and advisory locks, which pgBouncer breaks.
export async function startJobs(
  databaseUrl: string,
  handlers: JobHandlers,
  queued: QueuedHandlers,
  log: Logger,
): Promise<Jobs> {
  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  boss.on('error', (error: unknown) => log.error({ err: error }, 'pg-boss error'));
  await boss.start();

  for (const name of Object.keys(handlers) as (keyof JobHandlers)[]) {
    await boss.createQueue(name);
    await boss.work(name, async () => {
      const deleted = await handlers[name]();
      log.info({ job: name, deleted }, 'job complete');
    });
    await boss.schedule(name, SCHEDULES[name]);
  }

  for (const name of Object.keys(queued) as (keyof QueuedHandlers)[]) {
    // stately: one queued and one active per key, so writes inside the window share one run.
    await boss.createQueue(name, { policy: 'stately', ...QUEUE_OPTIONS[name] });
    const handler = queued[name] as (data: unknown) => Promise<number>;
    await boss.work(name, async jobs => {
      for (const job of jobs) {
        const written = await handler(job.data);
        log.info({ job: name, written }, 'job complete');
      }
    });
  }

  return {
    queue: {
      async send(name, data, options) {
        await boss.send(name, data, { startAfter: options.startAfter, singletonKey: options.singletonKey });
      },
    },
    stop: () => boss.stop(),
  };
}
