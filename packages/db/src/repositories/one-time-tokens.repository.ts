import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { OneTimeTokenPurpose } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import { one_time_tokens, type NewOneTimeTokenRow, type OneTimeTokenRow } from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export function oneTimeTokensRepository(db: Queryable) {
  return {
    async create(_ctx: SystemContext, input: NewOneTimeTokenRow): Promise<OneTimeTokenRow> {
      const [row] = await db.insert(one_time_tokens).values(input).returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async findUnused(
      _ctx: SystemContext,
      purpose: OneTimeTokenPurpose,
      tokenHash: Buffer,
    ): Promise<OneTimeTokenRow | undefined> {
      return db.query.one_time_tokens.findFirst({
        where: and(
          eq(one_time_tokens.token_hash, tokenHash),
          eq(one_time_tokens.purpose, purpose),
          isNull(one_time_tokens.used_at),
        ),
      });
    },

    async consume(_ctx: SystemContext, id: number): Promise<OneTimeTokenRow | undefined> {
      const [row] = await db
        .update(one_time_tokens)
        .set({ used_at: new Date() })
        .where(and(eq(one_time_tokens.id, id), isNull(one_time_tokens.used_at)))
        .returning();
      return row;
    },

    /** Tokens of one purpose issued to the account since `since`, optionally for one address. */
    async countRecent(
      _ctx: SystemContext,
      userId: number,
      purpose: OneTimeTokenPurpose,
      since: Date,
      newEmail?: string,
    ): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(one_time_tokens)
        .where(
          and(
            eq(one_time_tokens.user_id, userId),
            eq(one_time_tokens.purpose, purpose),
            gt(one_time_tokens.created_at, since),
            newEmail === undefined ? undefined : sql`lower(${one_time_tokens.new_email}) = lower(${newEmail})`,
          ),
        );
      return row?.n ?? 0;
    },

    async deleteForUser(_ctx: SystemContext, userId: number, purpose: OneTimeTokenPurpose): Promise<void> {
      await db
        .delete(one_time_tokens)
        .where(and(eq(one_time_tokens.user_id, userId), eq(one_time_tokens.purpose, purpose)));
    },

    async findLiveTransfer(ctx: TenantContext): Promise<OneTimeTokenRow | undefined> {
      return db.query.one_time_tokens.findFirst({
        where: and(
          eq(one_time_tokens.org_id, ctx.orgId),
          eq(one_time_tokens.purpose, 'ownership_transfer'),
          isNull(one_time_tokens.used_at),
          gt(one_time_tokens.expires_at, sql`now()`),
        ),
      });
    },

    async deleteTransfers(ctx: TenantContext): Promise<OneTimeTokenRow[]> {
      return db
        .delete(one_time_tokens)
        .where(
          and(
            eq(one_time_tokens.org_id, ctx.orgId),
            eq(one_time_tokens.purpose, 'ownership_transfer'),
            isNull(one_time_tokens.used_at),
          ),
        )
        .returning();
    },

    /** Unused tokens for the account, and transfers it offered: a deactivated account can act on none. */
    async deleteAllInvolving(_ctx: SystemContext, userId: number): Promise<OneTimeTokenRow[]> {
      return db
        .delete(one_time_tokens)
        .where(
          and(
            isNull(one_time_tokens.used_at),
            or(eq(one_time_tokens.user_id, userId), eq(one_time_tokens.created_by, userId)),
          ),
        )
        .returning();
    },

    async deleteExpired(_ctx: SystemContext): Promise<number> {
      const rows = await db
        .delete(one_time_tokens)
        .where(sql`${one_time_tokens.expires_at} <= now() or ${one_time_tokens.used_at} is not null`)
        .returning({ id: one_time_tokens.id });
      return rows.length;
    },
  };
}

export type OneTimeTokensRepository = ReturnType<typeof oneTimeTokensRepository>;
