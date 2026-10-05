import { describe, expect, test } from 'bun:test';
import { issueRegistry, parse, sortKeysOf, type Query } from '@nothingleft/query';
import { issueSearchRepository, type SearchScope } from '../src/repositories/issue-search.repository.ts';
import { issuesRepository } from '../src/repositories/issues.repository.ts';
import { projectSchemaRepository } from '../src/repositories/project-schema.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import { sprintsRepository } from '../src/repositories/sprints.repository.ts';
import { schema } from '../src/index.ts';
import type { Queryable } from '../src/client.ts';
import type { TenantContext } from '../src/tenant-context.ts';
import { inRolledBackTx, seedIssueWorld } from './fixtures.ts';

const registry = issueRegistry();
const q = (text: string): Query => parse(text, registry).query;
const NOW = new Date('2026-09-24T12:00:00Z');

const scopeOf = (projectIds: number[]): SearchScope => ({
  projectIds,
  timezone: 'Asia/Kolkata',
  today: '2026-09-24',
  weekStartsOn: 1,
  now: NOW,
  calendar: { workdayMinutes: 480, workweekDays: 5 },
});

async function world(tx: Queryable) {
  const base = await seedIssueWorld(tx);
  const issues = issuesRepository(tx);
  const configs = projectSchemaRepository(tx);
  const projects = projectsRepository(tx);
  const { ctxA, projectA, alice } = base;
  const statuses = await configs.list(ctxA, 'statuses', projectA);
  const priorities = await configs.list(ctxA, 'priorities', projectA);
  const types = await configs.list(ctxA, 'types', projectA);
  const named = <T extends { name: string }>(rows: T[], name: string) => rows.find(r => r.name === name)!;

  const add = async (title: string, fields: Partial<typeof schema.issues.$inferInsert> = {}) =>
    issues.insert(ctxA, {
      project_id: projectA,
      key_number: await projects.claimIssueNumber(ctxA, projectA),
      title,
      status_id: named(statuses, 'Open').id,
      priority_id: named(priorities, 'Normal').id,
      type_id: named(types, 'Bug').id,
      created_by: alice,
      updated_by: alice,
      created_at: new Date('2026-09-20T10:00:00Z'),
      ...fields,
    });

  const fixed = await add('Crash on rotate in visit notes', {
    status_id: named(statuses, 'Fixed').id,
    priority_id: named(priorities, 'Critical').id,
    resolved_at: new Date('2026-09-23T10:00:00Z'),
    due_date: '2026-09-22',
    story_points: 5,
  });
  const progress = await add('Tag merge dialog', {
    status_id: named(statuses, 'In Progress').id,
    type_id: named(types, 'Feature').id,
    due_date: '2026-09-24',
    estimate_minutes: 240,
    parent_id: fixed.id,
    description_md: 'Merging two tags keeps every issue',
  });
  const open = await add('Timesheet report: week starts Monday', {
    due_date: '2026-10-03',
    created_at: new Date('2026-09-24T02:00:00Z'),
  });
  await issues.addAssignees(ctxA, progress.id, [alice]);
  await issues.star(ctxA, open.id, alice);
  await tx.insert(schema.comments).values({
    org_id: ctxA.orgId,
    issue_id: open.id,
    author_id: alice,
    body_md: 'Redirect loop seen on staging',
    created_at: NOW,
  });
  const [tag] = await tx
    .insert(schema.tags)
    .values({ org_id: ctxA.orgId, name: 'Needs Review', slug: 'needs-review', color: 'blue-2', created_by: alice })
    .returning();
  await tx.insert(schema.issue_tags).values({ org_id: ctxA.orgId, issue_id: progress.id, tag_id: tag!.id });
  await tx.insert(schema.issue_links).values({
    org_id: ctxA.orgId,
    from_issue_id: open.id,
    to_issue_id: progress.id,
    type: 'depends',
    created_by: alice,
  });
  // AC-1 from the world: Submitted, Show-stopper, Bug, no due date.
  return { ...base, fixed, progress, open };
}

async function keys(tx: Queryable, ctx: TenantContext, projectIds: number[], text: string, sort?: string) {
  const repo = issueSearchRepository(tx);
  const query = q(sort ? `${text} sort by: ${sort}` : text);
  const result = await repo.search(ctx, scopeOf(projectIds), query, {
    sort: sortKeysOf(query),
    limit: 50,
    offset: 0,
  });
  return result.entries.map(e => e.row.key_number);
}

describe('issueSearchRepository.search', () => {
  test('attributes, negation, categories, people and text compile to the right rows', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, projectA } = await world(tx);
      const find = (text: string) => keys(tx, ctxA, [projectA], text, 'key');
      expect(await find('')).toEqual([1, 2, 3, 4]);
      expect(await find('status: Open')).toEqual([4]);
      expect(await find('status: open, {in progress}')).toEqual([3, 4]);
      expect(await find('status: -Open')).toEqual([1, 2, 3]);
      expect(await find('#Resolved')).toEqual([2]);
      expect(await find('#Unresolved')).toEqual([1, 3, 4]);
      expect(await find('status: -Resolved')).toEqual([1, 3, 4]);
      expect(await find('#Critical')).toEqual([2]);
      expect(await find('#{needs review}')).toEqual([3]);
      expect(await find('tag: needs-review')).toEqual([3]);
      expect(await find('tag: -{Needs Review}')).toEqual([1, 2, 4]);
      expect(await find('assignee: me')).toEqual([3]);
      expect(await find('assignee: Unassigned')).toEqual([1, 2, 4]);
      expect(await find('has: assignee')).toEqual([3]);
      expect(await find('#Star')).toEqual([4]);
      expect(await find('type: Feature')).toEqual([3]);
      expect(await find('project: AC')).toEqual([1, 2, 3, 4]);
      expect(await find('project: acme')).toEqual([1, 2, 3, 4]);
      expect(await find('key: AC-2, AC-3')).toEqual([2, 3]);
      expect(await find('rotate')).toEqual([2]);
      expect(await find('"visit notes"')).toEqual([2]);
      expect(await find('merging')).toEqual([3]);
      expect(await find('the')).toEqual([1, 2, 3, 4]);
      expect(await find('AC-4')).toEqual([4]);
      expect(await find('comments: {redirect loop}')).toEqual([4]);
      expect(await find('has: comments')).toEqual([4]);
      expect(await find('has: -description')).toEqual([1, 2, 4]);
      expect(await find('story points: 3 .. 8')).toEqual([2]);
      expect(await find('estimation: .. {4h}')).toEqual([3]);
      expect(await find('estimation: {No estimation}')).toEqual([1, 2, 4]);
      expect(await find('sprint: {No sprint}')).toEqual([1, 2, 3, 4]);
    });
  });

  test('sprint: by name or slug, #{Sprint}, {No sprint}, containers in rank order, status counts', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, projectA, alice, fixed, progress, open } = await world(tx);
      const issues = issuesRepository(tx);
      const sprint = await sprintsRepository(tx).insert(ctxA, {
        project_id: projectA,
        name: 'September 2026',
        slug: 'september-2026',
        created_by: alice,
      });
      await issues.place(ctxA, [
        { id: open.id, sprint_id: sprint.id, rank: 1 },
        { id: progress.id, sprint_id: sprint.id, rank: 2 },
        { id: fixed.id, sprint_id: null, rank: null },
      ]);
      const find = (text: string) => keys(tx, ctxA, [projectA], text, 'key');
      expect(await find('sprint: {September 2026}')).toEqual([3, 4]);
      expect(await find('sprint: september-2026')).toEqual([3, 4]);
      expect(await find('#{september 2026}')).toEqual([3, 4]);
      expect(await find('sprint: {No sprint}')).toEqual([1, 2]);
      expect(await find('has: sprint')).toEqual([3, 4]);
      expect(await find('sprint: -{September 2026}')).toEqual([1, 2]);

      const repo = issueSearchRepository(tx);
      const inSprint = await repo.search(ctxA, scopeOf([projectA]), q(''), {
        sort: [],
        container: { projectId: projectA, sprintId: sprint.id },
        limit: 50,
        offset: 0,
      });
      expect(inSprint.entries.map(e => e.row.key_number)).toEqual([4, 3]);
      const counts = await repo.valueCounts(ctxA, scopeOf([projectA]), q(''), {
        projectId: projectA,
        sprintId: sprint.id,
      });
      const byPriority = await repo.valueCounts(
        ctxA,
        scopeOf([projectA]),
        q(''),
        { projectId: projectA, sprintId: sprint.id },
        'priority',
      );
      expect(byPriority.reduce((n, c) => n + c.n, 0)).toBe(2);
      expect(counts.reduce((n, c) => n + c.n, 0)).toBe(2);
      expect(
        await repo.valueCounts(ctxB, scopeOf([projectA]), q(''), { projectId: projectA, sprintId: sprint.id }),
      ).toEqual([]);
      const grouped = await repo.search(ctxA, scopeOf([projectA]), q(''), {
        sort: [],
        groupBy: 'sprint',
        limit: 50,
        offset: 0,
      });
      expect(grouped.groups!.map(g => [g.value, g.count])).toEqual([
        ['September 2026', 2],
        [null, 2],
      ]);
      const vocabulary = await repo.vocabulary(ctxA, [projectA], new Set(['sprint']));
      expect(vocabulary.sprints).toEqual([{ name: 'September 2026', slug: 'september-2026' }]);
      expect((await repo.vocabulary(ctxB, [projectA], new Set(['sprint']))).sprints).toEqual([]);
      expect(await repo.suggestValues(ctxA, [projectA], 'sprint', 'sep', 10)).toEqual(['September 2026']);
      expect(await repo.suggestValues(ctxB, [projectA], 'sprint', 'sep', 10)).toEqual([]);
    });
  });

  test('calendar dates are literal and instants resolve in the user timezone', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, projectA } = await world(tx);
      const find = (text: string) => keys(tx, ctxA, [projectA], text, 'key');
      expect(await find('due date: Today')).toEqual([3]);
      expect(await find('due date: .. Yesterday')).toEqual([2]);
      expect(await find('due date: {No due date}')).toEqual([1]);
      expect(await find('due date: -Today')).toEqual([1, 2, 4]);
      expect(await find('due date: {Next week}')).toEqual([4]);
      expect(await find('due date: 2026-09')).toEqual([2, 3]);
      // 02:00 UTC on the 24th is 07:30 in Kolkata: today, not yesterday.
      const today = await find('created: Today');
      expect(today).toContain(4);
      expect(today).not.toContain(2);
      expect(await find('created: 2026-09-20')).toEqual([2, 3]);
      expect(await find('resolved date: {minus 3d} .. Now')).toEqual([2]);
      expect(await find('resolved date: Unresolved')).toEqual([1, 3, 4]);
    });
  });

  test('links and aggregate traversal follow parent_id and issue_links', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, projectA } = await world(tx);
      const find = (text: string) => keys(tx, ctxA, [projectA], text, 'key');
      expect(await find('subtask of: AC-2')).toEqual([3]);
      expect(await find('parent for: AC-3')).toEqual([2]);
      expect(await find('depends on: AC-4')).toEqual([3]);
      expect(await find('is required for: AC-3')).toEqual([4]);
      expect(await find('aggregate Subtask of: {#Resolved}')).toEqual([3]);
      expect(await find('aggregate Parent for: {status: {In Progress}}')).toEqual([2]);
      expect(await find('aggregate Depends on: {#Star}')).toEqual([3]);
      expect(await find('depends on: -AC-4')).toEqual([1, 2, 4]);
    });
  });

  test('comments, work items, attachments and people attributes', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, projectA, alice, bob, fixed, progress } = await world(tx);
      const [workType] = await projectSchemaRepository(tx).list(ctxA, 'work_types', projectA);
      await tx.insert(schema.work_items).values({
        org_id: ctxA.orgId,
        project_id: projectA,
        issue_id: fixed.id,
        author_id: alice,
        created_by: alice,
        work_date: '2026-09-23',
        duration_minutes: 90,
        work_type_id: workType!.id,
        description_md: '',
      });
      await tx.insert(schema.attachments).values({
        org_id: ctxA.orgId,
        issue_id: progress.id,
        filename: 'Screenshot 2026.PNG',
        mime_type: 'image/png',
        size_bytes: 10,
        checksum: Buffer.alloc(32),
        storage_target: 'platform',
        bucket: 'b',
        object_key: 'k',
        created_by: alice,
      });
      await tx.insert(schema.issue_links).values({
        org_id: ctxA.orgId,
        from_issue_id: fixed.id,
        to_issue_id: progress.id,
        type: 'relates',
        created_by: alice,
      });
      const find = (text: string) => keys(tx, ctxA, [projectA], text, 'key');
      const username = (await tx.select().from(schema.org_members)).find(m => m.user_id === alice)!.username;
      expect(await find(`commenter: ${username}`)).toEqual([4]);
      expect(await find('commenter: me')).toEqual([4]);
      expect(await find('commented: Today')).toEqual([4]);
      expect(await find('work author: me')).toEqual([2]);
      expect(await find(`work type: {${workType!.name}}`)).toEqual([2]);
      expect(await find('has: {work author}')).toEqual([2]);
      expect(await find('attachments: screenshot')).toEqual([3]);
      expect(await find('has: attachments')).toEqual([3]);
      expect(await find('relates to: AC-2')).toEqual([3]);
      expect(await find('relates to: AC-3')).toEqual([2]);
      expect(await find(`created by: @${username}`)).toEqual([1, 2, 3, 4]);
      expect(await find('updated by: -me')).toEqual([]);
      expect(await find('votes: 0')).toEqual([1, 2, 3, 4]);
      expect(await keys(tx, ctxA, [projectA], `created by: ${bob}`)).toEqual([]);
    });
  });

  test('sort keys, default order and relevance', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, projectA } = await world(tx);
      expect(await keys(tx, ctxA, [projectA], '', 'priority')).toEqual([1, 2, 4, 3]);
      expect(await keys(tx, ctxA, [projectA], '', '{due date} desc')).toEqual([4, 3, 2, 1]);
      expect((await keys(tx, ctxA, [projectA], ''))[0]).toBe(1);
    });
  });

  test('groups count the whole filtered set, and a multi-valued group repeats the issue', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, projectA } = await world(tx);
      const repo = issueSearchRepository(tx);
      const status = await repo.search(ctxA, scopeOf([projectA]), q('#Unresolved'), {
        sort: [],
        groupBy: 'status',
        limit: 1,
        offset: 0,
      });
      expect(status.groups!.map(g => [g.value, g.count])).toEqual([
        ['Submitted', 1],
        ['Open', 1],
        ['In Progress', 1],
      ]);
      expect(status.groups!.map(g => g.category)).toEqual(['backlog', 'unstarted', 'started']);
      expect(status.total).toBe(3);
      expect(status.entries.map(e => e.group)).toEqual(['Submitted']);

      const due = await repo.search(ctxA, scopeOf([projectA]), q(''), {
        sort: [],
        groupBy: 'due',
        limit: 10,
        offset: 0,
      });
      expect(due.groups!.map(g => [g.key, g.count])).toEqual([
        ['overdue', 1],
        ['today', 1],
        ['later', 1],
        ['', 1],
      ]);
      const assignee = await repo.search(ctxA, scopeOf([projectA]), q(''), {
        sort: [],
        groupBy: 'assignee',
        limit: 10,
        offset: 0,
      });
      expect(assignee.groups!.map(g => g.count)).toEqual([1, 3]);
      expect(assignee.groups!.at(-1)!.key).toBe('');
    });
  });

  test('scope and tenancy: nothing outside the readable projects or the organisation', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, projectA, projectB } = await world(tx);
      expect(await keys(tx, ctxA, [], '')).toEqual([]);
      expect(await keys(tx, ctxB, [projectA], '')).toEqual([]);
      expect(await keys(tx, ctxA, [projectB], '')).toEqual([]);
      expect(await keys(tx, ctxB, [projectB], '')).toEqual([1]);
      expect(await keys(tx, ctxB, [projectB], 'aggregate Parent for: {project: AC}')).toEqual([]);
      const repo = issueSearchRepository(tx);
      const figures = await repo.figures(ctxB, scopeOf([projectA]), q(''), { perProject: false });
      expect(figures[0]!.open).toBe(0);
      const vocab = await repo.vocabulary(ctxB, [projectA], new Set(['status', 'tag', 'user', 'project']));
      expect(vocab.statuses).toEqual([]);
      expect(vocab.tags).toEqual([]);
      expect(vocab.projects).toEqual([]);
      expect(vocab.usernames.every(u => u.username.startsWith('bob-'))).toBe(true);
      expect(await repo.suggestValues(ctxB, [projectA], 'status', 'o', 10)).toEqual([]);
      expect(await repo.suggestValues(ctxA, [projectA], 'status', 'prog', 10)).toEqual(['In Progress']);
    });
  });

  test('figures: open, unassigned, overdue, 7-day windows, categories and assignees', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, projectA, alice } = await world(tx);
      const repo = issueSearchRepository(tx);
      const [all] = await repo.figures(ctxA, scopeOf([projectA]), q(''), { perProject: false });
      expect(all).toMatchObject({
        project_id: null,
        open: 3,
        unassigned: 2,
        overdue: 0,
        due_today: 1,
        resolved_7d: 1,
        resolved_prev_7d: 0,
      });
      expect(all!.by_category).toMatchObject({ backlog: 1, unstarted: 1, started: 1, done: 1, cancelled: 0 });
      expect(all!.by_assignee).toEqual([{ user_id: alice, open: 1 }]);
      const perProject = await repo.figures(ctxA, scopeOf([projectA]), q('#Unresolved'), { perProject: true });
      expect(perProject.map(p => p.project_id)).toEqual([projectA]);
    });
  });
});
