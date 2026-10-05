import type { Queryable } from '../client.ts';
import { org_storage_locations, type NewOrgStorageLocationRow, type OrgStorageLocationRow } from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export type StorageLocationInput = Pick<NewOrgStorageLocationRow, 'provider' | 'endpoint' | 'region' | 'bucket'>;

export function orgStorageLocationsRepository(db: Queryable) {
  return {
    /** The organisation's location for this provider, endpoint and bucket; the latest connect sets its signing region. */
    async ensure(ctx: TenantContext, location: StorageLocationInput): Promise<OrgStorageLocationRow> {
      const [row] = await db
        .insert(org_storage_locations)
        .values({
          org_id: ctx.orgId,
          provider: location.provider,
          endpoint: location.endpoint,
          region: location.region,
          bucket: location.bucket,
        })
        .onConflictDoUpdate({
          target: [
            org_storage_locations.org_id,
            org_storage_locations.provider,
            org_storage_locations.endpoint,
            org_storage_locations.bucket,
          ],
          set: { region: location.region },
        })
        .returning();
      if (!row) throw new Error('upsert returned no row');
      return row;
    },
  };
}

export type OrgStorageLocationsRepository = ReturnType<typeof orgStorageLocationsRepository>;
