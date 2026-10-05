import { describe, expect, test } from 'bun:test';
import { sessionsRepository } from '../src/repositories/sessions.repository.ts';
import { schema } from '../src/index.ts';
import { inRolledBackTx, seedTwoOrgs, sys } from './fixtures.ts';

const hash = (s: string) => Buffer.from(new Bun.CryptoHasher('sha256').update(s).digest());
const hour = (n: number) => new Date(Date.now() + n * 3_600_000);

// sessions carries no org_id, so the isolation boundary is the user
// — docs/backend-guide.md#identity-tables.
describe('sessionsRepository user isolation', () => {
  test("one user's sessions never surface for another", async () => {
    await inRolledBackTx(async tx => {
      const repo = sessionsRepository(tx);
      const { alice, bob, orgA } = await seedTwoOrgs(tx);

      const a = await repo.create(sys, { token_hash: hash('a'), user_id: alice, expires_at: hour(1) });
      await repo.create(sys, { token_hash: hash('b'), user_id: bob, expires_at: hour(1) });

      expect((await repo.listForUser(sys, alice)).map(r => r.session.id)).toEqual([a.id]);
      expect(await repo.findForUser(sys, bob, a.id)).toBeUndefined();
      expect(await repo.deleteForUser(sys, bob, a.id)).toBeUndefined();
      expect((await repo.findForUser(sys, alice, a.id))?.id).toBe(a.id);
      expect(a.current_org_id).toBeNull();
      void orgA;
    });
  });

  test('a lookup by token hash only matches a live session', async () => {
    await inRolledBackTx(async tx => {
      const repo = sessionsRepository(tx);
      const { alice } = await seedTwoOrgs(tx);

      await repo.create(sys, { token_hash: hash('live'), user_id: alice, expires_at: hour(1) });
      await repo.create(sys, { token_hash: hash('dead'), user_id: alice, expires_at: hour(-1) });

      expect(await repo.findLiveByTokenHash(sys, hash('live'))).toBeDefined();
      expect(await repo.findLiveByTokenHash(sys, hash('dead'))).toBeUndefined();
      expect((await repo.listForUser(sys, alice)).length).toBe(1);
    });
  });

  test('touch rolls the expiry forward and setCurrentOrg records the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = sessionsRepository(tx);
      const { alice, orgA } = await seedTwoOrgs(tx);
      const created = await repo.create(sys, { token_hash: hash('t'), user_id: alice, expires_at: hour(1) });

      await repo.touch(sys, created.id, hour(24));
      await repo.setCurrentOrg(sys, created.id, orgA);

      const [row] = await repo.listForUser(sys, alice);
      expect(row!.session.expires_at.getTime()).toBeGreaterThan(created.expires_at.getTime());
      expect(row!.session.current_org_id).toBe(orgA);
      expect(row!.organization_slug).toBeTruthy();
    });
  });

  test('sign out everywhere keeps the caller and leaves other users untouched', async () => {
    await inRolledBackTx(async tx => {
      const repo = sessionsRepository(tx);
      const { alice, bob } = await seedTwoOrgs(tx);

      const keep = await repo.create(sys, { token_hash: hash('k'), user_id: alice, expires_at: hour(1) });
      await repo.create(sys, { token_hash: hash('x'), user_id: alice, expires_at: hour(1) });
      await repo.create(sys, { token_hash: hash('y'), user_id: bob, expires_at: hour(1) });

      const revoked = await repo.deleteAllForUser(sys, alice, keep.id);
      expect(revoked.length).toBe(1);
      expect((await repo.listForUser(sys, alice)).map(r => r.session.id)).toEqual([keep.id]);
      expect((await repo.listForUser(sys, bob)).length).toBe(1);
    });
  });

  test('deleteExpired removes only expired rows', async () => {
    await inRolledBackTx(async tx => {
      const repo = sessionsRepository(tx);
      const { alice } = await seedTwoOrgs(tx);
      await tx.delete(schema.sessions);

      await repo.create(sys, { token_hash: hash('fresh'), user_id: alice, expires_at: hour(1) });
      await repo.create(sys, { token_hash: hash('stale'), user_id: alice, expires_at: hour(-1) });

      expect(await repo.deleteExpired(sys)).toBe(1);
      expect((await repo.listForUser(sys, alice)).length).toBe(1);
    });
  });

  test('clearCurrentOrgForUser forgets only that organisation, and only for that user', async () => {
    await inRolledBackTx(async tx => {
      const repo = sessionsRepository(tx);
      const { alice, bob, orgA, orgB } = await seedTwoOrgs(tx);
      const inA = await repo.create(sys, { token_hash: hash('ca'), user_id: alice, expires_at: hour(1) });
      const inB = await repo.create(sys, { token_hash: hash('cb'), user_id: alice, expires_at: hour(1) });
      const bobs = await repo.create(sys, { token_hash: hash('cc'), user_id: bob, expires_at: hour(1) });
      await repo.setCurrentOrg(sys, inA.id, orgA);
      await repo.setCurrentOrg(sys, inB.id, orgB);
      await repo.setCurrentOrg(sys, bobs.id, orgA);

      expect(await repo.clearCurrentOrgForUser(sys, alice, orgA)).toEqual([{ id: inA.id }]);
      expect((await repo.findForUser(sys, alice, inA.id))?.current_org_id).toBeNull();
      expect((await repo.findForUser(sys, alice, inB.id))?.current_org_id).toBe(orgB);
      expect((await repo.findForUser(sys, bob, bobs.id))?.current_org_id).toBe(orgA);
    });
  });
});

describe('sessionsRepository removal counts', () => {
  test('countLiveForUser counts one user’s unexpired sessions', async () => {
    await inRolledBackTx(async tx => {
      const repo = sessionsRepository(tx);
      const { alice, bob } = await seedTwoOrgs(tx);
      await repo.create(sys, { token_hash: hash('c1'), user_id: alice, expires_at: hour(1) });
      await repo.create(sys, { token_hash: hash('c2'), user_id: alice, expires_at: hour(-1) });
      await repo.create(sys, { token_hash: hash('c3'), user_id: bob, expires_at: hour(1) });
      expect(await repo.countLiveForUser(sys, alice)).toBe(1);
    });
  });
});
