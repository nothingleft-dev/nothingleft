import { createHash } from 'node:crypto';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import { recent_searches, type RecentSearchRow } from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

const hashOf = (query: string) => createHash('sha256').update(query).digest();

export function recentSearchesRepository(db: Queryable) {
  const mine = (ctx: TenantContext, userId: number) =>
    and(eq(recent_searches.org_id, ctx.orgId), eq(recent_searches.user_id, userId));

  return {
    /** Bumps a repeated query to the top and keeps only the newest `keep`. */
    async record(ctx: TenantContext, userId: number, query: string, keep: number, at: Date): Promise<void> {
      await db
        .insert(recent_searches)
        .values({ org_id: ctx.orgId, user_id: userId, query_hash: hashOf(query), query, last_used_at: at })
        .onConflictDoUpdate({
          target: [recent_searches.user_id, recent_searches.org_id, recent_searches.query_hash],
          set: { last_used_at: at, use_count: sql`${recent_searches.use_count} + 1` },
        });
      const kept = db
        .select({ hash: recent_searches.query_hash })
        .from(recent_searches)
        .where(mine(ctx, userId))
        .orderBy(desc(recent_searches.last_used_at))
        .limit(keep);
      await db.delete(recent_searches).where(and(mine(ctx, userId), notInArray(recent_searches.query_hash, kept)));
    },

    async list(ctx: TenantContext, userId: number, limit: number): Promise<RecentSearchRow[]> {
      return db
        .select()
        .from(recent_searches)
        .where(mine(ctx, userId))
        .orderBy(desc(recent_searches.last_used_at))
        .limit(limit);
    },

    async clear(ctx: TenantContext, userId: number): Promise<number> {
      const rows = await db.delete(recent_searches).where(mine(ctx, userId)).returning({ q: recent_searches.query });
      return rows.length;
    },
  };
}

export type RecentSearchesRepository = ReturnType<typeof recentSearchesRepository>;
