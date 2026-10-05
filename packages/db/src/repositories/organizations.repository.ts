import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  org_members,
  organizations,
  users,
  type NewOrgMemberRow,
  type NewOrganizationRow,
  type OrgMemberRow,
  type OrganizationRow,
  type UserRow,
} from '../schema/index.ts';
import type { StorageNoticeLevel } from '@nothingleft/types';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export interface MemberWithUser {
  membership: OrgMemberRow;
  user: UserRow;
}

export interface MemberListOptions {
  /** Matched against username, name and email, case-insensitively. */
  search?: string | undefined;
  limit: number;
  offset: number;
}

type OrganizationPatch = Partial<
  Pick<NewOrganizationRow, 'name' | 'slug' | 'workday_minutes' | 'workweek_days' | 'week_starts_on'>
>;
type MemberPatch = Partial<Pick<NewOrgMemberRow, 'username' | 'role'>>;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, c => `\\${c}`);

export function organizationsRepository(db: Queryable) {
  const activeIn = (ctx: TenantContext) => and(eq(org_members.org_id, ctx.orgId), isNull(org_members.removed_at));

  return {
    async create(_ctx: SystemContext, input: NewOrganizationRow): Promise<OrganizationRow> {
      const [row] = await db.insert(organizations).values(input).returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async findById(ctx: TenantContext): Promise<OrganizationRow | undefined> {
      return db.query.organizations.findFirst({
        where: and(eq(organizations.id, ctx.orgId), isNull(organizations.deleted_at)),
      });
    },

    async update(ctx: TenantContext, patch: OrganizationPatch): Promise<OrganizationRow | undefined> {
      const [row] = await db
        .update(organizations)
        .set({ ...patch, updated_at: new Date() })
        .where(and(eq(organizations.id, ctx.orgId), isNull(organizations.deleted_at)))
        .returning();
      return row;
    },

    async findBySlug(_ctx: SystemContext, slug: string): Promise<OrganizationRow | undefined> {
      return db.query.organizations.findFirst({
        where: and(eq(organizations.slug, slug), isNull(organizations.deleted_at)),
      });
    },

    /** A deleted organisation keeps its slug forever, so a script or header naming it never reaches a stranger's. */
    async slugTaken(_ctx: SystemContext, slug: string): Promise<boolean> {
      const [row] = await db.select({ n: count() }).from(organizations).where(eq(organizations.slug, slug));
      return (row?.n ?? 0) > 0;
    },

    // Slugs are global, so a derived slug is checked against every organisation, deleted ones included.
    async listSlugsWithPrefix(_ctx: SystemContext, prefix: string): Promise<string[]> {
      const rows = await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(ilike(organizations.slug, `${escapeLike(prefix)}%`));
      return rows.map(r => r.slug);
    },

    // Organisation resolution for PAT principals runs before any organisation is known
    // - docs/auth-and-tenancy.md#current-organisation.
    async listForUser(
      _ctx: SystemContext,
      userId: number,
    ): Promise<{ organization: OrganizationRow; membership: OrgMemberRow }[]> {
      return db
        .select({ organization: organizations, membership: org_members })
        .from(org_members)
        .innerJoin(organizations, eq(organizations.id, org_members.org_id))
        .where(and(eq(org_members.user_id, userId), isNull(org_members.removed_at), isNull(organizations.deleted_at)))
        .orderBy(org_members.joined_at);
    },

    async addMember(ctx: TenantContext, input: Omit<NewOrgMemberRow, 'org_id'>): Promise<OrgMemberRow> {
      const [row] = await db
        .insert(org_members)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async findMembership(ctx: TenantContext, userId: number): Promise<OrgMemberRow | undefined> {
      return db.query.org_members.findFirst({
        where: and(eq(org_members.org_id, ctx.orgId), eq(org_members.user_id, userId), isNull(org_members.removed_at)),
      });
    },

    /** Removed rows included: re-adding someone restores their username and join date. */
    async findAnyMembership(ctx: TenantContext, userId: number): Promise<OrgMemberRow | undefined> {
      return db.query.org_members.findFirst({
        where: and(eq(org_members.org_id, ctx.orgId), eq(org_members.user_id, userId)),
      });
    },

    async restoreMember(
      ctx: TenantContext,
      userId: number,
      patch: Pick<NewOrgMemberRow, 'role' | 'invited_by'>,
    ): Promise<OrgMemberRow | undefined> {
      const [row] = await db
        .update(org_members)
        .set({ ...patch, removed_at: null })
        .where(and(eq(org_members.org_id, ctx.orgId), eq(org_members.user_id, userId)))
        .returning();
      return row;
    },

    async updateMember(ctx: TenantContext, userId: number, patch: MemberPatch): Promise<OrgMemberRow | undefined> {
      const [row] = await db
        .update(org_members)
        .set(patch)
        .where(and(activeIn(ctx), eq(org_members.user_id, userId)))
        .returning();
      return row;
    },

    async removeMember(ctx: TenantContext, userId: number): Promise<OrgMemberRow | undefined> {
      const [row] = await db
        .update(org_members)
        .set({ removed_at: new Date() })
        .where(and(activeIn(ctx), eq(org_members.user_id, userId)))
        .returning();
      return row;
    },

    /** Serialises quota checks: two uploads cannot both fit into the last free bytes. */
    async lockById(ctx: TenantContext): Promise<OrganizationRow | undefined> {
      const [row] = await db
        .select()
        .from(organizations)
        .where(and(eq(organizations.id, ctx.orgId), isNull(organizations.deleted_at)))
        .for('update');
      return row;
    },

    /** Clamped at zero, so a release can never leave the counter negative; drift is the reconcile job's to report. */
    async adjustStorageUsed(ctx: TenantContext, delta: number): Promise<number> {
      const [row] = await db
        .update(organizations)
        .set({ storage_used_bytes: sql`greatest(0, ${organizations.storage_used_bytes} + ${delta})` })
        .where(eq(organizations.id, ctx.orgId))
        .returning({ used: organizations.storage_used_bytes });
      return row?.used ?? 0;
    },

    async scheduleDeletion(ctx: TenantContext, at: Date): Promise<OrganizationRow | undefined> {
      const [row] = await db
        .update(organizations)
        .set({ deletion_scheduled_at: at, deletion_reminder_sent_at: null, updated_at: at })
        .where(
          and(
            eq(organizations.id, ctx.orgId),
            isNull(organizations.deleted_at),
            isNull(organizations.deletion_scheduled_at),
          ),
        )
        .returning();
      return row;
    },

    async cancelDeletion(ctx: TenantContext): Promise<OrganizationRow | undefined> {
      const [row] = await db
        .update(organizations)
        .set({ deletion_scheduled_at: null, deletion_reminder_sent_at: null, updated_at: new Date() })
        .where(
          and(
            eq(organizations.id, ctx.orgId),
            isNull(organizations.deleted_at),
            isNotNull(organizations.deletion_scheduled_at),
          ),
        )
        .returning();
      return row;
    },

    /** Scheduled before `scheduledBefore` and not yet reminded: the deadline is within a day. */
    async listDeletionReminderDue(_ctx: SystemContext, scheduledBefore: Date): Promise<OrganizationRow[]> {
      return db
        .select()
        .from(organizations)
        .where(
          and(
            isNull(organizations.deleted_at),
            isNull(organizations.deletion_reminder_sent_at),
            lte(organizations.deletion_scheduled_at, scheduledBefore),
          ),
        )
        .orderBy(asc(organizations.id));
    },

    /** Claims the reminder, so an overlapping run cannot send it twice. */
    async markDeletionReminded(ctx: TenantContext, at: Date): Promise<boolean> {
      const rows = await db
        .update(organizations)
        .set({ deletion_reminder_sent_at: at })
        .where(
          and(
            eq(organizations.id, ctx.orgId),
            isNull(organizations.deletion_reminder_sent_at),
            isNotNull(organizations.deletion_scheduled_at),
          ),
        )
        .returning({ id: organizations.id });
      return rows.length > 0;
    },

    /**
     * Past the grace period and not finished: not yet stamped, or stamped with members left -
     * the purge removes them last, so a stamped deletion with members is one to resume.
     */
    async listDeletionDue(_ctx: SystemContext, scheduledBefore: Date): Promise<OrganizationRow[]> {
      return db
        .select()
        .from(organizations)
        .where(
          and(
            lte(organizations.deletion_scheduled_at, scheduledBefore),
            or(
              isNull(organizations.deleted_at),
              sql`exists (select 1 from ${org_members} where ${org_members.org_id} = ${organizations.id})`,
            ),
          ),
        )
        .orderBy(asc(organizations.id));
    },

    /** Stamps the deletion if the request still stands; a cancel that won the race leaves nothing to stamp. */
    async markDeleted(ctx: TenantContext, scheduledBefore: Date, at: Date): Promise<OrganizationRow | undefined> {
      const [row] = await db
        .update(organizations)
        .set({ deleted_at: at, storage_used_bytes: 0, updated_at: at })
        .where(
          and(
            eq(organizations.id, ctx.orgId),
            isNull(organizations.deleted_at),
            lte(organizations.deletion_scheduled_at, scheduledBefore),
          ),
        )
        .returning();
      return row;
    },

    async setOwner(ctx: TenantContext, userId: number): Promise<OrganizationRow | undefined> {
      const [row] = await db
        .update(organizations)
        .set({ owner_user_id: userId, updated_at: new Date() })
        .where(and(eq(organizations.id, ctx.orgId), isNull(organizations.deleted_at)))
        .returning();
      return row;
    },

    /** Organisations not yet deleted whose Owner this account is, a scheduled deletion included. */
    async listOwnedBy(_ctx: SystemContext, userId: number): Promise<OrganizationRow[]> {
      return db
        .select()
        .from(organizations)
        .where(and(eq(organizations.owner_user_id, userId), isNull(organizations.deleted_at)))
        .orderBy(asc(organizations.slug));
    },

    /** The reconcile job's correction, made under lockById. */
    async setStorageUsed(ctx: TenantContext, bytes: number): Promise<void> {
      await db.update(organizations).set({ storage_used_bytes: bytes }).where(eq(organizations.id, ctx.orgId));
    },

    /** Every organisation not deleted, for the nightly reconcile. */
    async listLiveIds(_ctx: SystemContext): Promise<number[]> {
      const rows = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(isNull(organizations.deleted_at))
        .orderBy(asc(organizations.id));
      return rows.map(r => r.id);
    },

    async setStorageNoticeLevel(ctx: TenantContext, level: StorageNoticeLevel): Promise<void> {
      await db.update(organizations).set({ storage_notice_level: level }).where(eq(organizations.id, ctx.orgId));
    },

    /** Org Admins and the Owner: who hears about the organisation's limits. */
    async listAdmins(ctx: TenantContext): Promise<MemberWithUser[]> {
      return db
        .select({ membership: org_members, user: users })
        .from(org_members)
        .innerJoin(users, eq(users.id, org_members.user_id))
        .innerJoin(organizations, eq(organizations.id, org_members.org_id))
        .where(
          and(
            activeIn(ctx),
            isNull(users.deleted_at),
            isNull(users.deactivated_at),
            or(eq(org_members.role, 'org_admin'), eq(organizations.owner_user_id, org_members.user_id)),
          ),
        )
        .orderBy(asc(org_members.user_id));
    },

    async countActiveMembers(ctx: TenantContext): Promise<number> {
      const [row] = await db.select({ n: count() }).from(org_members).where(activeIn(ctx));
      return row?.n ?? 0;
    },

    async listMembers(
      ctx: TenantContext,
      options: MemberListOptions,
    ): Promise<{ rows: MemberWithUser[]; total: number }> {
      const term = options.search?.trim().replace(/^@/, '');
      const pattern = term ? `%${escapeLike(term)}%` : undefined;
      const where = pattern
        ? and(
            activeIn(ctx),
            or(ilike(org_members.username, pattern), ilike(users.name, pattern), ilike(users.email, pattern)),
          )
        : activeIn(ctx);

      const [rows, [totals]] = await Promise.all([
        db
          .select({ membership: org_members, user: users })
          .from(org_members)
          .innerJoin(users, eq(users.id, org_members.user_id))
          .where(where)
          .orderBy(asc(sql`lower(${org_members.username})`))
          .limit(options.limit)
          .offset(options.offset),
        db.select({ n: count() }).from(org_members).innerJoin(users, eq(users.id, org_members.user_id)).where(where),
      ]);
      return { rows, total: totals?.n ?? 0 };
    },

    /** Removed members are included only on request: attribution resolves them, pickers do not. */
    async findMemberByUsername(
      ctx: TenantContext,
      username: string,
      options: { includeRemoved?: boolean } = {},
    ): Promise<MemberWithUser | undefined> {
      const byName = and(eq(org_members.org_id, ctx.orgId), sql`lower(${org_members.username}) = lower(${username})`);
      const [row] = await db
        .select({ membership: org_members, user: users })
        .from(org_members)
        .innerJoin(users, eq(users.id, org_members.user_id))
        .where(options.includeRemoved ? byName : and(byName, isNull(org_members.removed_at)))
        .limit(1);
      return row;
    },

    /** Live members unless asked otherwise, matched case-insensitively; names that match nobody are simply absent. */
    async findMembersByUsernames(
      ctx: TenantContext,
      usernames: string[],
      options: { includeRemoved?: boolean } = {},
    ): Promise<MemberWithUser[]> {
      if (usernames.length === 0) return [];
      const folded = [...new Set(usernames.map(u => u.toLowerCase()))];
      return db
        .select({ membership: org_members, user: users })
        .from(org_members)
        .innerJoin(users, eq(users.id, org_members.user_id))
        .where(
          and(
            options.includeRemoved ? eq(org_members.org_id, ctx.orgId) : activeIn(ctx),
            inArray(sql`lower(${org_members.username})`, folded),
          ),
        );
    },

    async findMemberByUserId(
      ctx: TenantContext,
      userId: number,
      options: { includeRemoved?: boolean } = {},
    ): Promise<MemberWithUser | undefined> {
      const byId = and(eq(org_members.org_id, ctx.orgId), eq(org_members.user_id, userId));
      const [row] = await db
        .select({ membership: org_members, user: users })
        .from(org_members)
        .innerJoin(users, eq(users.id, org_members.user_id))
        .where(options.includeRemoved ? byId : and(byId, isNull(org_members.removed_at)))
        .limit(1);
      return row;
    },

    /** Lowercased, removed members included: their handles stay reserved. */
    async listUsernamesWithPrefix(ctx: TenantContext, prefix: string): Promise<string[]> {
      const rows = await db
        .select({ username: sql<string>`lower(${org_members.username})` })
        .from(org_members)
        .where(and(eq(org_members.org_id, ctx.orgId), ilike(org_members.username, `${escapeLike(prefix)}%`)));
      return rows.map(r => r.username);
    },
  };
}

export type OrganizationsRepository = ReturnType<typeof organizationsRepository>;
