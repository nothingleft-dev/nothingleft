import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  invitation_uses,
  invitations,
  org_members,
  users,
  type InvitationRow,
  type InvitationUseRow,
  type NewInvitationRow,
  type OrgMemberRow,
  type UserRow,
} from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export interface InvitationUseWithUser {
  use: InvitationUseRow;
  user: UserRow;
  membership: OrgMemberRow | null;
}

const live = sql`${invitations.revoked_at} is null and (${invitations.expires_at} is null or ${invitations.expires_at} > now())`;

export function invitationsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(invitations.org_id, ctx.orgId);

  return {
    async create(ctx: TenantContext, input: Omit<NewInvitationRow, 'org_id'>): Promise<InvitationRow> {
      const [row] = await db
        .insert(invitations)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async findById(ctx: TenantContext, id: number): Promise<InvitationRow | undefined> {
      return db.query.invitations.findFirst({ where: and(inOrg(ctx), eq(invitations.id, id)) });
    },

    // The invite landing page runs before the visitor belongs to any organisation.
    async findByTokenHash(_ctx: SystemContext, tokenHash: Buffer): Promise<InvitationRow | undefined> {
      return db.query.invitations.findFirst({ where: eq(invitations.token_hash, tokenHash) });
    },

    /** `projectId: null` lists the organisation-level invitations only. */
    async list(ctx: TenantContext, scope: { projectId: number | null }): Promise<InvitationRow[]> {
      return db.query.invitations.findMany({
        where: and(
          inOrg(ctx),
          scope.projectId === null ? isNull(invitations.project_id) : eq(invitations.project_id, scope.projectId),
        ),
        orderBy: desc(invitations.created_at),
      });
    },

    async revoke(ctx: TenantContext, id: number): Promise<InvitationRow | undefined> {
      const [row] = await db
        .update(invitations)
        .set({ revoked_at: new Date() })
        .where(and(inOrg(ctx), eq(invitations.id, id), isNull(invitations.revoked_at)))
        .returning();
      return row;
    },

    /** Re-inviting an address supersedes its pending invitation to the same scope. */
    async revokePendingEmail(ctx: TenantContext, email: string, projectId: number | null): Promise<InvitationRow[]> {
      return db
        .update(invitations)
        .set({ revoked_at: new Date() })
        .where(
          and(
            inOrg(ctx),
            eq(invitations.kind, 'email'),
            sql`lower(${invitations.email}) = lower(${email})`,
            projectId === null ? isNull(invitations.project_id) : eq(invitations.project_id, projectId),
            sql`${invitations.use_count} = 0`,
            live,
          ),
        )
        .returning();
    },

    async rotate(
      ctx: TenantContext,
      id: number,
      next: { token_hash: Buffer; token: string },
    ): Promise<InvitationRow | undefined> {
      const [row] = await db
        .update(invitations)
        .set(next)
        .where(and(inOrg(ctx), eq(invitations.id, id), eq(invitations.kind, 'link'), isNull(invitations.revoked_at)))
        .returning();
      return row;
    },

    /**
     * Spends one use atomically, so two people racing for the last seat of a
     * `max_uses` link cannot both get in. Undefined when the invitation is no longer live.
     */
    async claimUse(ctx: TenantContext, id: number): Promise<InvitationRow | undefined> {
      const [row] = await db
        .update(invitations)
        .set({ use_count: sql`${invitations.use_count} + 1` })
        .where(
          and(
            inOrg(ctx),
            eq(invitations.id, id),
            live,
            sql`(${invitations.max_uses} is null or ${invitations.use_count} < ${invitations.max_uses})`,
          ),
        )
        .returning();
      return row;
    },

    /** Inserts nothing when the invitation belongs to another organisation. */
    async recordUse(
      ctx: TenantContext,
      input: { invitation_id: number; user_id: number; ip: string | null },
    ): Promise<InvitationUseRow | undefined> {
      const [row] = await db
        .insert(invitation_uses)
        .select(
          db
            .select({
              invitation_id: invitations.id,
              user_id: sql<number>`${input.user_id}::bigint`.as('user_id'),
              used_at: sql<Date>`now()`.as('used_at'),
              ip: sql<string | null>`${input.ip}::inet`.as('ip'),
            })
            .from(invitations)
            .where(and(inOrg(ctx), eq(invitations.id, input.invitation_id))),
        )
        .onConflictDoNothing()
        .returning();
      return row;
    },

    async listUses(ctx: TenantContext, invitationId: number): Promise<InvitationUseWithUser[]> {
      return db
        .select({ use: invitation_uses, user: users, membership: org_members })
        .from(invitation_uses)
        .innerJoin(invitations, eq(invitations.id, invitation_uses.invitation_id))
        .innerJoin(users, eq(users.id, invitation_uses.user_id))
        .leftJoin(
          org_members,
          and(eq(org_members.org_id, invitations.org_id), eq(org_members.user_id, invitation_uses.user_id)),
        )
        .where(and(inOrg(ctx), eq(invitation_uses.invitation_id, invitationId)))
        .orderBy(desc(invitation_uses.used_at));
    },
  };
}

export type InvitationsRepository = ReturnType<typeof invitationsRepository>;
