import { count, eq } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  attachments,
  comments,
  export_jobs,
  invitations,
  issues,
  mentions,
  notification_digests,
  notifications,
  one_time_tokens,
  org_members,
  org_storage_configs,
  org_storage_locations,
  projects,
  recent_searches,
  saved_views,
  tags,
  work_items,
} from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export interface PurgedCounts {
  projects: number;
  issues: number;
}

/**
 * Everything an organisation owns, for `org.delete`. The organisation row and `org_activity`
 * stay: attribution and the audit trail outlive it. Attachment rows must already be gone,
 * each after its object.
 */
export function organizationPurgeRepository(db: Queryable) {
  return {
    async purgeContents(ctx: TenantContext): Promise<PurgedCounts> {
      const [p] = await db.select({ n: count() }).from(projects).where(eq(projects.org_id, ctx.orgId));
      const [i] = await db.select({ n: count() }).from(issues).where(eq(issues.org_id, ctx.orgId));

      // Work items before projects: the project cascade reaches work types in one step but work
      // items only through issues, so the work-type key would be checked while they still exist.
      await db.delete(work_items).where(eq(work_items.org_id, ctx.orgId));
      // Then projects: their cascade takes statuses and issues together, and with them
      // everything project-scoped. What is left is organisation-level.
      await db.delete(projects).where(eq(projects.org_id, ctx.orgId));
      for (const table of [
        attachments,
        notifications,
        notification_digests,
        mentions,
        comments,
        tags,
        saved_views,
        recent_searches,
        export_jobs,
        invitations,
        one_time_tokens,
        org_storage_configs,
        org_storage_locations,
        org_members,
      ]) {
        await db.delete(table).where(eq(table.org_id, ctx.orgId));
      }
      return { projects: p?.n ?? 0, issues: i?.n ?? 0 };
    },
  };
}

export type OrganizationPurgeRepository = ReturnType<typeof organizationPurgeRepository>;
