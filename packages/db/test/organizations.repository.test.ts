import { describe, expect, test } from 'bun:test';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import { usersRepository } from '../src/repositories/users.repository.ts';
import { inRolledBackTx, seedTwoOrgs, sys } from './fixtures.ts';

describe('organizationsRepository tenant isolation', () => {
  test('update changes only the organisation in context', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { ctxA, ctxB } = await seedTwoOrgs(tx);

      await orgs.update(ctxA, { name: 'Renamed', workday_minutes: 420 });
      expect((await orgs.findById(ctxA))?.name).toBe('Renamed');
      expect((await orgs.findById(ctxA))?.workday_minutes).toBe(420);
      expect((await orgs.findById(ctxB))?.name).toBe('B');
    });
  });

  test('listSlugsWithPrefix matches by prefix across organisations, escaping LIKE wildcards', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { alice } = await seedTwoOrgs(tx);
      const base = `pre-${Date.now()}`;
      await orgs.create(sys, { name: 'x', slug: base, owner_user_id: alice });
      await orgs.create(sys, { name: 'x', slug: `${base}-2`, owner_user_id: alice });

      expect((await orgs.listSlugsWithPrefix(sys, base)).sort()).toEqual([base, `${base}-2`]);
      expect(await orgs.listSlugsWithPrefix(sys, `${base}%`)).toEqual([]);
    });
  });

  test('member reads and writes never cross into another organisation', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { alice, bob, ctxA, ctxB } = await seedTwoOrgs(tx);

      expect(await orgs.findAnyMembership(ctxA, bob)).toBeUndefined();
      expect(await orgs.findMemberByUserId(ctxA, bob)).toBeUndefined();
      expect(await orgs.updateMember(ctxA, bob, { role: 'member' })).toBeUndefined();
      expect(await orgs.removeMember(ctxA, bob)).toBeUndefined();
      expect(await orgs.restoreMember(ctxA, bob, { role: 'member', invited_by: null })).toBeUndefined();
      expect((await orgs.findMembership(ctxB, bob))?.role).toBe('org_admin');

      expect(await orgs.countActiveMembers(ctxA)).toBe(1);
      const listed = await orgs.listMembers(ctxA, { limit: 50, offset: 0 });
      expect(listed.rows.map(r => r.user.id)).toEqual([alice]);
      expect(listed.total).toBe(1);
    });
  });

  test('removal is a soft delete that frees nothing: the username stays reserved and restore brings it back', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const users = usersRepository(tx);
      const { alice, ctxA } = await seedTwoOrgs(tx);
      const carol = await users.create(sys, { email: `carol-${Date.now()}@test.local`, name: 'Carol' });
      const joined = await orgs.addMember(ctxA, { user_id: carol.id, username: 'Carol', role: 'member' });

      expect((await orgs.removeMember(ctxA, carol.id))?.removed_at).not.toBeNull();
      expect(await orgs.findMembership(ctxA, carol.id)).toBeUndefined();
      expect(await orgs.findMemberByUsername(ctxA, 'carol')).toBeUndefined();
      expect((await orgs.findMemberByUsername(ctxA, 'carol', { includeRemoved: true }))?.user.id).toBe(carol.id);
      expect(await orgs.listUsernamesWithPrefix(ctxA, 'car')).toEqual(['carol']);
      expect(await orgs.countActiveMembers(ctxA)).toBe(1);

      const restored = await orgs.restoreMember(ctxA, carol.id, { role: 'member', invited_by: alice });
      expect(restored?.removed_at).toBeNull();
      expect(restored?.username).toBe('Carol');
      expect(restored?.joined_at.getTime()).toBe(joined.joined_at.getTime());
    });
  });

  test('listMembers searches username, name and email, and pages', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const users = usersRepository(tx);
      const { ctxA, ctxB } = await seedTwoOrgs(tx);
      const stamp = Date.now();
      for (const name of ['Qxdora', 'Qxdmitri', 'Eve']) {
        const u = await users.create(sys, { email: `${name.toLowerCase()}-${stamp}@test.local`, name });
        await orgs.addMember(ctxA, { user_id: u.id, username: name.toLowerCase(), role: 'member' });
      }
      const outsider = await users.create(sys, { email: `dan-${stamp}@test.local`, name: 'Dan' });
      await orgs.addMember(ctxB, { user_id: outsider.id, username: 'dan', role: 'member' });

      const found = await orgs.listMembers(ctxA, { search: '@qxd', limit: 1, offset: 0 });
      expect(found.total).toBe(2);
      expect(found.rows.map(r => r.membership.username)).toEqual(['qxdmitri']);
      expect((await orgs.listMembers(ctxA, { search: `eve-${stamp}`, limit: 10, offset: 0 })).total).toBe(1);
      expect((await orgs.listMembers(ctxA, { search: '%', limit: 10, offset: 0 })).total).toBe(0);
    });
  });
});
