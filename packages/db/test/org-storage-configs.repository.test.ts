import { describe, expect, test } from 'bun:test';
import type { Queryable } from '../src/client.ts';
import type { TenantContext } from '../src/tenant-context.ts';
import { attachmentsRepository, type AttachmentInsert } from '../src/repositories/attachments.repository.ts';
import { organizationPurgeRepository } from '../src/repositories/organization-purge.repository.ts';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import {
  orgStorageConfigsRepository,
  type StorageConnectionInput,
} from '../src/repositories/org-storage-configs.repository.ts';
import {
  orgStorageLocationsRepository,
  type StorageLocationInput,
} from '../src/repositories/org-storage-locations.repository.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld, seedTwoOrgs, sys } from './fixtures.ts';

const place = (over: Partial<StorageLocationInput> = {}): StorageLocationInput => ({
  provider: 's3',
  endpoint: 'https://s3.eu-west-1.amazonaws.com',
  region: 'eu-west-1',
  bucket: 'acme-files',
  ...over,
});

const R2_ELSEWHERE = { provider: 'r2', endpoint: 'https://acc.r2.cloudflarestorage.com', region: 'auto' } as const;

const connection = (locationId: number): StorageConnectionInput => ({
  location_id: locationId,
  access_key_id: 'AKIAEXAMPLE',
  secret_ciphertext: 'v1.sealed',
});

async function connect(tx: Queryable, ctx: TenantContext, actorId: number, over: Partial<StorageLocationInput> = {}) {
  const location = await orgStorageLocationsRepository(tx).ensure(ctx, place(over));
  await orgStorageConfigsRepository(tx).replace(ctx, connection(location.id), actorId, new Date());
  return location;
}

const file = (userId: number, over: Partial<AttachmentInsert> = {}): AttachmentInsert => ({
  public_id: crypto.randomUUID(),
  issue_id: null,
  filename: 'shot.png',
  mime_type: 'image/png',
  size_bytes: 1000,
  checksum: Buffer.alloc(32),
  storage_target: 'platform',
  bucket: 'nl-private',
  object_key: `api/x/${crypto.randomUUID()}`,
  created_by: userId,
  completed_at: new Date(),
  ...over,
});

const theirs = (userId: number, locationId: number, over: Partial<AttachmentInsert> = {}) =>
  file(userId, { storage_target: 'byo', storage_location_id: locationId, bucket: 'theirs', ...over });

describe('orgStorageConfigsRepository tenant isolation', () => {
  test('every read and write answers only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = orgStorageConfigsRepository(tx);
      const { ctxA, ctxB, alice, bob } = await seedTwoOrgs(tx);
      const at = new Date();
      const location = await connect(tx, ctxA, alice);
      expect(await repo.find(ctxA)).toMatchObject({ bucket: 'acme-files', location_id: location.id, provider: 's3' });
      expect(await repo.find(ctxB)).toBeUndefined();

      expect(await repo.rotate(ctxB, { access_key_id: 'X', secret_ciphertext: 'v1.x' }, bob, at)).toBeUndefined();
      expect(await repo.recordCheck(ctxB, { status: 'verified', last_error: null, at })).toBeUndefined();
      expect((await repo.find(ctxA))?.status).toBe('pending');

      await repo.recordCheck(ctxA, { status: 'verified', last_error: null, at });
      expect(await repo.markFailed(ctxB, 'put.access_denied', at)).toBeUndefined();
      expect(await repo.startMigration(ctxB, { files: 1, bytes: 1 }, at)).toBeUndefined();
      await repo.recordMigrated(ctxB, 99, at);
      await repo.recordSkipped(ctxB, 99, at);
      await repo.heartbeat(ctxB, at);
      expect(await repo.finishMigration(ctxB, at)).toBeUndefined();
      expect(await repo.failMigration(ctxB, 'put.unknown', at)).toBeUndefined();
      expect(await repo.remove(ctxB)).toBeUndefined();

      const row = (await repo.find(ctxA))!;
      expect(row).toMatchObject({ status: 'verified', migrated_bytes: 0, migration_state: 'idle' });
      expect((await repo.listActive(sys)).some(r => r.org_id === ctxA.orgId)).toBe(true);
      expect((await repo.listActive(sys)).find(r => r.org_id === ctxA.orgId)?.bucket).toBe('acme-files');
      expect((await repo.remove(ctxA))?.bucket).toBe('acme-files');
      expect(await repo.find(ctxA)).toBeUndefined();
    });
  });

  test('a migration starts once, counts progress, and only a verified connection flips to failed', async () => {
    await inRolledBackTx(async tx => {
      const repo = orgStorageConfigsRepository(tx);
      const { ctxA, alice } = await seedTwoOrgs(tx);
      const at = new Date();
      await connect(tx, ctxA, alice);
      expect(await repo.startMigration(ctxA, { files: 2, bytes: 30 }, at)).toBeUndefined();
      expect(await repo.markFailed(ctxA, 'get.wrong_secret', at)).toBeUndefined();

      await repo.recordCheck(ctxA, { status: 'verified', last_error: null, at });
      const started = await repo.startMigration(ctxA, { files: 2, bytes: 30 }, at);
      expect(started).toMatchObject({ migration_state: 'running', total_files: 2, total_bytes: 30 });
      expect(await repo.startMigration(ctxA, { files: 2, bytes: 30 }, at)).toBeUndefined();
      await repo.recordMigrated(ctxA, 10, at);
      await repo.recordSkipped(ctxA, 20, at);
      expect(await repo.finishMigration(ctxA, at)).toMatchObject({
        migration_state: 'done',
        migrated_files: 1,
        migrated_bytes: 10,
        total_files: 1,
        total_bytes: 10,
      });

      expect((await repo.markFailed(ctxA, 'get.wrong_secret', at))?.status).toBe('failed');
      expect(await repo.markFailed(ctxA, 'get.wrong_secret', at)).toBeUndefined();
      await tx.execute(
        `update org_storage_configs set migration_state = 'running', updated_at = now() - interval '1 day' where org_id = ${ctxA.orgId}`,
      );
      expect((await repo.listStalled(sys, new Date(Date.now() - 60_000))).map(r => r.org_id)).toContain(ctxA.orgId);
    });
  });

  test('the organisation purge takes the connection and its locations, after the files', async () => {
    await inRolledBackTx(async tx => {
      const repo = orgStorageConfigsRepository(tx);
      const { ctxA, ctxB, alice, bob, issueA } = await seedIssueWorld(tx);
      const location = await connect(tx, ctxA, alice);
      await connect(tx, ctxB, bob);
      await attachmentsRepository(tx).insert(ctxA, theirs(alice, location.id, { issue_id: issueA.id }));
      await organizationPurgeRepository(tx).purgeContents(ctxA);
      expect(await repo.find(ctxA)).toBeUndefined();
      expect(await repo.find(ctxB)).toBeDefined();
      const counts = await tx.execute<{ org_id: number; n: number }>(
        `select org_id, count(*)::int as n from org_storage_locations where org_id in (${ctxA.orgId}, ${ctxB.orgId}) group by org_id`,
      );
      expect(counts.rows.map(r => Number(r.org_id))).toEqual([ctxB.orgId]);
    });
  });

  test('ensure keeps one location per provider, endpoint and bucket, within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const locations = orgStorageLocationsRepository(tx);
      const { ctxA, ctxB } = await seedTwoOrgs(tx);
      const first = await locations.ensure(ctxA, place());
      expect(first).toMatchObject({ org_id: ctxA.orgId, provider: 's3', bucket: 'acme-files', region: 'eu-west-1' });
      const again = await locations.ensure(ctxA, place({ region: 'eu-west-2' }));
      expect(again).toMatchObject({ id: first.id, region: 'eu-west-2' });
      expect((await locations.ensure(ctxA, place({ ...R2_ELSEWHERE }))).id).not.toBe(first.id);
      expect((await locations.ensure(ctxA, place({ bucket: 'other' }))).id).not.toBe(first.id);
      const inB = await locations.ensure(ctxB, place());
      expect(inB.id).not.toBe(first.id);
      expect(inB.org_id).toBe(ctxB.orgId);
    });
  });

  test('a connection and a file reference only their own organisation’s location, which they keep', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, alice, bob, issueA, issueB } = await seedIssueWorld(tx);
      const location = await orgStorageLocationsRepository(tx).ensure(ctxA, place());
      const replaceInB = (sp: Queryable) =>
        orgStorageConfigsRepository(sp).replace(ctxB, connection(location.id), bob, new Date());
      expect(await failsInSavepoint(tx, replaceInB)).toBe(true);
      const insert = (ctx: TenantContext, row: AttachmentInsert) => (sp: Queryable) =>
        attachmentsRepository(sp).insert(ctx, row);
      expect(await failsInSavepoint(tx, insert(ctxB, theirs(bob, location.id, { issue_id: issueB.id })))).toBe(true);
      expect(
        await failsInSavepoint(tx, insert(ctxA, file(alice, { issue_id: issueA.id, storage_target: 'byo' }))),
      ).toBe(true);
      expect(
        await failsInSavepoint(
          tx,
          insert(ctxA, file(alice, { issue_id: issueA.id, storage_location_id: location.id })),
        ),
      ).toBe(true);
      await attachmentsRepository(tx).insert(ctxA, theirs(alice, location.id, { issue_id: issueA.id }));
      expect(
        await failsInSavepoint(tx, sp => sp.execute(`delete from org_storage_locations where id = ${location.id}`)),
      ).toBe(true);
    });
  });
});

describe('attachmentsRepository storage reads, tenant isolation', () => {
  test('tallies, the file list, the migration batch and the move answer only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const { ctxA, ctxB, alice, bob, issueA, issueB } = await seedIssueWorld(tx);
      const big = await repo.insert(ctxA, file(alice, { issue_id: issueA.id, size_bytes: 5000 }));
      await repo.insert(ctxA, file(alice, { issue_id: issueA.id, size_bytes: 10 }));
      await repo.insert(ctxA, file(alice, { size_bytes: 300 }));
      await repo.insert(ctxA, file(alice, { issue_id: issueA.id, completed_at: null, size_bytes: 70 }));
      const location = await orgStorageLocationsRepository(tx).ensure(ctxA, place({ bucket: 'theirs' }));
      await repo.insert(ctxA, theirs(alice, location.id, { issue_id: issueA.id, size_bytes: 40 }));
      await repo.insert(ctxB, file(bob, { issue_id: issueB.id, size_bytes: 9 }));

      expect(await repo.platformTally(ctxA)).toEqual({ files: 3, bytes: 5310 });
      expect(await repo.platformTally(ctxB)).toEqual({ files: 1, bytes: 9 });
      expect(await repo.reservedBytes(ctxA)).toBe(70);

      const tallies = await repo.storageTallies(ctxA);
      expect(tallies.find(t => t.draft)).toMatchObject({ files: 1, bytes: 300 });
      expect(tallies.find(t => t.storage_target === 'byo')).toMatchObject({
        storage_location_id: location.id,
        bucket: 'theirs',
        files: 1,
        bytes: 40,
      });
      expect(tallies.find(t => t.storage_target === 'platform')?.storage_location_id).toBeNull();
      expect((await repo.storageTallies(ctxB)).reduce((n, t) => n + t.files, 0)).toBe(1);

      const listA = await repo.listStorageFiles(ctxA, { sort: 'size', limit: 10, offset: 0 });
      expect(listA.total).toBe(3);
      expect(listA.rows.map(r => r.attachment.size_bytes)).toEqual([5000, 40, 10]);
      expect(listA.rows[0]).toMatchObject({ project_key: 'AC', issue_number: 1, parent_deleted_at: null });
      const listB = await repo.listStorageFiles(ctxB, { sort: 'size', limit: 10, offset: 0 });
      expect(listB.rows.map(r => r.attachment.size_bytes)).toEqual([9]);
      expect((await repo.listStorageFiles(ctxA, { sort: 'size', target: 'byo', limit: 10, offset: 0 })).total).toBe(1);

      expect((await repo.platformBatch(ctxB, 10)).map(r => r.size_bytes)).toEqual([9]);
      expect((await repo.platformBatch(ctxA, 10)).map(r => r.id)).toContain(big.id);
      const to = { id: location.id, bucket: location.bucket };
      expect(await repo.moveToLocation(ctxB, big.id, to)).toBeUndefined();
      expect(await repo.moveToLocation(ctxA, big.id, to)).toMatchObject({
        storage_target: 'byo',
        storage_location_id: location.id,
        bucket: 'theirs',
      });
      expect(await repo.moveToLocation(ctxA, big.id, to)).toBeUndefined();
      expect((await repo.platformBatch(ctxA, 10)).map(r => r.id)).not.toContain(big.id);
    });
  });

  test('the sweep holds back files of a failing connection’s location, and nothing else', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const configs = orgStorageConfigsRepository(tx);
      const { ctxA, alice, issueA } = await seedIssueWorld(tx);
      const at = new Date();
      const failing = await connect(tx, ctxA, alice, { bucket: 'theirs' });
      const elsewhere = await orgStorageLocationsRepository(tx).ensure(
        ctxA,
        place({ ...R2_ELSEWHERE, bucket: 'theirs' }),
      );
      const held = await repo.insert(ctxA, theirs(alice, failing.id, { issue_id: issueA.id }));
      const stray = await repo.insert(ctxA, theirs(alice, elsewhere.id, { issue_id: issueA.id }));
      const ours = await repo.insert(ctxA, file(alice, { issue_id: issueA.id }));
      await repo.softDelete(ctxA, [held.id, stray.id, ours.id], at);
      await configs.recordCheck(ctxA, { status: 'verified', last_error: null, at });
      await configs.markFailed(ctxA, 'delete.access_denied', at);

      const options = { pendingBefore: at, draftBefore: at, limit: 10_000 };
      const expired = (await repo.expired(sys, options)).map(r => r.id);
      expect(expired).toContain(ours.id);
      expect(expired).toContain(stray.id);
      expect(expired).not.toContain(held.id);
      await configs.recordCheck(ctxA, { status: 'verified', last_error: null, at });
      expect((await repo.expired(sys, options)).map(r => r.id)).toContain(held.id);
    });
  });

  test('the reconcile correction and the organisation list', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { ctxA, ctxB } = await seedTwoOrgs(tx);
      await orgs.setStorageUsed(ctxA, 1234);
      expect((await orgs.findById(ctxA))?.storage_used_bytes).toBe(1234);
      expect((await orgs.findById(ctxB))?.storage_used_bytes).toBe(0);
      const ids = await orgs.listLiveIds(sys);
      expect(ids).toContain(ctxA.orgId);
      expect(ids).toContain(ctxB.orgId);
    });
  });
});
