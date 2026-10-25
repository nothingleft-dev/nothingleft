import { describe, expect, test } from 'bun:test';
import { tenantContext } from '@nothingleft/db';
import { automationsService, type AutomationsDeps } from '@services/automations.service';

const ctx = tenantContext(1);
const status = (id: number, name: string, category: string) => ({
  id,
  name,
  category,
  is_archived: false,
  project_id: 10,
});
const STATUSES = [
  status(1, 'Open', 'unstarted'),
  status(2, 'In Progress', 'started'),
  status(3, 'Cancelled', 'cancelled'),
];
const rule = {
  id: 5,
  project_id: 10,
  name: 'Start work',
  trigger: 'git.branch_created',
  conditions: { issue_status_category: ['unstarted'] },
  action: 'issue.set_status',
  action_params: { status: 'In Progress' },
  is_enabled: true,
  updated_at: new Date('2026-10-25T10:00:00Z'),
};
// The same rule, edited while the evaluation waited for the issue: another trigger, another status.
const edited = {
  ...rule,
  trigger: 'git.pull_request_merged',
  action_params: { status: 'Cancelled' },
  updated_at: new Date('2026-10-25T10:00:05Z'),
};
const issue = (statusId: number) => ({ id: 7, project_id: 10, status_id: statusId, deleted_at: null, type_id: 1 });

function harness(lockedStatus: number | 'fails', liveRule: typeof rule = rule) {
  const runs: { result: string; reason: string | null }[] = [];
  const updates: unknown[] = [];
  const automations = {
    enabledFor: async () => [rule],
    recordRun: async (_ctx: unknown, run: { result: string; reason: string | null }) => {
      runs.push(run);
      return { id: runs.length };
    },
    lockById: async () => liveRule,
  };
  const deps = {
    access: {},
    automations,
    projects: { findById: async () => ({ id: 10, is_archived: false }) },
    schema: { list: async () => STATUSES },
    // The first read sees the issue Open; by the time the lock is taken a person has cancelled it.
    issues: { findById: async () => issue(1) },
    organizations: {},
    links: {},
    entities: {},
    repositories: {},
    analytics: { capture: () => {}, captureException: () => {} },
    inTransaction: async (body: (r: unknown) => Promise<unknown>) =>
      body({
        issues: {
          lockById: async () => {
            if (lockedStatus === 'fails') throw new Error('connection lost');
            return issue(lockedStatus);
          },
          update: async (_c: unknown, _id: number, patch: unknown) => updates.push(patch),
        },
        automations,
        projects: { findById: async () => ({ id: 10, is_archived: false }) },
        schema: { list: async () => STATUSES },
        issueActivity: { record: async () => {} },
      }),
  } as unknown as AutomationsDeps;
  return { service: automationsService(deps), runs, updates };
}

const firing = {
  trigger: 'git.branch_created' as const,
  issues: [{ issueId: 7, facts: {} }],
  ref: { branch: 'feat/api-7' },
  cause: 'branch feat/api-7 was created in acme/web',
  causedBy: null,
};

describe('an automation and a person changing the same issue', () => {
  test('a condition that stopped holding by the time of the lock writes nothing', async () => {
    const { service, runs, updates } = harness(3);
    await service.fire(ctx, firing);
    expect(updates).toEqual([]);
    expect(runs).toEqual([expect.objectContaining({ result: 'skipped', reason: 'condition_not_met' })]);
  });

  test('when nothing changed in between, the rule applies', async () => {
    const { service, runs, updates } = harness(1);
    await service.fire(ctx, firing);
    expect(updates).toHaveLength(1);
    expect(runs).toEqual([expect.objectContaining({ result: 'applied' })]);
  });

  test('a rule that fails leaves a failed run, and the issue as it was', async () => {
    const { service, runs, updates } = harness('fails');
    await service.fire(ctx, firing);
    expect(updates).toEqual([]);
    expect(runs).toEqual([expect.objectContaining({ result: 'failed', reason: null })]);
  });

  test('a rule edited while it waited is not applied as it was', async () => {
    const { service, runs, updates } = harness(1, edited);
    await service.fire(ctx, firing);
    expect(updates).toEqual([]);
    expect(runs).toEqual([expect.objectContaining({ result: 'skipped', reason: 'condition_not_met' })]);
  });
});
