import { and, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  org_activity,
  org_members,
  users,
  type NewOrgActivityRow,
  type OrgActivityRow,
  type OrgMemberRow,
  type UserRow,
} from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export interface OrgActivityFilter {
  actorId?: number | undefined;
  kinds?: string[] | undefined;
  /** Inclusive. */
  from?: Date | undefined;
  /** Exclusive. */
  to?: Date | undefined;
  /** Keyset cursor: rows strictly older than this id. */
  beforeId?: number | undefined;
  limit: number;
}

export interface OrgActivityWithActor {
  activity: OrgActivityRow;
  actor: UserRow | null;
  actor_membership: OrgMemberRow | null;
}

function matching(ctx: TenantContext, filter: Omit<OrgActivityFilter, 'limit'>): SQL[] {
  const conditions: SQL[] = [eq(org_activity.org_id, ctx.orgId)];
  if (filter.actorId !== undefined) conditions.push(eq(org_activity.actor_id, filter.actorId));
  if (filter.kinds && filter.kinds.length > 0) conditions.push(inArray(org_activity.kind, filter.kinds));
  if (filter.from) conditions.push(gte(org_activity.created_at, filter.from));
  if (filter.to) conditions.push(lt(org_activity.created_at, filter.to));
  if (filter.beforeId !== undefined) conditions.push(lt(org_activity.id, filter.beforeId));
  return conditions;
}

// Insert and select only. The table is append-only; there is deliberately no update or delete here.
export function orgActivityRepository(db: Queryable) {
  return {
    async record(ctx: TenantContext, input: Omit<NewOrgActivityRow, 'org_id'>): Promise<OrgActivityRow> {
      const [row] = await db
        .insert(org_activity)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async list(ctx: TenantContext, filter: OrgActivityFilter): Promise<OrgActivityWithActor[]> {
      return db
        .select({ activity: org_activity, actor: users, actor_membership: org_members })
        .from(org_activity)
        .leftJoin(users, eq(users.id, org_activity.actor_id))
        .leftJoin(
          org_members,
          and(eq(org_members.org_id, org_activity.org_id), eq(org_members.user_id, org_activity.actor_id)),
        )
        .where(and(...matching(ctx, filter)))
        .orderBy(desc(org_activity.id))
        .limit(filter.limit);
    },

    async count(ctx: TenantContext, filter: Omit<OrgActivityFilter, 'beforeId' | 'limit'>): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(org_activity)
        .where(and(...matching(ctx, filter)));
      return row?.n ?? 0;
    },
  };
}

export type OrgActivityRepository = ReturnType<typeof orgActivityRepository>;
