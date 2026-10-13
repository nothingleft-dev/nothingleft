import type { OrgPlan } from '@nothingleft/types';
import { tenantContext, type AttachmentRow, type TenantContext } from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { PURGE_BATCH, PURGE_RUN_MS } from '@config/constants';
import { releaseStorage } from '@services/attachment-writer';
import { isByoUnavailable, type ObjectStores } from '@services/object-stores';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface PurgeDeps {
  inTransaction: InTenantTransaction;
  stores: Pick<ObjectStores, 'deleteObjects'>;
  analytics: Analytics;
  storageLimit: (plan: OrgPlan) => number;
  now: () => Date;
}

/** What is purged: issues or articles, each claimed by id and holding its files by that id. */
export interface PurgeTarget {
  claim(repos: TenantRepos, ctx: TenantContext, limit: number): Promise<number[]>;
  files(repos: TenantRepos, ctx: TenantContext, ids: number[]): Promise<AttachmentRow[]>;
  /** Deletes those of `ids` still due, and returns them. */
  purge(repos: TenantRepos, ctx: TenantContext, ids: number[]): Promise<number[]>;
  holder(file: AttachmentRow): number | null;
}

/**
 * Hard-deletes, a batch at a time, the rows deleted past their restore window: claim, delete the
 * objects with no transaction open, then one short transaction for the rows and the bytes.
 */
export async function purgeDeleted(deps: PurgeDeps, orgIds: number[], target: PurgeTarget): Promise<number> {
  const deadline = deps.now().getTime() + PURGE_RUN_MS;
  const outOfTime = () => deps.now().getTime() > deadline;
  let purged = 0;
  for (const orgId of orgIds) {
    if (outOfTime()) break;
    const ctx = tenantContext(orgId);
    try {
      for (;;) {
        const { ids, files } = await deps.inTransaction(async repos => {
          const ids = await target.claim(repos, ctx, PURGE_BATCH);
          return { ids, files: await target.files(repos, ctx, ids) };
        });
        if (ids.length === 0) break;
        // Objects first: a row deleted before its object would leave the file unreachable and unbilled, forever.
        await deps.stores.deleteObjects(ctx, files);
        purged += await deps.inTransaction(async repos => {
          const gone = new Set<number | null>(await target.purge(repos, ctx, ids));
          await releaseStorage(
            repos,
            ctx,
            files.filter(f => f.deleted_at === null && gone.has(target.holder(f))),
            deps.storageLimit,
          );
          return gone.size;
        });
        if (ids.length < PURGE_BATCH || outOfTime()) break;
      }
    } catch (error) {
      // One organisation's storage outage must not keep every other organisation's deleted rows.
      // A failing customer bucket waits for its admins, who were already told; nothing to report.
      if (!isByoUnavailable(error)) deps.analytics.captureException(error, { org_id: orgId });
    }
  }
  return purged;
}
