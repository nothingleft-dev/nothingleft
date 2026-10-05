import type { Queryable } from '@nothingleft/db';
import type { IssueWorld } from './issue-world.ts';

interface HeldTransaction {
  tx: Queryable;
  commit: () => Promise<void>;
}

async function holdTransaction(world: IssueWorld): Promise<HeldTransaction> {
  let release!: () => void;
  const released = new Promise<void>(resolve => (release = resolve));
  let opened!: (tx: Queryable) => void;
  const ready = new Promise<Queryable>(resolve => (opened = resolve));
  const done = world.db.transaction(async tx => {
    opened(tx);
    await released;
  });
  const tx = await ready;
  return {
    tx,
    commit: async () => {
      release();
      await done;
    },
  };
}

/**
 * Opens a transaction and runs `hold` in it, starts `request`, waits until the request queues on a lock,
 * runs `meanwhile` in the held transaction, then commits and returns the request's answer.
 */
export async function queuedBehind<T>(
  world: IssueWorld,
  hold: (tx: Queryable) => Promise<unknown>,
  request: () => Promise<T>,
  meanwhile: (tx: Queryable) => Promise<unknown> = async () => {},
): Promise<T> {
  const held = await holdTransaction(world);
  let pending: Promise<T>;
  try {
    await hold(held.tx);
    pending = request();
    await untilWaitingOnLock(world);
    await meanwhile(held.tx);
  } finally {
    await held.commit();
  }
  return pending;
}

async function untilWaitingOnLock(world: IssueWorld, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await world.db.execute(
      `select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if ((rows[0] as { waiting: number }).waiting > 0) return;
    await Bun.sleep(20);
  }
  throw new Error('no session started waiting on a lock');
}

/** Whether this database's collation folds `İ` onto `i`, which JavaScript's toLowerCase does not. */
export async function databaseFoldsDottedCapitalI(world: IssueWorld): Promise<boolean> {
  const { rows } = await world.db.execute(`select lower('İstanbul') = 'istanbul' as folds`);
  return (rows[0] as { folds: boolean }).folds;
}
