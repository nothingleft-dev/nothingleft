import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import { git_identities, org_members, type GitIdentityRow, type NewGitIdentityRow } from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

/**
 * A person's provider logins and emails. Like `users`, an identity has no organisation: the
 * caller checks its owner is a member of the organisation it is matching in.
 */
export function gitIdentitiesRepository(db: Queryable) {
  return {
    async findByProviderUser(
      _ctx: SystemContext,
      provider: string,
      baseUrl: string,
      providerUserId: string,
    ): Promise<GitIdentityRow | undefined> {
      const [row] = await db
        .select()
        .from(git_identities)
        .where(
          and(
            eq(git_identities.provider, provider),
            eq(git_identities.base_url, baseUrl),
            eq(git_identities.provider_user_id, providerUserId),
          ),
        );
      return row;
    },

    async findByLogin(
      _ctx: SystemContext,
      provider: string,
      baseUrl: string,
      login: string,
    ): Promise<GitIdentityRow | undefined> {
      const [row] = await db
        .select()
        .from(git_identities)
        .where(
          and(
            eq(git_identities.provider, provider),
            eq(git_identities.base_url, baseUrl),
            sql`lower(${git_identities.login}) = lower(${login})`,
          ),
        );
      return row;
    },

    /** Only a verified email claim matches anything. */
    async findByEmail(_ctx: SystemContext, email: string): Promise<GitIdentityRow | undefined> {
      const [row] = await db
        .select()
        .from(git_identities)
        .where(and(sql`lower(${git_identities.email}) = lower(${email})`, isNotNull(git_identities.verified_at)));
      return row;
    },

    async findById(_ctx: SystemContext, id: number): Promise<GitIdentityRow | undefined> {
      const [row] = await db.select().from(git_identities).where(eq(git_identities.id, id));
      return row;
    },

    /** The account's own claim of that address, verified or waiting for its link. */
    async findOwnEmail(_ctx: SystemContext, userId: number, email: string): Promise<GitIdentityRow | undefined> {
      const [row] = await db
        .select()
        .from(git_identities)
        .where(and(eq(git_identities.user_id, userId), sql`lower(${git_identities.email}) = lower(${email})`));
      return row;
    },

    async markVerified(_ctx: SystemContext, id: number, at: Date): Promise<GitIdentityRow | undefined> {
      const [row] = await db
        .update(git_identities)
        .set({ verified_at: at })
        .where(and(eq(git_identities.id, id), isNull(git_identities.verified_at)))
        .returning();
      return row;
    },

    /** The identities of the organisation's live members, for its admins. */
    async listForOrg(ctx: TenantContext): Promise<GitIdentityRow[]> {
      return db
        .select({ identity: git_identities })
        .from(git_identities)
        .innerJoin(org_members, eq(org_members.user_id, git_identities.user_id))
        .where(and(eq(org_members.org_id, ctx.orgId), isNull(org_members.removed_at)))
        .orderBy(asc(git_identities.user_id), asc(git_identities.id))
        .then(rows => rows.map(r => r.identity));
    },

    async listForUser(_ctx: SystemContext, userId: number): Promise<GitIdentityRow[]> {
      return db.select().from(git_identities).where(eq(git_identities.user_id, userId)).orderBy(asc(git_identities.id));
    },

    async insert(_ctx: SystemContext, input: Omit<NewGitIdentityRow, 'id'>): Promise<GitIdentityRow> {
      const [row] = await db.insert(git_identities).values(input).returning();
      return row!;
    },

    async remove(_ctx: SystemContext, userId: number, id: number): Promise<GitIdentityRow | undefined> {
      const [row] = await db
        .delete(git_identities)
        .where(and(eq(git_identities.user_id, userId), eq(git_identities.id, id)))
        .returning();
      return row;
    },

    /** Erasure: the account's identities go, so nothing matches it again. */
    async removeAllForUser(_ctx: SystemContext, userId: number): Promise<number> {
      const rows = await db
        .delete(git_identities)
        .where(eq(git_identities.user_id, userId))
        .returning({ id: git_identities.id });
      return rows.length;
    },
  };
}

export type GitIdentitiesRepository = ReturnType<typeof gitIdentitiesRepository>;
