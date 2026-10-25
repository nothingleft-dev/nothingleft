import { describe, expect, test } from 'bun:test';
import { noopAnalytics } from '@nothingleft/analytics';
import type { IssuesDeps } from '@services/issues.service';
import { issuesService } from '@services/issues.service';
import { loadCatalogue } from '@services/custom-field-values';
import { ISSUE_EXPORT_PAGE_SIZE, PURGE_BATCH } from '@config/constants';
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
    development: { summaries: async () => ({ enabled: new Set(), byIssue: new Map() }) },
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
