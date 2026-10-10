import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { systemContext } from '../src/tenant-context.ts';
import { exportJobsRepository } from '../src/repositories/export-jobs.repository.ts';
import { importJobsRepository } from '../src/repositories/import-jobs.repository.ts';
import { orgExportRepository, ORG_EXPORT_TABLES } from '../src/repositories/org-export.repository.ts';
import { issuesRepository } from '../src/repositories/issues.repository.ts';
import { tagsRepository } from '../src/repositories/tags.repository.ts';
import { savedViewsRepository } from '../src/repositories/saved-views.repository.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld, violationInSavepoint } from './fixtures.ts';

const sys = systemContext('test');
const job = (projectId: number, created_by: number) => ({
  project_id: projectId,
  created_by,
  filename: 'issues.csv',
  size_bytes: 10,
  sha256: 'x'.repeat(43) + '=',
});

describe('importJobsRepository tenant isolation', () => {
  test('find, list, update and transition never reach another organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = importJobsRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = await seedIssueWorld(tx);
      const a = await repo.insert(ctxA, job(projectA, alice));
      const b = await repo.insert(ctxB, job(projectB, bob));

      expect(await repo.find(ctxB, projectA, a.id)).toBeUndefined();
      expect(await repo.findById(ctxB, a.id)).toBeUndefined();
      expect((await repo.find(ctxA, projectA, a.id))?.id).toBe(a.id);
      expect((await repo.list(ctxA, projectA, 10)).map(r => r.id)).toEqual([a.id]);
      expect(await repo.list(ctxB, projectA, 10)).toEqual([]);
      expect(await repo.update(ctxB, a.id, { status: 'ready' })).toBeUndefined();
      expect(await repo.transition(ctxB, a.id, ['awaiting_upload'], { status: 'ready' })).toBeUndefined();
      expect((await repo.transition(ctxA, a.id, ['awaiting_upload'], { status: 'ready' }))?.status).toBe('ready');
      expect(await repo.transition(ctxA, a.id, ['awaiting_upload'], { status: 'queued' })).toBeUndefined();
      expect((await repo.findById(ctxB, b.id))?.status).toBe('awaiting_upload');
    });
  });

  test('a job belongs to a project of its own organisation', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, alice, projectB } = await seedIssueWorld(tx);
      expect(await failsInSavepoint(tx, sp => importJobsRepository(sp).insert(ctxA, job(projectB, alice)))).toBe(true);
    });
  });

  test('objectKeys is per organisation; the sweep sees spent files across them', async () => {
    await inRolledBackTx(async tx => {
      const repo = importJobsRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = await seedIssueWorld(tx);
      const a = await repo.insert(ctxA, { ...job(projectA, alice), object_key: 'api/a/import/1/x' });
      const b = await repo.insert(ctxB, { ...job(projectB, bob), object_key: 'api/b/import/2/y' });
      expect(await repo.objectKeys(ctxA)).toEqual(['api/a/import/1/x']);
      await repo.update(ctxB, b.id, { status: 'completed' });
      const sweepable = await repo.listSweepable(sys, new Date(0), 1000);
      expect(sweepable.some(r => r.id === b.id)).toBe(true);
      expect(sweepable.some(r => r.id === a.id)).toBe(false);
    });
  });
});

describe('exportJobsRepository tenant isolation', () => {
  test('one pending export per organisation, independently of the other', async () => {
    await inRolledBackTx(async tx => {
      const repo = exportJobsRepository(tx);
      const { ctxA, ctxB, alice, bob } = await seedIssueWorld(tx);
      const a = await repo.insertPending(ctxA, alice);
      expect(a).toBeDefined();
      expect(await repo.insertPending(ctxA, alice)).toBeUndefined();
      expect((await repo.findPending(ctxA))?.id).toBe(a!.id);
      const b = await repo.insertPending(ctxB, bob);
      expect(b).toBeDefined();
      expect(await repo.find(ctxB, a!.id)).toBeUndefined();
      expect((await repo.list(ctxB, 10)).map(r => r.id)).toEqual([b!.id]);
      expect(await repo.transition(ctxB, a!.id, ['queued'], { status: 'running' })).toBeUndefined();
      await repo.transition(ctxA, a!.id, ['queued'], { status: 'completed', object_key: 'k', expires_at: new Date(0) });
      expect(await repo.insertPending(ctxA, alice)).toBeDefined();
      expect(await repo.objectKeys(ctxB)).toEqual([]);
      expect((await repo.listExpired(sys, new Date(), 1000)).some(r => r.id === a!.id)).toBe(true);
    });
  });

  test('a second pending row is refused by the index itself', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, alice } = await seedIssueWorld(tx);
      await exportJobsRepository(tx).insertPending(ctxA, alice);
      const violation = await violationInSavepoint(tx, sp =>
        sp.execute(sql`insert into export_jobs (org_id, created_by) values (${ctxA.orgId}, ${alice})`),
      );
      expect(violation?.constraint).toBe('export_jobs_one_pending_per_org');
    });
  });
});

describe('orgExportRepository tenant isolation', () => {
  test('every table, the organisation, members, issues and files are read from one organisation only', async () => {
    await inRolledBackTx(async tx => {
      const repo = orgExportRepository(tx);
      const { ctxA, ctxB, orgA, issueA, issueB } = await seedIssueWorld(tx);
      expect((await repo.organization(ctxA))?.id).toBe(orgA);
      const members = await repo.members(ctxA);
      expect(members.length).toBeGreaterThan(0);
      expect(members.every(m => !('password_hash' in m))).toBe(true);

      for (const name of Object.keys(ORG_EXPORT_TABLES) as (keyof typeof ORG_EXPORT_TABLES)[]) {
        const rows = await repo.page(ctxA, name, { afterId: 0, offset: 0 }, 10_000);
        expect(
          rows.every(r => r.org_id === ctxA.orgId),
          name,
        ).toBe(true);
        expect(
          rows.some(r => 'search_tsv' in r),
          name,
        ).toBe(false);
      }
      const issues = await repo.page(ctxA, 'issues', { afterId: 0, offset: 0 }, 100);
      expect(issues.map(r => r.id)).toContain(issueA.id);
      expect(issues.map(r => r.id)).not.toContain(issueB.id);
      expect((await repo.issuesAfter(ctxB, 0, 100)).map(r => r.id)).toEqual([issueB.id]);
      expect(await repo.attachmentsAfter(ctxB, 0, 100)).toEqual([]);
    });
  });

  test('a deleted issue and its rows are left out', async () => {
    await inRolledBackTx(async tx => {
      const repo = orgExportRepository(tx);
      const { ctxA, issueA } = await seedIssueWorld(tx);
      await issuesRepository(tx).update(ctxA, issueA.id, { deleted_at: new Date() });
      expect(await repo.issuesAfter(ctxA, 0, 100)).toEqual([]);
      expect(await repo.page(ctxA, 'issue_activity', { afterId: 0, offset: 0 }, 100)).toEqual([]);
    });
  });
});

describe('tag management queries never cross organisations', () => {
  test('listWithUsage, update, mergeInto and deleteTag', async () => {
    await inRolledBackTx(async tx => {
      const repo = tagsRepository(tx);
      const { ctxA, ctxB, alice, bob, issueA } = await seedIssueWorld(tx);
      await repo.insertMissing(ctxA, [
        { name: 'one', slug: 'one', color: 'red-1', created_by: alice },
        { name: 'two', slug: 'two', color: 'red-1', created_by: alice },
      ]);
      await repo.insertMissing(ctxB, [{ name: 'one', slug: 'one', color: 'red-1', created_by: bob }]);
      const [one, two] = await repo.findBySlugs(ctxA, ['one', 'two']).then(r => r.sort((a, b) => a.id - b.id));
      const [oneB] = await repo.findBySlugs(ctxB, ['one']);
      await repo.apply(ctxA, issueA.id, [one!.id, two!.id]);

      const listed = await repo.listWithUsage(ctxA, { limit: 10, offset: 0 });
      expect(listed.rows.map(r => [r.tag.slug, r.issue_count])).toEqual([
        ['one', 1],
        ['two', 1],
      ]);
      expect((await repo.listWithUsage(ctxB, { limit: 10, offset: 0 })).rows.map(r => r.issue_count)).toEqual([0]);

      expect(await repo.update(ctxB, one!.id, { name: 'x' })).toBeUndefined();
      expect(await repo.mergeInto(ctxB, [one!.id], oneB!.id)).toEqual({ issues: 0, articles: 0 });
      expect(await repo.findBySlugs(ctxA, ['one'])).toHaveLength(1);
      expect(await repo.deleteTag(ctxB, two!.id)).toBeUndefined();

      expect(await repo.mergeInto(ctxA, [one!.id], two!.id)).toEqual({ issues: 0, articles: 0 });
      expect(await repo.findBySlugs(ctxA, ['one'])).toEqual([]);
      expect((await repo.listForIssues(ctxA, [issueA.id])).map(r => r.tag.slug)).toEqual(['two']);
      expect((await repo.deleteTag(ctxA, two!.id))?.slug).toBe('two');
      expect(await repo.listForIssues(ctxA, [issueA.id])).toEqual([]);
      expect(await repo.findBySlugs(ctxB, ['one'])).toHaveLength(1);
    });
  });

  test('savedViews.listAll is per organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = savedViewsRepository(tx);
      const { ctxA, ctxB, alice } = await seedIssueWorld(tx);
      const view = await repo.insert(ctxA, {
        owner_id: alice,
        project_id: null,
        name: 'Mine',
        query: 'tag: one',
        query_ast: { clauses: [] },
        sort: [],
        columns: [],
        visibility: 'private',
      });
      expect((await repo.listAll(ctxA)).map(v => v.id)).toEqual([view.id]);
      expect(await repo.listAll(ctxB)).toEqual([]);
    });
  });
});
