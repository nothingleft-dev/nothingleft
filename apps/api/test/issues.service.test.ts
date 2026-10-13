import { describe, expect, test } from 'bun:test';
import { noopAnalytics } from '@nothingleft/analytics';
import { PURGE_BATCH } from '@config/constants';
import type { IssuesDeps } from '@services/issues.service';
import { issuesService } from '@services/issues.service';

interface File {
  id: number;
  issue_id: number;
  deleted_at: Date | null;
  completed_at: Date | null;
  storage_target: 'platform';
  size_bytes: number;
}

/** An in-memory organisation set behind stub repositories, recording the order the purge touches things in. */
function purgeWorld(deleted: Record<number, number[]>, filesOf: (issueId: number) => File[] = () => []) {
  const now = new Date('2026-09-24T03:00:00Z');
  const live = new Map(Object.entries(deleted).map(([org, ids]) => [Number(org), new Set(ids)]));
  const log: string[] = [];
  const released: number[] = [];
  let open = false;
  const state = { failDelete: new Set<number>(), restoreDuringDelete: new Set<number>() };

  const issues = {
    async orgsWithDeletedBefore(_ctx: unknown, cutoff: Date) {
      expect(cutoff).toEqual(new Date('2026-09-10T03:00:00Z'));
      return [...live.keys()];
    },
    async idsDeletedBefore(ctx: { orgId: number }, _cutoff: Date, limit: number) {
      expect(open).toBe(true);
      return [...live.get(ctx.orgId)!].slice(0, limit);
    },
    async purgeDeletedBefore(ctx: { orgId: number }, _cutoff: Date, ids: number[]) {
      expect(open).toBe(true);
      const set = live.get(ctx.orgId)!;
      const gone = ids.filter(id => set.has(id));
      for (const id of gone) set.delete(id);
      log.push(`purge ${ctx.orgId}:${gone.length}`);
      return gone;
    },
  };
  const repos = {
    issues,
    attachments: {
      async onIssuesDeletedBefore(_ctx: unknown, _cutoff: Date, ids: number[]) {
        return ids.flatMap(filesOf);
      },
    },
    organizations: {
      async adjustStorageUsed(_ctx: unknown, bytes: number) {
        released.push(-bytes);
        return 0;
      },
      findById: async () => undefined,
    },
  };
  const service = issuesService({
    issues,
    inTransaction: async (body: (r: typeof repos) => Promise<unknown>) => {
      open = true;
      try {
        return await body(repos);
      } finally {
        open = false;
      }
    },
    access: { storageLimit: () => 1 },
    stores: {
      async deleteObjects(ctx: { orgId: number }, files: File[]) {
        expect(open).toBe(false);
        log.push(`delete ${ctx.orgId}:${files.length}`);
        if (state.failDelete.has(ctx.orgId)) throw new Error('bucket unreachable');
        for (const f of files) if (state.restoreDuringDelete.has(f.issue_id)) live.get(ctx.orgId)!.delete(f.issue_id);
      },
    },
    analytics: noopAnalytics,
    now: () => now,
  } as unknown as IssuesDeps);

  return { service, live, log, released, state };
}

const file = (id: number, issueId: number, over: Partial<File> = {}): File => ({
  id,
  issue_id: issueId,
  deleted_at: null,
  completed_at: new Date(),
  storage_target: 'platform',
  size_bytes: 100,
  ...over,
});

describe('issues.purge', () => {
  test('purges each organisation that has issues deleted more than 14 days ago', async () => {
    const w = purgeWorld({ 4: [1, 2], 9: [3] });
    expect(await w.service.purgeExpired()).toBe(3);
    expect(w.log.filter(l => l.startsWith('purge'))).toEqual(['purge 4:2', 'purge 9:1']);
  });

  test('objects go first, outside any transaction, and the rows after they are gone', async () => {
    const w = purgeWorld({ 4: [1] }, id => [file(id * 10, id)]);
    expect(await w.service.purgeExpired()).toBe(1);
    expect(w.log).toEqual(['delete 4:1', 'purge 4:1']);
    expect(w.released).toEqual([100]);
  });

  test('a failing bucket leaves its rows and bytes for the next run, and other organisations go on', async () => {
    const w = purgeWorld({ 4: [1], 9: [2] }, id => [file(id * 10, id)]);
    w.state.failDelete.add(4);
    expect(await w.service.purgeExpired()).toBe(1);
    expect([...w.live.get(4)!]).toEqual([1]);
    expect(w.log).toEqual(['delete 4:1', 'delete 9:1', 'purge 9:1']);
    expect(w.released).toEqual([100]);
  });

  test('an issue restored between the claim and the purge keeps its row and its bytes', async () => {
    const w = purgeWorld({ 4: [1, 2] }, id => [file(id * 10, id), file(id * 10 + 1, id, { deleted_at: new Date() })]);
    w.state.restoreDuringDelete.add(2);
    expect(await w.service.purgeExpired()).toBe(1);
    expect(w.released).toEqual([100]);
  });

  test('more than a batch is purged across batches in one run', async () => {
    const ids = Array.from({ length: PURGE_BATCH * 2 + 3 }, (_, i) => i + 1);
    const w = purgeWorld({ 4: ids });
    expect(await w.service.purgeExpired()).toBe(ids.length);
    expect(w.log.filter(l => l.startsWith('purge'))).toEqual([
      `purge 4:${PURGE_BATCH}`,
      `purge 4:${PURGE_BATCH}`,
      'purge 4:3',
    ]);
    expect(w.live.get(4)!.size).toBe(0);
  });
});
