import { and, eq, gt, ne, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import { organizations, sessions, type NewSessionRow, type SessionRow } from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export interface SessionWithOrg {
  session: SessionRow;
  organization_slug: string | null;
}

export function sessionsRepository(db: Queryable) {
  return {
    async create(_ctx: SystemContext, input: NewSessionRow): Promise<SessionRow> {
      const [row] = await db.insert(sessions).values(input).returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async findLiveByTokenHash(_ctx: SystemContext, tokenHash: Buffer): Promise<SessionRow | undefined> {
      return db.query.sessions.findFirst({
        where: and(eq(sessions.token_hash, tokenHash), gt(sessions.expires_at, sql`now()`)),
      });
    },

    async touch(_ctx: SystemContext, id: number, expiresAt: Date): Promise<void> {
      await db.update(sessions).set({ last_seen_at: new Date(), expires_at: expiresAt }).where(eq(sessions.id, id));
    },

    async setCurrentOrg(_ctx: SystemContext, id: number, orgId: number | null): Promise<void> {
      await db.update(sessions).set({ current_org_id: orgId }).where(eq(sessions.id, id));
    },

    /** Returns the ids so the caller can drop them from the session cache. */
    async clearCurrentOrgForUser(_ctx: SystemContext, userId: number, orgId: number): Promise<{ id: number }[]> {
      return db
        .update(sessions)
        .set({ current_org_id: null })
        .where(and(eq(sessions.user_id, userId), eq(sessions.current_org_id, orgId)))
        .returning({ id: sessions.id });
    },

    /** Every session pointing at a deleted organisation forgets it. */
    async clearCurrentOrg(ctx: TenantContext): Promise<{ id: number }[]> {
      return db
        .update(sessions)
        .set({ current_org_id: null })
        .where(eq(sessions.current_org_id, ctx.orgId))
        .returning({ id: sessions.id });
    },

    async countLiveForUser(_ctx: SystemContext, userId: number): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(sessions)
        .where(and(eq(sessions.user_id, userId), gt(sessions.expires_at, sql`now()`)));
      return row?.n ?? 0;
    },

    async listForUser(_ctx: SystemContext, userId: number): Promise<SessionWithOrg[]> {
      const rows = await db
        .select({ session: sessions, organization_slug: organizations.slug })
        .from(sessions)
        .leftJoin(organizations, eq(organizations.id, sessions.current_org_id))
        .where(and(eq(sessions.user_id, userId), gt(sessions.expires_at, sql`now()`)))
        .orderBy(sql`${sessions.last_seen_at} desc`);
      return rows.map(r => ({ session: r.session, organization_slug: r.organization_slug }));
    },

    async findForUser(_ctx: SystemContext, userId: number, id: number): Promise<SessionRow | undefined> {
      return db.query.sessions.findFirst({ where: and(eq(sessions.id, id), eq(sessions.user_id, userId)) });
    },

    async deleteForUser(_ctx: SystemContext, userId: number, id: number): Promise<SessionRow | undefined> {
      const [row] = await db
        .delete(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.user_id, userId)))
        .returning();
      return row;
    },

    async deleteAllForUser(_ctx: SystemContext, userId: number, exceptId?: number): Promise<{ id: number }[]> {
      return db
        .delete(sessions)
        .where(
          exceptId === undefined
            ? eq(sessions.user_id, userId)
            : and(eq(sessions.user_id, userId), ne(sessions.id, exceptId)),
        )
        .returning({ id: sessions.id });
    },

    async deleteExpired(_ctx: SystemContext): Promise<number> {
      const rows = await db
        .delete(sessions)
        .where(sql`${sessions.expires_at} <= now()`)
        .returning({ id: sessions.id });
      return rows.length;
    },
  };
}

export type SessionsRepository = ReturnType<typeof sessionsRepository>;
