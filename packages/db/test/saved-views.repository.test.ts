import { describe, expect, test } from 'bun:test';
import { projectSchemaRepository } from '../src/repositories/project-schema.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import { recentSearchesRepository } from '../src/repositories/recent-searches.repository.ts';
import { savedViewsRepository } from '../src/repositories/saved-views.repository.ts';
import { recent_searches } from '../src/schema/index.ts';
import { inRolledBackTx, seedIssueWorld } from './fixtures.ts';

const view = (owner: number, name: string, extra: object = {}) => ({
  owner_id: owner,
  project_id: null,
  name,
  query: '#Unresolved',
  query_ast: { clauses: [{ kind: 'category', category: 'unresolved' }] },
  sort: [],
  columns: [],
  visibility: 'private',
  ...extra,
});

describe('savedViewsRepository tenant isolation', () => {
  test('insert, list, find, update and remove never cross organisations', async () => {
    await inRolledBackTx(async tx => {
      const repo = savedViewsRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA } = await seedIssueWorld(tx);
      const mine = await repo.insert(ctxA, view(alice, 'Mine'));
      const second = await repo.insert(ctxA, view(alice, 'Second', { visibility: 'org' }));
      expect([mine.position, second.position]).toEqual([0, 1]);
      await repo.insert(ctxA, view(alice, 'Project', { visibility: 'project', project_id: projectA }));

      expect((await repo.listVisible(ctxA, alice, [projectA])).map(v => v.name)).toEqual(['Mine', 'Second', 'Project']);
      expect(await repo.listVisible(ctxB, alice, [projectA])).toEqual([]);
      expect((await repo.findVisibleByNames(ctxA, alice, [], ['mine'])).map(v => v.id)).toEqual([mine.id]);
      expect(await repo.findVisibleByNames(ctxB, bob, [projectA], ['mine', 'second', 'project'])).toEqual([]);

      expect(await repo.update(ctxB, mine.id, { name: 'Hijacked' })).toBeUndefined();
      expect(await repo.remove(ctxB, mine.id)).toBeUndefined();
      expect((await repo.update(ctxA, mine.id, { name: 'Renamed' }))?.name).toBe('Renamed');
      expect((await repo.remove(ctxA, mine.id))?.id).toBe(mine.id);
      await expect(
        repo.insert(ctxB, view(bob, 'Wrong', { visibility: 'project', project_id: projectA })),
      ).rejects.toThrow();
    });
  });

  test('visibility: another member sees org views and readable project views, never private ones', async () => {
    await inRolledBackTx(async tx => {
      const repo = savedViewsRepository(tx);
      const { ctxA, alice, bob, projectA } = await seedIssueWorld(tx);
      await repo.insert(ctxA, view(alice, 'Private'));
      await repo.insert(ctxA, view(alice, 'Org', { visibility: 'org' }));
      await repo.insert(ctxA, view(alice, 'Project', { visibility: 'project', project_id: projectA }));
      expect((await repo.listVisible(ctxA, bob, [])).map(v => v.name)).toEqual(['Org']);
      expect((await repo.listVisible(ctxA, bob, [projectA])).map(v => v.name)).toEqual(['Org', 'Project']);
    });
  });
});

describe('recentSearchesRepository tenant isolation', () => {
  const window = 5 * 60_000;
  const at = (s: number) => new Date(Date.UTC(2026, 8, 24, 0, 0, s));
  const minutes = (m: number) => new Date(Date.UTC(2026, 8, 24, 0, m, 0));

  test('record bumps and prunes per user and organisation; list and clear stay in one organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = recentSearchesRepository(tx);
      const { ctxA, ctxB, alice } = await seedIssueWorld(tx);
      await repo.record(ctxA, alice, 'one', 2, minutes(0), window);
      await repo.record(ctxA, alice, 'two', 2, minutes(1), window);
      await repo.record(ctxA, alice, 'one', 2, minutes(10), window);
      await repo.record(ctxA, alice, 'three', 2, minutes(11), window);
      const rows = await repo.list(ctxA, alice, 10);
      expect(rows.map(r => r.query)).toEqual(['three', 'one']);
      expect(rows[1]!.use_count).toBe(2);
      expect(await repo.list(ctxB, alice, 10)).toEqual([]);
      expect(await repo.clear(ctxB, alice)).toBe(0);
      expect(await repo.clear(ctxA, alice)).toBe(2);
    });
  });

  test('a repeat inside the coalescing window writes nothing; one after it bumps once', async () => {
    await inRolledBackTx(async tx => {
      const repo = recentSearchesRepository(tx);
      const { ctxA, alice } = await seedIssueWorld(tx);
      await repo.record(ctxA, alice, 'poll', 5, minutes(0), window);
      await repo.record(ctxA, alice, 'poll', 5, at(30), window);
      await repo.record(ctxA, alice, 'poll', 5, minutes(4), window);
      let [row] = await repo.list(ctxA, alice, 10);
      expect(row).toMatchObject({ use_count: 1, last_used_at: minutes(0) });

      await repo.record(ctxA, alice, 'poll', 5, minutes(6), window);
      [row] = await repo.list(ctxA, alice, 10);
      expect(row).toMatchObject({ use_count: 2, last_used_at: minutes(6) });
    });
  });

  test('a new query inserts at once and prunes; a repeat does not prune', async () => {
    await inRolledBackTx(async tx => {
      const repo = recentSearchesRepository(tx);
      const { ctxA, alice } = await seedIssueWorld(tx);
      await repo.record(ctxA, alice, 'one', 2, at(1), window);
      await repo.record(ctxA, alice, 'two', 2, at(2), window);
      await repo.record(ctxA, alice, 'three', 2, at(3), window);
      expect((await repo.list(ctxA, alice, 10)).map(r => r.query)).toEqual(['three', 'two']);

      // Over the keep limit by a row inserted elsewhere: only an insert prunes it.
      await tx.insert(recent_searches).values({
        org_id: ctxA.orgId,
        user_id: alice,
        query_hash: Buffer.from('x'),
        query: 'extra',
        last_used_at: at(0),
      });
      await repo.record(ctxA, alice, 'three', 2, minutes(10), window);
      expect(await repo.list(ctxA, alice, 10)).toHaveLength(3);
      await repo.record(ctxA, alice, 'four', 2, minutes(11), window);
      expect((await repo.list(ctxA, alice, 10)).map(r => r.query)).toEqual(['four', 'three']);
    });
  });
});

describe('projects and schema helpers tenant isolation', () => {
  test('listReadable and listForProjects answer only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, alice, projectA } = await seedIssueWorld(tx);
      const projects = projectsRepository(tx);
      const schema = projectSchemaRepository(tx);
      expect((await projects.listReadable(ctxA, alice, { everyProject: true })).map(r => r.project.id)).toEqual([
        projectA,
      ]);
      expect(await projects.listReadable(ctxA, alice, { everyProject: false })).toEqual([]);
      expect(await projects.listReadable(ctxB, alice, { everyProject: true })).not.toContainEqual(
        expect.objectContaining({ project: expect.objectContaining({ id: projectA }) }),
      );
      expect((await schema.listForProjects(ctxA, 'statuses', [projectA])).length).toBeGreaterThan(0);
      expect(await schema.listForProjects(ctxB, 'statuses', [projectA])).toEqual([]);
    });
  });
});

describe('savedViewsRepository removal', () => {
  test('listOwnedBy, transfer and removeOwnedBy never cross organisations', async () => {
    await inRolledBackTx(async tx => {
      const repo = savedViewsRepository(tx);
      const { ctxA, ctxB, alice, bob, orgA } = await seedIssueWorld(tx);
      const mine = await repo.insert(ctxA, view(alice, 'Mine'));
      await repo.insert(ctxA, view(alice, 'Shared', { visibility: 'org' }));
      expect((await repo.listOwnedBy(ctxA, alice)).map(v => v.name)).toEqual(['Mine', 'Shared']);
      expect(await repo.listOwnedBy(ctxB, alice)).toEqual([]);

      expect(await repo.transfer(ctxB, mine.id, bob, 'Stolen')).toBeUndefined();
      expect(await repo.removeOwnedBy(ctxB, alice)).toBe(0);

      const moved = await repo.transfer(ctxA, mine.id, bob, 'Mine 2');
      expect([moved?.owner_id, moved?.name, moved?.position]).toEqual([bob, 'Mine 2', 0]);
      expect(await repo.removeOwnedBy(ctxA, alice)).toBe(1);
      expect((await repo.listOwnedBy(ctxA, bob)).map(v => v.id)).toEqual([mine.id]);
      void orgA;
    });
  });
});
