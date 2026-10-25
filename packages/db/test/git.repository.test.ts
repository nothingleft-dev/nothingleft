import { describe, expect, test } from 'bun:test';
import { systemContext } from '../src/tenant-context.ts';
import { gitConnectionsRepository } from '../src/repositories/git-connections.repository.ts';
import { gitRepositoriesRepository } from '../src/repositories/git-repositories.repository.ts';
import { gitEventsRepository } from '../src/repositories/git-events.repository.ts';
import type { Queryable } from '../src/client.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld, violationInSavepoint } from './fixtures.ts';

const sys = systemContext('test');
const at = new Date('2026-10-25T10:00:00Z');

const connection = (createdBy: number, over: Record<string, unknown> = {}) => ({
  provider: 'github',
  base_url: 'https://github.com',
  auth_kind: 'app_installation',
  installation_id: `inst-${Math.random().toString(36).slice(2)}`,
  account_login: 'acme-inc',
  account_url: 'https://github.com/acme-inc',
  created_by: createdBy,
  ...over,
});

const repo = (id: string, fullName = `acme/${id}`) => ({
  provider_repo_id: id,
  full_name: fullName,
  html_url: `https://github.com/${fullName}`,
  default_branch: 'main',
  is_private: true,
  is_archived: false,
});

async function seedGit(tx: Queryable) {
  const world = await seedIssueWorld(tx);
  const connections = gitConnectionsRepository(tx);
  const a = await connections.insert(world.ctxA, connection(world.alice));
  const b = await connections.insert(world.ctxB, connection(world.bob));
  return { ...world, connA: a, connB: b };
}

describe('gitConnectionsRepository tenant isolation', () => {
  test('find, list, update, transition, revoke and touch never reach another organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = gitConnectionsRepository(tx);
      const { ctxA, ctxB, connA, connB } = await seedGit(tx);

      expect(await repo.findById(ctxB, connA.id)).toBeUndefined();
      expect((await repo.list(ctxA)).map(c => c.id)).toEqual([connA.id]);
      expect(await repo.countLive(ctxB)).toBe(1);
      expect(await repo.update(ctxB, connA.id, { account_login: 'x' }, at)).toBeUndefined();
      expect(await repo.transition(ctxB, connA.id, ['active'], { status: 'failing' }, at)).toBeUndefined();
      expect(await repo.revoke(ctxB, connA.id, at)).toBeUndefined();
      await repo.touch(ctxB, connA.id, at);
      expect((await repo.findById(ctxA, connA.id))?.last_event_at).toBeNull();
      expect((await repo.findById(ctxB, connB.id))?.status).toBe('active');
    });
  });

  test('a transition happens once; revoking forgets the secrets and hides the row from the live list', async () => {
    await inRolledBackTx(async tx => {
      const repo = gitConnectionsRepository(tx);
      const { ctxA, connA } = await seedGit(tx);
      await repo.update(ctxA, connA.id, { token_ciphertext: 'v1.sealed', hook_id_hash: Buffer.alloc(32, 7) }, at);
      expect(
        (await repo.transition(ctxA, connA.id, ['active'], { status: 'failing', last_error: 'signature' }, at))?.status,
      ).toBe('failing');
      expect(await repo.transition(ctxA, connA.id, ['active'], { status: 'failing' }, at)).toBeUndefined();
      const revoked = await repo.revoke(ctxA, connA.id, at);
      expect(revoked?.token_ciphertext).toBeNull();
      expect(revoked?.hook_id_hash).toBeNull();
      expect(await repo.list(ctxA)).toEqual([]);
      expect((await repo.list(ctxA, { includeRevoked: true })).length).toBe(1);
      expect(await repo.update(ctxA, connA.id, { account_login: 'x' }, at)).toBeUndefined();
    });
  });

  test('the system lookups find live connections only', async () => {
    await inRolledBackTx(async tx => {
      const repo = gitConnectionsRepository(tx);
      const { ctxA, connA, connB } = await seedGit(tx);
      const hash = Buffer.alloc(32, 9);
      await repo.update(ctxA, connA.id, { hook_id_hash: hash }, at);
      expect((await repo.findByHookHash(sys, hash))?.id).toBe(connA.id);
      expect((await repo.findByInstallation(sys, 'github', 'https://github.com', connB.installation_id!))?.id).toBe(
        connB.id,
      );
      await repo.revoke(ctxA, connA.id, at);
      expect(await repo.findByHookHash(sys, hash)).toBeUndefined();
      expect((await repo.listLiveAll(sys)).some(c => c.id === connA.id)).toBe(false);
    });
  });

  test('an installation is held by one live connection; an account once per organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = gitConnectionsRepository(tx);
      const { ctxA, ctxB, alice, bob, connA } = await seedGit(tx);
      const taken = await violationInSavepoint(tx, sp =>
        gitConnectionsRepository(sp).insert(
          ctxB,
          connection(bob, { installation_id: connA.installation_id, account_login: 'other' }),
        ),
      );
      expect(taken?.constraint).toBe('git_connections_installation_unique');
      const twice = await violationInSavepoint(tx, sp =>
        gitConnectionsRepository(sp).insert(ctxA, connection(alice, { account_login: 'ACME-INC' })),
      );
      expect(twice?.constraint).toBe('git_connections_org_account_unique');
      await repo.revoke(ctxA, connA.id, at);
      expect(
        await repo.insert(ctxB, connection(bob, { installation_id: connA.installation_id, account_login: 'other' })),
      ).toBeDefined();
    });
  });
});

describe('gitRepositoriesRepository tenant isolation', () => {
  test('discovery, lookups, lists and updates never reach another organisation', async () => {
    await inRolledBackTx(async tx => {
      const repos = gitRepositoriesRepository(tx);
      const { ctxA, ctxB, connA, connB } = await seedGit(tx);
      const [a] = await repos.upsertDiscovered(ctxA, connA.id, [repo('1', 'acme/web')], at);
      const [b] = await repos.upsertDiscovered(ctxB, connB.id, [repo('1', 'acme/web')], at);

      expect(await repos.findById(ctxB, a!.id)).toBeUndefined();
      expect(await repos.findByProviderId(ctxB, connA.id, '1')).toBeUndefined();
      expect((await repos.findByFullName(ctxB, 'ACME/WEB', [connA.id, connB.id])).map(r => r.id)).toEqual([b!.id]);
      expect((await repos.list(ctxA, {}, { limit: 10, offset: 0 })).rows.map(r => r.id)).toEqual([a!.id]);
      expect(await repos.update(ctxB, a!.id, { is_archived: true }, at)).toBeUndefined();
      expect(await repos.markRemovedExcept(ctxB, connA.id, [], at)).toEqual([]);
      expect((await repos.counts(ctxA)).map(c => c.connection_id)).toEqual([connA.id]);
      expect(await repos.listHooked(ctxB, connA.id)).toEqual([]);
      await repos.touch(ctxB, a!.id, at);
      expect((await repos.findById(ctxA, a!.id))?.last_event_at).toBeNull();
    });
  });

  test('a repository cannot be filed under a connection of another organisation', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, connB } = await seedGit(tx);
      expect(
        await failsInSavepoint(tx, sp =>
          gitRepositoriesRepository(sp).upsertDiscovered(ctxA, connB.id, [repo('9')], at),
        ),
      ).toBe(true);
    });
  });

  test('rediscovery refreshes and revives; what the provider stopped listing is marked removed', async () => {
    await inRolledBackTx(async tx => {
      const repos = gitRepositoriesRepository(tx);
      const { ctxA, connA } = await seedGit(tx);
      await repos.upsertDiscovered(ctxA, connA.id, [repo('1'), repo('2')], at);
      const removed = await repos.markRemovedExcept(ctxA, connA.id, ['1'], at);
      expect(removed.map(r => r.provider_repo_id)).toEqual(['2']);
      expect((await repos.list(ctxA, {}, { limit: 10, offset: 0 })).total).toBe(1);
      const [back] = await repos.upsertDiscovered(ctxA, connA.id, [repo('2', 'acme/renamed')], at);
      expect(back?.removed_at).toBeNull();
      expect(back?.full_name).toBe('acme/renamed');
      expect((await repos.list(ctxA, { q: 'renam' }, { limit: 10, offset: 0 })).rows.length).toBe(1);
      expect((await repos.list(ctxA, { q: '%' }, { limit: 10, offset: 0 })).rows.length).toBe(0);
    });
  });

  test('project links stay inside the organisation and count per project', async () => {
    await inRolledBackTx(async tx => {
      const repos = gitRepositoriesRepository(tx);
      const { ctxA, ctxB, alice, bob, connA, connB, projectA, projectB } = await seedGit(tx);
      const [a] = await repos.upsertDiscovered(ctxA, connA.id, [repo('1')], at);
      const [b] = await repos.upsertDiscovered(ctxB, connB.id, [repo('1')], at);
      expect(
        await failsInSavepoint(tx, sp => gitRepositoriesRepository(sp).link(ctxA, projectB, a!.id, alice, at)),
      ).toBe(true);
      expect(
        await failsInSavepoint(tx, sp => gitRepositoriesRepository(sp).link(ctxA, projectA, b!.id, alice, at)),
      ).toBe(true);
      expect(await repos.link(ctxA, projectA, a!.id, alice, at)).toBeDefined();
      expect(await repos.link(ctxA, projectA, a!.id, alice, at)).toBeUndefined();
      await repos.link(ctxB, projectB, b!.id, bob, at);

      expect((await repos.listForProject(ctxA, projectA)).map(r => r.id)).toEqual([a!.id]);
      expect(await repos.listForProject(ctxB, projectA)).toEqual([]);
      expect(await repos.countForProject(ctxA, projectA)).toBe(1);
      expect(await repos.countForProject(ctxB, projectA)).toBe(0);
      expect(await repos.projectLinks(ctxB, [a!.id])).toEqual([]);
      expect((await repos.list(ctxA, { linked: true }, { limit: 10, offset: 0 })).total).toBe(1);
      expect((await repos.list(ctxA, { linked: false }, { limit: 10, offset: 0 })).total).toBe(0);
      expect((await repos.counts(ctxA))[0]).toMatchObject({ known: 1, linked: 1, webhooks_missing: 0 });
      expect(await repos.unlink(ctxB, projectA, a!.id)).toBe(false);
      expect(await repos.unlink(ctxA, projectA, a!.id)).toBe(true);
    });
  });
});

describe('gitEventsRepository tenant isolation', () => {
  const event = (connectionId: number, delivery: string, providerRepoId: string | null = '1') => ({
    connection_id: connectionId,
    repository_id: null,
    provider_repo_id: providerRepoId,
    delivery_id: delivery,
    event_name: 'push',
    payload: { ref: 'refs/heads/main' },
    truncated: false,
    received_at: at,
  });

  async function seedEvents(tx: Queryable) {
    const world = await seedGit(tx);
    const events = gitEventsRepository(tx);
    const a = (await events.insert(world.ctxA, event(world.connA.id, 'd-1')))!;
    const b = (await events.insert(world.ctxB, event(world.connB.id, 'd-1')))!;
    return { ...world, events, a, b };
  }

  test('find, the queue, finishing, retrying, listing and replay never reach another organisation', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, connA, connB, events, a, b } = await seedEvents(tx);
      const keyA = { connection_id: connA.id, provider_repo_id: '1' };

      expect(await events.find(ctxB, a.id)).toBeUndefined();
      expect(await events.nextPending(ctxB, keyA)).toBeUndefined();
      expect((await events.nextPending(ctxA, keyA))?.id).toBe(a.id);
      expect(await events.finish(ctxB, a.id, { status: 'done', error: null }, at)).toBeUndefined();
      expect(await events.retryLater(ctxB, a.id, 'internal', at)).toBeUndefined();
      expect(await events.resetForReplay(ctxB, a.id, true)).toBeUndefined();
      expect((await events.list(ctxA, {}, { limit: 10, offset: 0 })).rows.map(r => r.id)).toEqual([a.id]);
      expect((await events.list(ctxA, { connectionIds: [connB.id] }, { limit: 10, offset: 0 })).total).toBe(0);
      expect((await events.find(ctxB, b.id))?.status).toBe('pending');
    });
  });

  test('a repeated delivery stores nothing; the queue is per key and oldest first', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, connA, events, a } = await seedEvents(tx);
      expect(await events.insert(ctxA, event(connA.id, 'd-1'))).toBeUndefined();
      const later = (await events.insert(ctxA, event(connA.id, 'd-2')))!;
      const elsewhere = (await events.insert(ctxA, event(connA.id, 'd-3', null)))!;
      const key = { connection_id: connA.id, provider_repo_id: '1' };
      expect((await events.nextPending(ctxA, key))?.id).toBe(a.id);
      await events.finish(ctxA, a.id, { status: 'done', error: null }, at);
      expect((await events.nextPending(ctxA, key))?.id).toBe(later.id);
      expect((await events.nextPending(ctxA, { connection_id: connA.id, provider_repo_id: null }))?.id).toBe(
        elsewhere.id,
      );
      const retried = await events.retryLater(ctxA, later.id, 'provider_unreachable', at);
      expect(retried).toMatchObject({ status: 'pending', attempts: 1, error: 'provider_unreachable' });
      const replayed = await events.resetForReplay(ctxA, a.id, true);
      expect(replayed).toMatchObject({ status: 'pending', attempts: 0, processed_at: null, run_automations: true });
    });
  });

  test('purge removes old events across organisations', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, events, a, b } = await seedEvents(tx);
      expect(await events.purgeBefore(sys, new Date(at.getTime() + 1), 1000)).toBeGreaterThanOrEqual(2);
      expect(await events.find(ctxA, a.id)).toBeUndefined();
      expect(await events.find(ctxB, b.id)).toBeUndefined();
    });
  });

  test('an event cannot name a repository of another organisation', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, connA, connB, ctxB } = await seedGit(tx);
      const [b] = await gitRepositoriesRepository(tx).upsertDiscovered(ctxB, connB.id, [repo('1')], at);
      expect(
        await failsInSavepoint(tx, sp =>
          gitEventsRepository(sp).insert(ctxA, { ...event(connA.id, 'x'), repository_id: b!.id }),
        ),
      ).toBe(true);
    });
  });
});
