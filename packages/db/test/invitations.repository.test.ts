import { describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { invitationsRepository } from '../src/repositories/invitations.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import { usersRepository } from '../src/repositories/users.repository.ts';
import { inRolledBackTx, seedTwoOrgs, sys } from './fixtures.ts';

const link = (createdBy: number, extra: Record<string, unknown> = {}) => ({
  kind: 'link',
  token: randomBytes(16).toString('hex'),
  token_hash: randomBytes(32),
  org_role: 'member',
  created_by: createdBy,
  ...extra,
});

const email = (createdBy: number, address: string, extra: Record<string, unknown> = {}) => ({
  kind: 'email',
  email: address,
  token_hash: randomBytes(32),
  org_role: 'member',
  max_uses: 1,
  created_by: createdBy,
  ...extra,
});

describe('invitationsRepository tenant isolation', () => {
  test('reads and writes by id never reach another organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = invitationsRepository(tx);
      const { ctxA, ctxB, alice, bob } = await seedTwoOrgs(tx);
      const a = await repo.create(ctxA, link(alice));
      const b = await repo.create(ctxB, link(bob));

      expect(a.org_id).toBe(ctxA.orgId);
      expect(await repo.findById(ctxA, b.id)).toBeUndefined();
      expect(await repo.revoke(ctxA, b.id)).toBeUndefined();
      expect(await repo.rotate(ctxA, b.id, { token: 'x', token_hash: randomBytes(32) })).toBeUndefined();
      expect(await repo.claimUse(ctxA, b.id)).toBeUndefined();
      expect(await repo.recordUse(ctxA, { invitation_id: b.id, user_id: alice, ip: null })).toBeUndefined();
      expect((await repo.list(ctxA, { projectId: null })).map(i => i.id)).toEqual([a.id]);
      expect((await repo.findById(ctxB, b.id))?.revoked_at).toBeNull();
      expect((await repo.findByTokenHash(sys, b.token_hash))?.id).toBe(b.id);
    });
  });

  test('list separates organisation invitations from each project', async () => {
    await inRolledBackTx(async tx => {
      const repo = invitationsRepository(tx);
      const projects = projectsRepository(tx);
      const { ctxA, alice } = await seedTwoOrgs(tx);
      const p = await projects.create(ctxA, {
        key: 'PI',
        name: 'PI',
        slug: 'pi',
        avatar_color: 'amber',
        avatar_initials: 'PI',
        created_by: alice,
      });
      const org = await repo.create(ctxA, link(alice));
      const proj = await repo.create(ctxA, link(alice, { project_id: p.id, project_role: 'contributor' }));

      expect((await repo.list(ctxA, { projectId: null })).map(i => i.id)).toEqual([org.id]);
      expect((await repo.list(ctxA, { projectId: p.id })).map(i => i.id)).toEqual([proj.id]);
    });
  });

  test('claimUse stops at max_uses and refuses revoked or expired invitations', async () => {
    await inRolledBackTx(async tx => {
      const repo = invitationsRepository(tx);
      const { ctxA, alice } = await seedTwoOrgs(tx);
      const capped = await repo.create(ctxA, link(alice, { max_uses: 1 }));
      const expired = await repo.create(ctxA, link(alice, { expires_at: new Date(Date.now() - 86_400_000) }));
      const revoked = await repo.create(ctxA, link(alice));
      await repo.revoke(ctxA, revoked.id);

      expect((await repo.claimUse(ctxA, capped.id))?.use_count).toBe(1);
      expect(await repo.claimUse(ctxA, capped.id)).toBeUndefined();
      expect(await repo.claimUse(ctxA, expired.id)).toBeUndefined();
      expect(await repo.claimUse(ctxA, revoked.id)).toBeUndefined();
      expect(await repo.rotate(ctxA, revoked.id, { token: 'x', token_hash: randomBytes(32) })).toBeUndefined();
    });
  });

  test('recordUse is once per person, and listUses names them', async () => {
    await inRolledBackTx(async tx => {
      const repo = invitationsRepository(tx);
      const { ctxA, alice } = await seedTwoOrgs(tx);
      const inv = await repo.create(ctxA, link(alice));

      expect(await repo.recordUse(ctxA, { invitation_id: inv.id, user_id: alice, ip: '10.0.0.1' })).toBeDefined();
      expect(await repo.recordUse(ctxA, { invitation_id: inv.id, user_id: alice, ip: null })).toBeUndefined();
      const uses = await repo.listUses(ctxA, inv.id);
      expect(uses.map(u => u.user.id)).toEqual([alice]);
      expect(uses[0]?.membership?.org_id).toBe(ctxA.orgId);
      expect(uses[0]?.use.ip).toBe('10.0.0.1');
    });
  });

  test('revokePendingEmail supersedes only unused invitations to the same address and scope', async () => {
    await inRolledBackTx(async tx => {
      const repo = invitationsRepository(tx);
      const users = usersRepository(tx);
      const { ctxA, ctxB, alice, bob } = await seedTwoOrgs(tx);
      const address = `dora-${Date.now()}@test.local`;
      const pending = await repo.create(ctxA, email(alice, address));
      const used = await repo.create(ctxA, email(alice, address, { use_count: 1 }));
      const otherOrg = await repo.create(ctxB, email(bob, address));
      await users.create(sys, { email: address, name: 'Dora' });

      const superseded = await repo.revokePendingEmail(ctxA, address.toUpperCase(), null);
      expect(superseded.map(i => i.id)).toEqual([pending.id]);
      expect((await repo.findById(ctxA, used.id))?.revoked_at).toBeNull();
      expect((await repo.findById(ctxB, otherOrg.id))?.revoked_at).toBeNull();
    });
  });
});
