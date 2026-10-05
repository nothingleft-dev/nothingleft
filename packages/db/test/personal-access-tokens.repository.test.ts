import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Queryable } from '../src/client.ts';
import {
  personalAccessTokensRepository,
  type TokenProjectRef,
} from '../src/repositories/personal-access-tokens.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import * as schema from '../src/schema/index.ts';
import type { TenantContext } from '../src/tenant-context.ts';
import { failsInSavepoint, inRolledBackTx, seedTwoOrgs, sys } from './fixtures.ts';

const hash = (s: string) => Buffer.from(new Bun.CryptoHasher('sha256').update(s).digest());
const hour = (n: number) => new Date(Date.now() + n * 3_600_000);

const token = (userId: number, name: string) => ({
  user_id: userId,
  name,
  token_hash: hash(name),
  token_prefix: `nl_pat_${name.slice(0, 8)}`,
  scopes: ['issues:read'],
});

async function projectIn(tx: Queryable, ctx: TenantContext, key: string): Promise<TokenProjectRef> {
  const row = await projectsRepository(tx).create(ctx, {
    key,
    name: `Project ${key}`,
    slug: key.toLowerCase(),
    avatar_color: 'amber',
    avatar_initials: key.slice(0, 2),
    created_by: ctx.userId!,
  });
  return { project_id: row.id, org_id: row.org_id };
}

async function restrictedTo(tx: Queryable, userId: number, name: string, projects: TokenProjectRef[]) {
  const repo = personalAccessTokensRepository(tx);
  const row = await repo.create(sys, { ...token(userId, name), restricted: true });
  await repo.addProjects(sys, row.id, projects);
  return row;
}

describe('personalAccessTokensRepository user isolation', () => {
  test("one user's tokens never surface for another", async () => {
    await inRolledBackTx(async tx => {
      const repo = personalAccessTokensRepository(tx);
      const { alice, bob } = await seedTwoOrgs(tx);

      const mine = await repo.create(sys, token(alice, 'mine'));
      await repo.create(sys, token(bob, 'theirs'));

      expect((await repo.listForUser(sys, alice)).map(r => r.id)).toEqual([mine.id]);
      expect(await repo.revokeForUser(sys, bob, mine.id)).toBeUndefined();
      expect((await repo.listForUser(sys, alice))[0]!.revoked_at).toBeNull();
    });
  });

  test("a token's project list is read from its own junction rows only", async () => {
    await inRolledBackTx(async tx => {
      const repo = personalAccessTokensRepository(tx);
      const { alice, bob, ctxA, ctxB } = await seedTwoOrgs(tx);
      const a = await projectIn(tx, ctxA, 'PA');
      const b = await projectIn(tx, ctxB, 'PB');

      const mine = await restrictedTo(tx, alice, 'mine', [a]);
      await restrictedTo(tx, bob, 'theirs', [b]);
      const open = await repo.create(sys, token(alice, 'open'));

      const listed = new Map((await repo.listForUser(sys, alice)).map(r => [r.id, r.project_ids]));
      expect(listed).toEqual(
        new Map<number, number[] | null>([
          [mine.id, [a.project_id]],
          [open.id, null],
        ]),
      );
      expect((await repo.findLiveByTokenHash(sys, hash('mine')))?.project_ids).toEqual([a.project_id]);
      expect((await repo.findLiveByTokenHash(sys, hash('open')))?.project_ids).toBeNull();
      expect((await repo.revokeForUser(sys, alice, mine.id))?.project_ids).toEqual([a.project_id]);
    });
  });

  test('a revoked or expired token stops resolving', async () => {
    await inRolledBackTx(async tx => {
      const repo = personalAccessTokensRepository(tx);
      const { alice } = await seedTwoOrgs(tx);

      const live = await repo.create(sys, token(alice, 'live'));
      const expired = await repo.create(sys, { ...token(alice, 'expired'), expires_at: hour(-1) });
      const revoked = await repo.create(sys, token(alice, 'revoked'));
      await repo.revokeForUser(sys, alice, revoked.id);

      expect((await repo.findLiveByTokenHash(sys, hash('live')))?.id).toBe(live.id);
      expect(await repo.findLiveByTokenHash(sys, hash('expired'))).toBeUndefined();
      expect(await repo.findLiveByTokenHash(sys, hash('revoked'))).toBeUndefined();
      expect(expired.expires_at).not.toBeNull();
    });
  });

  test('markUsed stamps last_used_at so a stale token is visible', async () => {
    await inRolledBackTx(async tx => {
      const repo = personalAccessTokensRepository(tx);
      const { alice } = await seedTwoOrgs(tx);
      const row = await repo.create(sys, token(alice, 'used'));
      expect(row.last_used_at).toBeNull();

      await repo.markUsed(sys, row.id);
      expect((await repo.listForUser(sys, alice))[0]!.last_used_at).not.toBeNull();
    });
  });

  test('revokeRestrictedTo revokes only tokens confined to the given projects', async () => {
    await inRolledBackTx(async tx => {
      const repo = personalAccessTokensRepository(tx);
      const { alice, bob, ctxA, ctxB } = await seedTwoOrgs(tx);
      const p1 = await projectIn(tx, ctxA, 'PE');
      const p2 = await projectIn(tx, ctxA, 'PF');
      const p3 = await projectIn(tx, ctxA, 'PG');
      const p9 = await projectIn(tx, ctxB, 'PZ');

      const confined = await restrictedTo(tx, alice, 'confined', [p1, p2]);
      const straddling = await restrictedTo(tx, alice, 'straddle', [p1, p9]);
      const emptied = await restrictedTo(tx, alice, 'emptied', []);
      const unrestricted = await repo.create(sys, token(alice, 'all'));
      const bobs = await restrictedTo(tx, bob, 'bobs', [p1]);

      const revoked = await repo.revokeRestrictedTo(
        sys,
        alice,
        [p1, p2, p3].map(p => p.project_id),
      );
      expect(revoked.map(r => r.id)).toEqual([confined.id]);
      const byId = new Map((await repo.listForUser(sys, alice)).map(r => [r.id, r]));
      for (const kept of [straddling, emptied, unrestricted]) expect(byId.get(kept.id)?.revoked_at).toBeNull();
      expect((await repo.listForUser(sys, bob)).find(r => r.id === bobs.id)?.revoked_at).toBeNull();
      expect(await repo.revokeRestrictedTo(sys, alice, [])).toEqual([]);
    });
  });
});

describe('personalAccessTokensRepository project junction', () => {
  test('a junction row must name a real project of its own organisation, once', async () => {
    await inRolledBackTx(async tx => {
      const repo = personalAccessTokensRepository(tx);
      const { alice, orgB, ctxA } = await seedTwoOrgs(tx);
      const a = await projectIn(tx, ctxA, 'PA');
      const row = await repo.create(sys, { ...token(alice, 'r'), restricted: true });
      const add = (refs: TokenProjectRef[]) => (sp: Queryable) =>
        personalAccessTokensRepository(sp).addProjects(sys, row.id, refs);

      expect(await failsInSavepoint(tx, add([{ project_id: a.project_id, org_id: orgB }]))).toBe(true);
      expect(await failsInSavepoint(tx, add([{ project_id: 2 ** 40, org_id: a.org_id }]))).toBe(true);
      await repo.addProjects(sys, row.id, [a]);
      expect(await failsInSavepoint(tx, add([a]))).toBe(true);
      expect((await repo.findLiveByTokenHash(sys, hash('r')))?.project_ids).toEqual([a.project_id]);
    });
  });

  test('a restricted token whose last project is deleted reaches no project, never every one', async () => {
    await inRolledBackTx(async tx => {
      const repo = personalAccessTokensRepository(tx);
      const { alice, ctxA } = await seedTwoOrgs(tx);
      const doomed = await projectIn(tx, ctxA, 'PD');
      const other = await projectIn(tx, ctxA, 'PO');
      await restrictedTo(tx, alice, 'doomed', [doomed]);

      await tx.delete(schema.projects).where(eq(schema.projects.id, doomed.project_id));

      const row = await repo.findLiveByTokenHash(sys, hash('doomed'));
      expect(row?.restricted).toBe(true);
      expect(row?.project_ids).toEqual([]);
      expect(await repo.countReaching(sys, alice, [other.project_id])).toBe(0);
      expect(await repo.countReaching(sys, alice, [])).toBe(0);
    });
  });
});

describe('personalAccessTokensRepository removal counts', () => {
  test('countReaching counts the live tokens the permission rule lets reach a project, never an emptied one', async () => {
    await inRolledBackTx(async tx => {
      const repo = personalAccessTokensRepository(tx);
      const { alice, bob, ctxA, ctxB } = await seedTwoOrgs(tx);
      const p1 = await projectIn(tx, ctxA, 'PE');
      const p2 = await projectIn(tx, ctxA, 'PF');
      const p9 = await projectIn(tx, ctxB, 'PZ');

      await repo.create(sys, token(alice, 'everywhere'));
      await restrictedTo(tx, alice, 'inside', [p1]);
      await restrictedTo(tx, alice, 'spanning', [p1, p9]);
      await restrictedTo(tx, alice, 'elsewhere', [p9]);
      await restrictedTo(tx, alice, 'emptied', []);
      await repo.create(sys, { ...token(alice, 'expired'), expires_at: hour(-1) });
      const revoked = await repo.create(sys, token(alice, 'revoked'));
      await repo.revokeForUser(sys, alice, revoked.id);
      await repo.create(sys, token(bob, 'bobs'));

      expect(await repo.countReaching(sys, alice, [p1.project_id, p2.project_id])).toBe(3);
      expect(await repo.countReaching(sys, alice, [])).toBe(1);

      const now = new Date();
      const live = (await repo.listForUser(sys, alice)).filter(
        t => !t.revoked_at && (!t.expires_at || t.expires_at > now),
      );
      for (const set of [[p1.project_id, p2.project_id], [p9.project_id], [p2.project_id], []]) {
        const reaching = live.filter(t => t.project_ids === null || t.project_ids.some(id => set.includes(id)));
        expect(await repo.countReaching(sys, alice, set)).toBe(reaching.length);
      }
    });
  });
});
