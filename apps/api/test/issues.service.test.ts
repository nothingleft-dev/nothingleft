import { describe, expect, test } from 'bun:test';
import { noopAnalytics } from '@nothingleft/analytics';
import type { IssuesDeps } from '@services/issues.service';
import { issuesService } from '@services/issues.service';

describe('issues.purge', () => {
  test('purges each organisation that has issues deleted more than 14 days ago', async () => {
    const now = new Date('2026-09-24T03:00:00Z');
    const calls: { orgId: number; cutoff: Date }[] = [];
    const issues = {
      async orgsWithDeletedBefore(_ctx: unknown, cutoff: Date) {
        expect(cutoff).toEqual(new Date('2026-09-10T03:00:00Z'));
        return [4, 9];
      },
      async purgeDeletedBefore(ctx: { orgId: number }, cutoff: Date) {
        calls.push({ orgId: ctx.orgId, cutoff });
        return ctx.orgId === 4 ? 2 : 1;
      },
    };
    const repos = {
      issues,
      attachments: { onIssuesDeletedBefore: async () => [] },
      organizations: {},
    };
    const service = issuesService({
      issues,
      inTransaction: (body: (r: typeof repos) => Promise<unknown>) => body(repos),
      access: { storageLimit: () => 1 },
      stores: { deleteObjects: async () => {} },
      analytics: noopAnalytics,
      now: () => now,
    } as unknown as IssuesDeps);

    expect(await service.purgeExpired()).toBe(3);
    expect(calls.map(c => c.orgId)).toEqual([4, 9]);
  });
});
