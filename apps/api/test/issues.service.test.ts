import { describe, expect, test } from 'bun:test';
import { noopAnalytics } from '@nothingleft/analytics';
import type { IssuesDeps } from '@services/issues.service';
import { issuesService } from '@services/issues.service';
import { loadCatalogue } from '@services/custom-field-values';
import { ISSUE_EXPORT_PAGE_SIZE } from '@config/constants';
import type { Principal } from '@nothingleft/types';
import type { TenantContext } from '@nothingleft/db';

const AT = new Date('2026-09-24T03:00:00Z');
const status = { id: 11, project_id: 1, name: 'Open', category: 'unstarted', color: 'blue', short_label: 'OP' };
const priority = { id: 12, project_id: 1, name: 'Normal', color: 'gray', short_label: 'NO' };
const type = { id: 13, project_id: 1, name: 'Bug', icon: 'bug', color: 'red', short_label: 'BG' };
const field = {
  id: 21,
  project_id: 1,
  slug: 'size',
  name: 'Size',
  type: 'number',
  is_archived: false,
  empty_label: null,
};

const issueRow = (id: number) => ({
  id,
  org_id: 1,
  project_id: 1,
  key_number: id,
  title: `Issue ${id}`,
  description_md: null,
  status_id: status.id,
  priority_id: priority.id,
  type_id: type.id,
  sprint_id: null,
  parent_id: null,
  rank: null,
  estimate_minutes: null,
  spent_minutes: 0,
  story_points: null,
  start_date: null,
  due_date: null,
  resolved_at: null,
  vote_count: 0,
  comment_count: 0,
  created_by: 7,
  updated_by: 7,
  created_at: AT,
  updated_at: AT,
  deleted_at: null,
});

/** Repositories that answer from memory and count the catalogue and schema reads. */
function hydrationWorld(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, i) => issueRow(i + 1));
  const calls = { catalogue: 0, schema: 0, pages: [] as { limit: number; offset: number }[] };
  const user = {
    id: 7,
    name: 'Alex Lee',
    avatar_url: null,
    avatar_object_key: null,
    deactivated_at: null,
    deleted_at: null,
  };
  const membership = { username: 'alex', removed_at: null };
  const deps = {
    access: {
      memberRef: (u: typeof user, m: typeof membership | null) => ({
        username: m?.username ?? '',
        name: u.name,
        avatar_url: null,
        former_member: m === null,
        deactivated: false,
      }),
      require: () => undefined,
    },
    schema: {
      async listForProjects(_ctx: unknown, name: 'statuses' | 'priorities' | 'types') {
        calls.schema += 1;
        return { statuses: [status], priorities: [priority], types: [type] }[name];
      },
    },
    issues: {
      listAssignees: async (_ctx: unknown, ids: number[]) =>
        ids.filter(id => id % 2 === 0).map(issue_id => ({ issue_id, user, membership })),
      findPeople: async () => [{ user, membership }],
      signalsFor: async () => new Map(),
      watcherCounts: async () => new Map(),
      keyNumbers: async () => new Map(),
      subtaskProgress: async () => new Map(),
      storyPointsRollup: async () => new Map(),
    },
    tags: {
      listForIssues: async (_ctx: unknown, ids: number[]) =>
        ids.map(issue_id => ({ issue_id, tag: { name: 'Mobile', slug: 'mobile', color: 'amber' } })),
    },
    attachments: { readyCounts: async () => new Map() },
    sprints: { findByIds: async () => [] },
    customFields: {
      async listForProjects() {
        calls.catalogue += 1;
        return [field];
      },
      async timeRoles() {
        calls.catalogue += 1;
        return [{ project_id: 1, estimation_field_id: null, spent_time_field_id: null }];
      },
      listOptions: async () => [],
      listAppliesTo: async () => [],
      listValues: async (_ctx: unknown, ids: number[]) =>
        ids.map(issue_id => ({ issue_id, field_id: field.id, value_number: issue_id * 10, user_id: null })),
    },
    issueSearch: {
      async page(_ctx: unknown, _scope: unknown, _query: unknown, options: { limit: number; offset: number }) {
        calls.pages.push({ limit: options.limit, offset: options.offset });
        return rows.slice(options.offset, options.offset + options.limit);
      },
    },
    analytics: noopAnalytics,
  };
  return { rows, calls, deps };
}

const principal = { userId: 7, via: 'session' } as Principal;
const ctx = { orgId: 1, userId: 7 } as TenantContext;
const projectsById = new Map([[1, { key: 'AC', name: 'Acme' }]]);

describe('issues hydration', () => {
  test('a supplied catalogue and schema lists are not loaded again, and the DTOs come out the same', async () => {
    const { rows, calls, deps } = hydrationWorld(3);
    const service = issuesService(deps as unknown as IssuesDeps);
    const loaded = await service.dtosMany(principal, ctx, rows as never, projectsById);
    expect(calls).toMatchObject({ catalogue: 2, schema: 3 });

    const catalogue = await loadCatalogue(deps.customFields as never, ctx, [1]);
    calls.catalogue = 0;
    calls.schema = 0;
    const preloaded = await service.dtosMany(principal, ctx, rows as never, projectsById, {
      catalogue,
      values: { statuses: [status], priorities: [priority], types: [type] } as never,
    });
    expect(calls).toMatchObject({ catalogue: 0, schema: 0 });
    expect(JSON.stringify(preloaded)).toBe(JSON.stringify(loaded));
    expect(preloaded.map(i => [i.key, i.assignees.length, i.tags.length, i.custom_fields[0]?.value])).toEqual([
      ['AC-1', 0, 1, 10],
      ['AC-2', 1, 1, 20],
      ['AC-3', 0, 1, 30],
    ]);
  });
});

describe('issues.exportCsv', () => {
  const exportWorld = (rowCount: number) => {
    const world = hydrationWorld(rowCount);
    const catalogue = { fields: [field], options: new Map(), appliesTo: new Map(), roles: new Map() };
    const search = {
      context: async () => ({
        org: { scope: {}, organization: { id: 1, slug: 'acme' } },
        ctx,
        projects: [{ id: 1, key: 'AC', name: 'Acme' }],
        catalogue,
        scope: { projectIds: [1], today: '2026-09-24', calendar: { workdayMinutes: 480, workweekDays: 5 } },
      }),
      compile: async () => ({ query: { clauses: [] }, sort: [], text: '' }),
    };
    const service = issuesService({ ...world.deps, search } as unknown as IssuesDeps);
    const lines = async () => {
      const { rows } = await service.exportCsv(principal, { columns: ['key', 'custom:size'] });
      const out: string[] = [];
      for await (const line of rows) out.push(line);
      return out;
    };
    return { ...world, lines };
  };

  test('a full last page ends the export without fetching an empty one', async () => {
    const { calls, lines } = exportWorld(ISSUE_EXPORT_PAGE_SIZE);
    const out = await lines();
    expect(out).toHaveLength(ISSUE_EXPORT_PAGE_SIZE + 1);
    expect(calls.pages).toHaveLength(1);
    expect(calls.catalogue).toBe(0);
  });

  test('pages run on until a short one, loading the schema lists once', async () => {
    const { calls, lines } = exportWorld(ISSUE_EXPORT_PAGE_SIZE + 1);
    const out = await lines();
    expect(out).toHaveLength(ISSUE_EXPORT_PAGE_SIZE + 2);
    expect(out.at(-1)).toBe(`AC-${ISSUE_EXPORT_PAGE_SIZE + 1},${(ISSUE_EXPORT_PAGE_SIZE + 1) * 10}\r\n`);
    expect(calls.pages.map(p => p.offset)).toEqual([0, ISSUE_EXPORT_PAGE_SIZE]);
    expect(calls).toMatchObject({ catalogue: 0, schema: 3 });
  });
});

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
