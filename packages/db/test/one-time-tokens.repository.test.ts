import { describe, expect, test } from 'bun:test';
import { oneTimeTokensRepository } from '../src/repositories/one-time-tokens.repository.ts';
import { schema } from '../src/index.ts';
import { inRolledBackTx, seedTwoOrgs, sys } from './fixtures.ts';

const hash = (s: string) => Buffer.from(new Bun.CryptoHasher('sha256').update(s).digest());
const hour = (n: number) => new Date(Date.now() + n * 3_600_000);

describe('oneTimeTokensRepository', () => {
  test('a token is found only for its own purpose', async () => {
    await inRolledBackTx(async tx => {
      const repo = oneTimeTokensRepository(tx);
      const { alice } = await seedTwoOrgs(tx);
      await repo.create(sys, { user_id: alice, purpose: 'password_reset', token_hash: hash('r'), expires_at: hour(1) });

      expect(await repo.findUnused(sys, 'password_reset', hash('r'))).toBeDefined();
      expect(await repo.findUnused(sys, 'email_verify', hash('r'))).toBeUndefined();
    });
  });

  test('consuming a token is single-use', async () => {
    await inRolledBackTx(async tx => {
      const repo = oneTimeTokensRepository(tx);
      const { alice } = await seedTwoOrgs(tx);
      const row = await repo.create(sys, {
        user_id: alice,
        purpose: 'email_verify',
        token_hash: hash('v'),
        expires_at: hour(24),
      });

      expect((await repo.consume(sys, row.id))?.used_at).not.toBeNull();
      expect(await repo.consume(sys, row.id)).toBeUndefined();
      expect(await repo.findUnused(sys, 'email_verify', hash('v'))).toBeUndefined();
    });
  });

  test('an email change carries the pending address, so the unique index stays free', async () => {
    await inRolledBackTx(async tx => {
      const repo = oneTimeTokensRepository(tx);
      const { alice } = await seedTwoOrgs(tx);
      const row = await repo.create(sys, {
        user_id: alice,
        purpose: 'email_change',
        token_hash: hash('c'),
        new_email: 'new@test.local',
        expires_at: hour(24),
      });
      expect(row.new_email).toBe('new@test.local');
    });
  });

  test('deleteForUser clears only that user and purpose', async () => {
    await inRolledBackTx(async tx => {
      const repo = oneTimeTokensRepository(tx);
      const { alice, bob } = await seedTwoOrgs(tx);
      await repo.create(sys, { user_id: alice, purpose: 'password_reset', token_hash: hash('1'), expires_at: hour(1) });
      await repo.create(sys, { user_id: alice, purpose: 'email_verify', token_hash: hash('2'), expires_at: hour(1) });
      await repo.create(sys, { user_id: bob, purpose: 'password_reset', token_hash: hash('3'), expires_at: hour(1) });

      await repo.deleteForUser(sys, alice, 'password_reset');
      expect(await repo.findUnused(sys, 'password_reset', hash('1'))).toBeUndefined();
      expect(await repo.findUnused(sys, 'email_verify', hash('2'))).toBeDefined();
      expect(await repo.findUnused(sys, 'password_reset', hash('3'))).toBeDefined();
    });
  });

  test('deleteExpired sweeps expired and already-used rows', async () => {
    await inRolledBackTx(async tx => {
      const repo = oneTimeTokensRepository(tx);
      const { alice } = await seedTwoOrgs(tx);
      await tx.delete(schema.one_time_tokens);

      await repo.create(sys, { user_id: alice, purpose: 'email_verify', token_hash: hash('a'), expires_at: hour(1) });
      await repo.create(sys, { user_id: alice, purpose: 'email_verify', token_hash: hash('b'), expires_at: hour(-1) });
      const used = await repo.create(sys, {
        user_id: alice,
        purpose: 'email_verify',
        token_hash: hash('c'),
        expires_at: hour(1),
      });
      await repo.consume(sys, used.id);

      expect(await repo.deleteExpired(sys)).toBe(2);
      expect(await repo.findUnused(sys, 'email_verify', hash('a'))).toBeDefined();
    });
  });
});
