import { describe, expect, test } from 'bun:test';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import { schema } from '../src/index.ts';
import { inRolledBackTx, seedIssueWorld, seedTwoOrgs, sys } from './fixtures.ts';

const newProject = (orgId: number, userId: number, key: string) => ({
  org_id: orgId,
  key,
  name: key,
  slug: key.toLowerCase(),
  avatar_color: 'amber',
  avatar_initials: key.slice(0, 2),
  created_by: userId,
});

describe('projectsRepository.list', () => {
  test('ids narrow the rows and the total alike, so a restricted token pages correctly', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const { ctxA, orgA, alice } = await seedTwoOrgs(tx);
      const inserted = await tx
        .insert(schema.projects)
        .values(['AA', 'BB', 'CC', 'DD'].map(k => newProject(orgA, alice, k)))
        .returning();
      const [, bb, , dd] = inserted;

      const narrowed = await repo.list(ctxA, { ids: [bb!.id, dd!.id], limit: 1, offset: 0 });
      expect(narrowed.total).toBe(2);
      expect(narrowed.rows.map(r => r.project.key)).toEqual(['BB']);
      expect((await repo.list(ctxA, { ids: [], limit: 10, offset: 0 })).total).toBe(0);
      expect((await repo.list(ctxA, { limit: 10, offset: 0 })).total).toBe(4);
    });
  });

  test('ids from another organisation reach nothing', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const { ctxB, orgA, alice } = await seedTwoOrgs(tx);
      const [a] = await tx
        .insert(schema.projects)
        .values(newProject(orgA, alice, 'AA'))
        .returning();
      expect(await repo.list(ctxB, { ids: [a!.id], limit: 10, offset: 0 })).toEqual({ rows: [], total: 0 });
    });
  });
});

describe('projectsRepository tenant isolation', () => {
  test('a project in org A is invisible through org B context', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const { ctxA, ctxB, orgA, orgB, alice, bob } = await seedTwoOrgs(tx);

      const [a] = await tx
        .insert(schema.projects)
        .values(newProject(orgA, alice, 'PP'))
        .returning();
      await tx
        .insert(schema.projects)
        .values(newProject(orgB, bob, 'PP'))
        .returning();

      expect((await repo.findByKey(ctxA, 'PP'))?.id).toBe(a!.id);
      expect((await repo.findByKey(ctxB, 'PP'))?.id).not.toBe(a!.id);
      expect((await repo.findByKey(ctxB, 'PP'))?.org_id).toBe(orgB);
    });
  });

  test('the same key in two organisations is ambiguous for a PAT and both rows come back', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const { orgA, orgB, alice } = await seedTwoOrgs(tx);
      const orgs = organizationsRepository(tx);
      // Alice joins org B too, so her token can reach both.
      await orgs.addMember(
        { kind: 'tenant', orgId: orgB, userId: alice },
        {
          user_id: alice,
          username: `alice-b-${Date.now()}`,
          role: 'member',
        },
      );

      await tx.insert(schema.projects).values(newProject(orgA, alice, 'AC'));
      await tx.insert(schema.projects).values(newProject(orgB, alice, 'AC'));

      const found = await repo.listAcrossUserOrgs(sys, alice, { keys: ['AC'] });
      expect(found.length).toBe(2);
      expect(new Set(found.map(p => p.org_id))).toEqual(new Set([orgA, orgB]));
      expect(await repo.listAcrossUserOrgs(sys, alice, { keys: [] })).toEqual([]);
      expect((await repo.listAcrossUserOrgs(sys, alice, { ids: found.map(p => p.id) })).length).toBe(2);
    });
  });

  test('a project in an organisation the user left is not reachable by their token', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const { orgB, bob, alice } = await seedTwoOrgs(tx);
      await tx.insert(schema.projects).values(newProject(orgB, bob, 'ZZ'));

      expect(await repo.listAcrossUserOrgs(sys, alice, { keys: ['ZZ'] })).toEqual([]);
    });
  });

  test('the composite foreign key makes a cross-tenant child row unwritable', async () => {
    await inRolledBackTx(async tx => {
      const { orgA, orgB, alice } = await seedTwoOrgs(tx);
      const [a] = await tx
        .insert(schema.projects)
        .values(newProject(orgA, alice, 'XT'))
        .returning();

      // org B claiming org A's project: both single-column FKs resolve, the composite one does not.
      const attempt = async () =>
        tx
          .insert(schema.project_members)
          .values({ project_id: a!.id, org_id: orgB, user_id: alice, role: 'contributor', created_by: alice });
      await expect(attempt()).rejects.toThrow();
    });
  });
});

describe('projectsRepository.lockById', () => {
  test('locks only a project of the caller’s organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const { ctxA, ctxB, projectA } = await seedIssueWorld(tx);
      expect(await repo.lockById(ctxB, projectA)).toBeUndefined();
      expect((await repo.lockById(ctxA, projectA))?.id).toBe(projectA);
    });
  });
});

describe('projectsRepository batch reads, tenant isolation', () => {
  test('findByKeys returns only the organisation’s projects among the keys asked for', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const { ctxA, ctxB, orgA, orgB, alice, bob } = await seedTwoOrgs(tx);
      const [pp, qq] = await tx
        .insert(schema.projects)
        .values([newProject(orgA, alice, 'PP'), newProject(orgA, alice, 'QQ'), newProject(orgA, alice, 'RR')])
        .returning();
      await tx.insert(schema.projects).values(newProject(orgB, bob, 'ZZ'));

      const found = await repo.findByKeys(ctxA, ['PP', 'QQ', 'ZZ', 'NOPE']);
      expect(found.map(p => p.id).sort()).toEqual([pp!.id, qq!.id].sort());
      expect(await repo.findByKeys(ctxB, ['PP', 'QQ'])).toEqual([]);
      expect(await repo.findByKeys(ctxA, [])).toEqual([]);
    });
  });

  test('findMembers returns the user’s memberships in the organisation’s projects only', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const { ctxA, ctxB, orgA, orgB, alice, bob } = await seedTwoOrgs(tx);
      const [pa, pa2, pb] = await tx
        .insert(schema.projects)
        .values([newProject(orgA, alice, 'PA'), newProject(orgA, alice, 'PB'), newProject(orgB, bob, 'PB')])
        .returning();
      await repo.addMember(ctxA, { project_id: pa!.id, user_id: alice, role: 'observer', created_by: alice });
      await repo.addMember(ctxB, { project_id: pb!.id, user_id: bob, role: 'contributor', created_by: bob });

      const mine = await repo.findMembers(ctxA, [pa!.id, pa2!.id, pb!.id], alice);
      expect(mine.map(m => [m.project_id, m.role])).toEqual([[pa!.id, 'observer']]);
      expect(await repo.findMembers(ctxA, [pb!.id], bob)).toEqual([]);
      expect((await repo.findMembers(ctxB, [pb!.id], bob)).map(m => m.project_id)).toEqual([pb!.id]);
      expect(await repo.findMembers(ctxA, [], alice)).toEqual([]);
    });
  });
});
