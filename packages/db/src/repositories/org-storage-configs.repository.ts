import { and, eq, getTableColumns, lt, ne, sql } from 'drizzle-orm';
import type { ByoStatus } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import {
  org_storage_configs,
  org_storage_locations,
  type NewOrgStorageConfigRow,
  type OrgStorageConfigRow,
  type OrgStorageLocationRow,
} from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export type StorageConnectionInput = Pick<
  NewOrgStorageConfigRow,
  'location_id' | 'access_key_id' | 'secret_ciphertext'
>;

/** A connection with the location it points at: what a client is built from. */
export type StorageConnectionRow = OrgStorageConfigRow &
  Pick<OrgStorageLocationRow, 'provider' | 'endpoint' | 'region' | 'bucket'>;

export interface StorageCheckResult {
  status: ByoStatus;
  last_error: string | null;
  at: Date;
}

const locationColumns = {
  provider: org_storage_locations.provider,
  endpoint: org_storage_locations.endpoint,
  region: org_storage_locations.region,
  bucket: org_storage_locations.bucket,
};

export function orgStorageConfigsRepository(db: Queryable) {
  const ofOrg = (ctx: TenantContext) => eq(org_storage_configs.org_id, ctx.orgId);
  // updated_at is the migration's heartbeat too, so a check (which has checked_at) leaves it alone.

  const located = () =>
    db
      .select({ ...getTableColumns(org_storage_configs), ...locationColumns })
      .from(org_storage_configs)
      .innerJoin(
        org_storage_locations,
        and(
          eq(org_storage_locations.id, org_storage_configs.location_id),
          eq(org_storage_locations.org_id, org_storage_configs.org_id),
        ),
      );

  // A second read is safe: a location is never deleted while a connection points at it.
  async function withLocation(row: OrgStorageConfigRow | undefined): Promise<StorageConnectionRow | undefined> {
    if (!row) return undefined;
    const [location] = await db
      .select(locationColumns)
      .from(org_storage_locations)
      .where(and(eq(org_storage_locations.id, row.location_id), eq(org_storage_locations.org_id, row.org_id)));
    if (!location) throw new Error(`storage connection of organisation ${row.org_id} has no location`);
    return { ...row, ...location };
  }

  return {
    async find(ctx: TenantContext): Promise<StorageConnectionRow | undefined> {
      const [row] = await located().where(ofOrg(ctx)).limit(1);
      return row;
    },

    /** A new connection, or one replacing an unverified one: it starts over as pending, with no migration. */
    async replace(
      ctx: TenantContext,
      input: StorageConnectionInput,
      actorId: number,
      at: Date,
    ): Promise<StorageConnectionRow> {
      const fresh = {
        ...input,
        status: 'pending',
        verified_at: null,
        checked_at: null,
        last_error: null,
        migration_state: 'idle',
        migrated_bytes: 0,
        total_bytes: 0,
        migrated_files: 0,
        total_files: 0,
        migration_error: null,
        migration_started_at: null,
        migration_finished_at: null,
        updated_by: actorId,
        updated_at: at,
      } as const;
      const [row] = await db
        .insert(org_storage_configs)
        .values({ ...fresh, org_id: ctx.orgId, created_by: actorId, created_at: at })
        .onConflictDoUpdate({
          target: org_storage_configs.org_id,
          set: { ...fresh, created_by: actorId, created_at: at },
        })
        .returning();
      if (!row) throw new Error('upsert returned no row');
      return (await withLocation(row))!;
    },

    /** A key rotation on the same location: status and migration carry on untouched. */
    async rotate(
      ctx: TenantContext,
      input: Pick<StorageConnectionInput, 'access_key_id' | 'secret_ciphertext'>,
      actorId: number,
      at: Date,
    ): Promise<StorageConnectionRow | undefined> {
      const [row] = await db
        .update(org_storage_configs)
        .set({ ...input, updated_by: actorId, updated_at: at, checked_at: at })
        .where(ofOrg(ctx))
        .returning();
      return withLocation(row);
    },

    async recordCheck(ctx: TenantContext, result: StorageCheckResult): Promise<StorageConnectionRow | undefined> {
      const [row] = await db
        .update(org_storage_configs)
        .set({
          status: result.status,
          last_error: result.last_error,
          checked_at: result.at,
          ...(result.status === 'verified'
            ? { verified_at: sql`coalesce(${org_storage_configs.verified_at}, ${result.at})` }
            : {}),
        })
        .where(ofOrg(ctx))
        .returning();
      return withLocation(row);
    },

    /**
     * Marks a verified connection failed, once: only the call that flips it gets the row back,
     * so the failure email and event go out a single time.
     */
    async markFailed(ctx: TenantContext, lastError: string, at: Date): Promise<StorageConnectionRow | undefined> {
      const [row] = await db
        .update(org_storage_configs)
        .set({ status: 'failed', last_error: lastError, checked_at: at })
        .where(and(ofOrg(ctx), eq(org_storage_configs.status, 'verified')))
        .returning();
      return withLocation(row);
    },

    /** Starts or restarts a migration of a verified connection; a running one is left alone. */
    async startMigration(
      ctx: TenantContext,
      remaining: { files: number; bytes: number },
      at: Date,
    ): Promise<StorageConnectionRow | undefined> {
      const [row] = await db
        .update(org_storage_configs)
        .set({
          migration_state: 'running',
          total_bytes: sql`${org_storage_configs.migrated_bytes} + ${remaining.bytes}`,
          total_files: sql`${org_storage_configs.migrated_files} + ${remaining.files}`,
          migration_error: null,
          migration_started_at: sql`coalesce(${org_storage_configs.migration_started_at}, ${at})`,
          migration_finished_at: null,
          updated_at: at,
        })
        .where(
          and(
            ofOrg(ctx),
            eq(org_storage_configs.status, 'verified'),
            ne(org_storage_configs.migration_state, 'running'),
          ),
        )
        .returning();
      return withLocation(row);
    },

    /** One file moved; also the migration's heartbeat, through updated_at. */
    async recordMigrated(ctx: TenantContext, bytes: number, at: Date): Promise<void> {
      await db
        .update(org_storage_configs)
        .set({
          migrated_bytes: sql`${org_storage_configs.migrated_bytes} + ${bytes}`,
          migrated_files: sql`${org_storage_configs.migrated_files} + 1`,
          updated_at: at,
        })
        .where(ofOrg(ctx));
    },

    /** A file that could not move for good (its platform object is gone): the total stops counting it. */
    async recordSkipped(ctx: TenantContext, bytes: number, at: Date): Promise<void> {
      await db
        .update(org_storage_configs)
        .set({
          total_bytes: sql`greatest(${org_storage_configs.migrated_bytes}, ${org_storage_configs.total_bytes} - ${bytes})`,
          total_files: sql`greatest(${org_storage_configs.migrated_files}, ${org_storage_configs.total_files} - 1)`,
          updated_at: at,
        })
        .where(ofOrg(ctx));
    },

    async heartbeat(ctx: TenantContext, at: Date): Promise<void> {
      await db.update(org_storage_configs).set({ updated_at: at }).where(ofOrg(ctx));
    },

    async finishMigration(ctx: TenantContext, at: Date): Promise<StorageConnectionRow | undefined> {
      const [row] = await db
        .update(org_storage_configs)
        .set({ migration_state: 'done', migration_finished_at: at, updated_at: at })
        .where(and(ofOrg(ctx), eq(org_storage_configs.migration_state, 'running')))
        .returning();
      return withLocation(row);
    },

    async failMigration(ctx: TenantContext, error: string, at: Date): Promise<StorageConnectionRow | undefined> {
      const [row] = await db
        .update(org_storage_configs)
        .set({ migration_state: 'failed', migration_error: error, updated_at: at })
        .where(and(ofOrg(ctx), eq(org_storage_configs.migration_state, 'running')))
        .returning();
      return withLocation(row);
    },

    /** Forgets the credentials; the location stays, so the files' rows still say where they are. */
    async remove(ctx: TenantContext): Promise<StorageConnectionRow | undefined> {
      const [row] = await db.delete(org_storage_configs).where(ofOrg(ctx)).returning();
      return withLocation(row);
    },

    /** Every connection worth probing, across organisations, for the nightly reconcile. */
    async listActive(_ctx: SystemContext): Promise<StorageConnectionRow[]> {
      return located().where(ne(org_storage_configs.status, 'pending'));
    },

    /** Migrations marked running with no progress since `before`: their job died. */
    async listStalled(_ctx: SystemContext, before: Date): Promise<OrgStorageConfigRow[]> {
      return db
        .select()
        .from(org_storage_configs)
        .where(and(eq(org_storage_configs.migration_state, 'running'), lt(org_storage_configs.updated_at, before)));
    },
  };
}

export type OrgStorageConfigsRepository = ReturnType<typeof orgStorageConfigsRepository>;
