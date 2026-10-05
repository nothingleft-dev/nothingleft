import { describe, expect, test } from 'bun:test';
import { issueRegistry, parse, type Query } from '@nothingleft/query';
import { reportsRepository } from '../src/repositories/reports.repository.ts';
import type { SearchScope } from '../src/repositories/issue-search.repository.ts';
import { sprintsRepository } from '../src/repositories/sprints.repository.ts';
import { workItemsRepository } from '../src/repositories/work-items.repository.ts';
import type { Queryable } from '../src/client.ts';
import { inRolledBackTx, seedIssueWorld } from './fixtures.ts';

const everything: Query = parse('', issueRegistry()).query;
const PERIOD = { from: '2026-09-01', to: '2026-09-30' };

const scopeOf = (projectIds: number[]): SearchScope => ({
  projectIds,
  timezone: 'UTC',
  today: '2026-09-24',
  weekStartsOn: 1,
  now: new Date('2026-09-24T12:00:00Z'),
  calendar: { workdayMinutes: 480, workweekDays: 5 },
});

async function world(tx: Queryable) {
  const base = await seedIssueWorld(tx);
  const { ctxA, ctxB, issueA, issueB, alice, bob } = base;
  const items = workItemsRepository(tx);
  const logged = (issue: typeof issueA, author: number) => ({
    issue_id: issue.id,
    author_id: author,
    created_by: author,
    work_date: '2026-09-21',
    duration_minutes: 90,
    work_type_id: null,
    description_md: '',
  });
  await items.insertMany(ctxA, [logged(issueA, alice)]);
  await items.insertMany(ctxB, [logged(issueB, bob)]);
  return base;
}

describe('reports repository — tenant isolation', () => {
  test('every aggregation reads only the context’s organisation, even given another’s project ids', () =>
    inRolledBackTx(async tx => {
      const { ctxA, ctxB, projectA, projectB, alice, issueA } = await world(tx);
      const repo = reportsRepository(tx);
      const foreign = scopeOf([projectA]);

      const own = await repo.distribution(ctxA, scopeOf([projectA]), everything, 'status');
      expect(own.total).toBe(1);
      const leaked = await repo.distribution(ctxB, foreign, everything, 'status');
      expect(leaked.total).toBe(0);
      expect(leaked.groups).toEqual([]);

      expect(await repo.matrix(ctxB, foreign, everything, 'status', 'type')).toEqual([]);
      expect(await repo.statuses(ctxB, [projectA])).toEqual([]);
      expect(await repo.age(ctxB, foreign, everything, 'status', false)).toEqual([]);
      expect(await repo.age(ctxB, foreign, everything, null, false)).toEqual([]);
      expect(await repo.time(ctxB, foreign, everything, PERIOD, { kind: 'user' })).toEqual([]);
      expect(await repo.timesheet(ctxB, foreign, everything, PERIOD, null)).toEqual([]);
      expect(
        (await repo.timesheetEntries(ctxB, foreign, everything, PERIOD, alice, { limit: 10, offset: 0 })).total,
      ).toBe(0);
      const gantt = await repo.gantt(ctxB, foreign, everything, 'epic', 10);
      expect(gantt.bar_count + gantt.missing_count).toBe(0);
      expect((await repo.issueKeys(ctxB, [issueA.id])).size).toBe(0);

      expect((await repo.time(ctxA, scopeOf([projectA]), everything, PERIOD, { kind: 'project' }))[0]).toMatchObject({
        spent_minutes: 90,
      });
      expect((await repo.timesheet(ctxB, scopeOf([projectB]), everything, PERIOD, null))[0]?.minutes).toBe(90);
      expect((await repo.issueKeys(ctxA, [issueA.id])).get(issueA.id)).toBe('AC-1');
    }));

  test('liveFigures reads only the context’s organisation', () =>
    inRolledBackTx(async tx => {
      const { ctxA, ctxB, projectA, alice } = await world(tx);
      const sprints = sprintsRepository(tx);
      const sprint = await sprints.insert(ctxA, {
        project_id: projectA,
        name: 'S1',
        slug: 's1',
        created_by: alice,
      });
      expect(await sprints.liveFigures(ctxA, sprint.id)).toMatchObject({ total_issues: 0 });
      expect(await sprints.liveFigures(ctxB, sprint.id)).toBeUndefined();
    }));
});
