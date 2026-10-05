import { describe, expect, test } from 'bun:test';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import { inRolledBackTx, seedTwoOrgs } from './fixtures.ts';

const project = (userId: number, key: string) => ({
  key,
  name: key,
  slug: key.toLowerCase(),
  avatar_color: 'amber',
  avatar_initials: key.slice(0, 2),
  created_by: userId,
});

describe('projectsRepository writes and lists, tenant isolation', () => {
  test('create, findById, update, listKeysAndSlugs and listIds stay inside the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const { ctxA, ctxB, alice, bob } = await seedTwoOrgs(tx);
      const a = await repo.create(ctxA, project(alice, 'PP'));
      const b = await repo.create(ctxB, project(bob, 'QQ'));

      expect(a.org_id).toBe(ctxA.orgId);
      expect(await repo.findById(ctxA, b.id)).toBeUndefined();
      expect(await repo.update(ctxA, b.id, { name: 'hijack' })).toBeUndefined();
      expect((await repo.findById(ctxB, b.id))?.name).toBe('QQ');
      expect((await repo.update(ctxA, a.id, { name: 'Partner Portal' }))?.name).toBe('Partner Portal');
      expect(await repo.listKeysAndSlugs(ctxA)).toEqual([{ key: 'PP', slug: 'pp' }]);
      expect(await repo.listIds(ctxA)).toEqual([a.id]);
    });
  });

  test('list shows every project to an admin view and only memberships to a member view', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const { ctxA, ctxB, alice, bob } = await seedTwoOrgs(tx);
      const a1 = await repo.create(ctxA, project(alice, 'AA'));
      await repo.create(ctxA, project(alice, 'AB'));
      await repo.create(ctxB, project(bob, 'BB'));
      await repo.addMember(ctxA, { project_id: a1.id, user_id: alice, role: 'observer', created_by: alice });
      await repo.update(ctxA, a1.id, { is_archived: true });

      const all = await repo.list(ctxA, { limit: 50, offset: 0 });
      expect(all.rows.map(r => [r.project.key, r.role])).toEqual([
        ['AA', 'observer'],
        ['AB', null],
      ]);
      expect(all.total).toBe(2);

      const mine = await repo.list(ctxA, { memberUserId: alice, limit: 50, offset: 0 });
      expect(mine.rows.map(r => r.project.key)).toEqual(['AA']);
      expect((await repo.list(ctxA, { archived: false, limit: 50, offset: 0 })).rows.map(r => r.project.key)).toEqual([
        'AB',
      ]);
      expect((await repo.list(ctxB, { memberUserId: alice, limit: 50, offset: 0 })).total).toBe(0);
    });
  });

  test('project member reads and writes are scoped to the organisation and hide removed members', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectsRepository(tx);
      const orgs = organizationsRepository(tx);
      const { ctxA, ctxB, alice, bob } = await seedTwoOrgs(tx);
      const a = await repo.create(ctxA, project(alice, 'PM'));
      const b = await repo.create(ctxB, project(bob, 'PM'));
      await repo.addMember(ctxA, { project_id: a.id, user_id: alice, role: 'contributor', created_by: alice });
      await repo.addMember(ctxB, { project_id: b.id, user_id: bob, role: 'contributor', created_by: bob });

      expect(await repo.findMember(ctxA, b.id, bob)).toBeUndefined();
      expect(await repo.listMembers(ctxA, b.id)).toEqual([]);
      expect(await repo.updateMemberRole(ctxA, b.id, bob, 'observer')).toBeUndefined();
      expect(await repo.removeMember(ctxA, b.id, bob)).toBeUndefined();
      expect(await repo.removeAllMembershipsOf(ctxA, bob)).toEqual([]);
      expect((await repo.findMember(ctxB, b.id, bob))?.role).toBe('contributor');

      expect((await repo.updateMemberRole(ctxA, a.id, alice, 'project_admin'))?.role).toBe('project_admin');
      expect((await repo.listMembers(ctxA, a.id)).map(m => m.user.id)).toEqual([alice]);
      await orgs.removeMember(ctxA, alice);
      expect(await repo.listMembers(ctxA, a.id)).toEqual([]);
      expect((await repo.removeAllMembershipsOf(ctxA, alice)).length).toBe(1);
      expect(await repo.findMember(ctxA, a.id, alice)).toBeUndefined();
    });
  });
});
