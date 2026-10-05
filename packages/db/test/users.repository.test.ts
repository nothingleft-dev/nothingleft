import { describe, expect, test } from 'bun:test';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import { usersRepository } from '../src/repositories/users.repository.ts';
import { inRolledBackTx, seedTwoOrgs, sys } from './fixtures.ts';

describe('usersRepository tenant isolation', () => {
  test('a member of org A is invisible through org B context', async () => {
    await inRolledBackTx(async tx => {
      const users = usersRepository(tx);
      const orgs = organizationsRepository(tx);
      const { alice, bob, ctxA, ctxB } = await seedTwoOrgs(tx);
      const aliceRow = (await users.findById(sys, alice))!;

      expect((await users.findMemberByUsername(ctxA, aliceRow.name))?.id).toBeUndefined();
      expect((await users.listMembers(ctxB)).map(u => u.id)).toEqual([bob]);
      expect(await orgs.findMembership(ctxA, bob)).toBeUndefined();
      expect((await orgs.findMembership(ctxA, alice))?.user_id).toBe(alice);
    });
  });

  test('email matching is case-insensitive, so one address is one account', async () => {
    await inRolledBackTx(async tx => {
      const users = usersRepository(tx);
      const created = await users.create(sys, { email: `Mixed-${Date.now()}@Test.Local`, name: 'Mixed' });

      expect((await users.findByEmail(sys, created.email.toLowerCase()))?.id).toBe(created.id);
      expect((await users.findByEmail(sys, created.email.toUpperCase()))?.id).toBe(created.id);
    });
  });

  test('a username is reserved per organisation and resolves case-insensitively', async () => {
    await inRolledBackTx(async tx => {
      const users = usersRepository(tx);
      const orgs = organizationsRepository(tx);
      const { alice, ctxA, ctxB } = await seedTwoOrgs(tx);
      await orgs.addMember(ctxB, { user_id: alice, username: 'shared', role: 'member' });

      expect((await users.findMemberByUsername(ctxB, 'SHARED'))?.id).toBe(alice);
      expect(await users.findMemberByUsername(ctxA, 'shared')).toBeUndefined();
    });
  });

  test('a provider id resolves only through its own provider column', async () => {
    await inRolledBackTx(async tx => {
      const users = usersRepository(tx);
      const id = `pid-${Date.now()}`;
      const viaGoogle = await users.create(sys, { email: `g-${id}@test.local`, name: 'G', google_id: id });
      const viaGithub = await users.create(sys, { email: `h-${id}@test.local`, name: 'H', github_id: id });

      expect((await users.findByProviderId(sys, 'google', id))?.id).toBe(viaGoogle.id);
      expect((await users.findByProviderId(sys, 'github', id))?.id).toBe(viaGithub.id);
      expect(await users.findByProviderId(sys, 'google', `${id}-other`)).toBeUndefined();
    });
  });

  test('update touches only the named user', async () => {
    await inRolledBackTx(async tx => {
      const users = usersRepository(tx);
      const { alice, bob } = await seedTwoOrgs(tx);

      await users.update(sys, alice, { name: 'Renamed', timezone: 'Asia/Kolkata' });
      expect((await users.findById(sys, alice))?.name).toBe('Renamed');
      expect((await users.findById(sys, alice))?.timezone).toBe('Asia/Kolkata');
      expect((await users.findById(sys, bob))?.name).toBe('Bob');
    });
  });
});
