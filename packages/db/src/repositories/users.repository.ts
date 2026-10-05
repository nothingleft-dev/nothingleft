import { and, eq, isNull, sql } from 'drizzle-orm';
import type { OAuthProvider } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import { org_members, users, type NewUserRow, type UserRow } from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export function usersRepository(db: Queryable) {
  return {
    async findById(_ctx: SystemContext, id: number): Promise<UserRow | undefined> {
      return db.query.users.findFirst({ where: eq(users.id, id) });
    },

    async findByEmail(_ctx: SystemContext, email: string): Promise<UserRow | undefined> {
      return db.query.users.findFirst({ where: sql`lower(${users.email}) = lower(${email})` });
    },

    async findByProviderId(
      _ctx: SystemContext,
      provider: OAuthProvider,
      providerId: string,
    ): Promise<UserRow | undefined> {
      const column = provider === 'google' ? users.google_id : users.github_id;
      return db.query.users.findFirst({ where: eq(column, providerId) });
    },

    async create(_ctx: SystemContext, input: NewUserRow): Promise<UserRow> {
      const [row] = await db.insert(users).values(input).returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async update(_ctx: SystemContext, id: number, patch: Partial<NewUserRow>): Promise<UserRow | undefined> {
      const [row] = await db
        .update(users)
        .set({ ...patch, updated_at: new Date() })
        .where(eq(users.id, id))
        .returning();
      return row;
    },

    /** Accepts a TOTP step only if it is later than the last one accepted, so a code is never used twice. */
    async claimTotpStep(_ctx: SystemContext, id: number, step: number): Promise<boolean> {
      const rows = await db
        .update(users)
        .set({ totp_last_used_step: step })
        .where(
          and(eq(users.id, id), sql`(${users.totp_last_used_step} is null or ${users.totp_last_used_step} < ${step})`),
        )
        .returning({ id: users.id });
      return rows.length > 0;
    },

    async setAvatarKeyIfEmpty(_ctx: SystemContext, id: number, key: string): Promise<boolean> {
      const rows = await db
        .update(users)
        .set({ avatar_object_key: key, updated_at: new Date() })
        .where(and(eq(users.id, id), isNull(users.avatar_object_key)))
        .returning({ id: users.id });
      return rows.length > 0;
    },

    async findMemberByUsername(ctx: TenantContext, username: string): Promise<UserRow | undefined> {
      const [row] = await db
        .select({ user: users })
        .from(org_members)
        .innerJoin(users, eq(users.id, org_members.user_id))
        .where(
          and(
            eq(org_members.org_id, ctx.orgId),
            sql`lower(${org_members.username}) = lower(${username})`,
            isNull(org_members.removed_at),
          ),
        )
        .limit(1);
      return row?.user;
    },

    async listMembers(ctx: TenantContext): Promise<UserRow[]> {
      const rows = await db
        .select({ user: users })
        .from(org_members)
        .innerJoin(users, eq(users.id, org_members.user_id))
        .where(and(eq(org_members.org_id, ctx.orgId), isNull(org_members.removed_at)))
        .orderBy(org_members.joined_at);
      return rows.map(r => r.user);
    },
  };
}

export type UsersRepository = ReturnType<typeof usersRepository>;
