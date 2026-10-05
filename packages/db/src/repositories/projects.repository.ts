import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  org_members,
  organizations,
  project_members,
  projects,
  users,
  type NewProjectMemberRow,
  type NewProjectRow,
  type OrgMemberRow,
  type ProjectMemberRow,
  type ProjectRow,
  type UserRow,
} from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export interface ProjectListOptions {
  /** Only projects this user is an explicit member of; omit for every project (an org admin's view). */
  memberUserId?: number | undefined;
  archived?: boolean | undefined;
  /** A project-restricted token's projects; applied before paging so the total is right. */
  ids?: readonly number[] | undefined;
  limit: number;
  offset: number;
}

export interface ProjectMemberWithUser {
  member: ProjectMemberRow;
  membership: OrgMemberRow;
  user: UserRow;
}

type ProjectPatch = Partial<
  Pick<
    NewProjectRow,
    | 'name'
    | 'key'
    | 'slug'
    | 'description_md'
    | 'avatar_color'
    | 'avatar_initials'
    | 'lead_user_id'
    | 'is_archived'
    | 'time_tracking_enabled'
  >
>;

export function projectsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(projects.org_id, ctx.orgId);

  return {
    async findByKey(ctx: TenantContext, key: string): Promise<ProjectRow | undefined> {
      return db.query.projects.findFirst({ where: and(inOrg(ctx), eq(projects.key, key)) });
    },

    async findById(ctx: TenantContext, id: number): Promise<ProjectRow | undefined> {
      return db.query.projects.findFirst({ where: and(inOrg(ctx), eq(projects.id, id)) });
    },

    /** Serialises a project's configuration writes; NO KEY UPDATE leaves inserts that reference the project unblocked. */
    async lockById(ctx: TenantContext, id: number): Promise<ProjectRow | undefined> {
      const [row] = await db
        .select()
        .from(projects)
        .where(and(inOrg(ctx), eq(projects.id, id)))
        .for('no key update');
      return row;
    },

    async create(ctx: TenantContext, input: Omit<NewProjectRow, 'org_id'>): Promise<ProjectRow> {
      const [row] = await db
        .insert(projects)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async update(ctx: TenantContext, id: number, patch: ProjectPatch): Promise<ProjectRow | undefined> {
      const [row] = await db
        .update(projects)
        .set({ ...patch, updated_at: new Date() })
        .where(and(inOrg(ctx), eq(projects.id, id)))
        .returning();
      return row;
    },

    /** Every key and slug in the organisation, archived included, for collision-free generation. */
    async listKeysAndSlugs(ctx: TenantContext): Promise<{ key: string; slug: string }[]> {
      return db.select({ key: projects.key, slug: projects.slug }).from(projects).where(inOrg(ctx));
    },

    async list(
      ctx: TenantContext,
      options: ProjectListOptions,
    ): Promise<{ rows: { project: ProjectRow; role: string | null }[]; total: number }> {
      const conditions = [inOrg(ctx)];
      if (options.archived !== undefined) conditions.push(eq(projects.is_archived, options.archived));
      if (options.ids !== undefined) conditions.push(inArray(projects.id, [...options.ids]));
      const joinOn = and(
        eq(project_members.project_id, projects.id),
        eq(project_members.org_id, projects.org_id),
        eq(project_members.user_id, options.memberUserId ?? ctx.userId ?? 0),
      );
      if (options.memberUserId !== undefined) conditions.push(sql`${project_members.user_id} is not null`);
      const where = and(...conditions);

      const [rows, [totals]] = await Promise.all([
        db
          .select({ project: projects, role: project_members.role })
          .from(projects)
          .leftJoin(project_members, joinOn)
          .where(where)
          .orderBy(asc(projects.name))
          .limit(options.limit)
          .offset(options.offset),
        db.select({ n: count() }).from(projects).leftJoin(project_members, joinOn).where(where),
      ]);
      return { rows, total: totals?.n ?? 0 };
    },

    // A PAT is user-level, so both its organisation resolution (rule 3) and its project
    // restriction span every organisation the owner belongs to
    // - docs/auth-and-tenancy.md#current-organisation.
    async listAcrossUserOrgs(
      _ctx: SystemContext,
      userId: number,
      by: { keys: string[] } | { ids: number[] },
    ): Promise<ProjectRow[]> {
      const match = 'keys' in by ? inArray(projects.key, by.keys) : inArray(projects.id, by.ids);
      if (('keys' in by ? by.keys : by.ids).length === 0) return [];

      const rows = await db
        .select({ project: projects })
        .from(projects)
        .innerJoin(org_members, and(eq(org_members.org_id, projects.org_id), eq(org_members.user_id, userId)))
        .where(and(match, isNull(org_members.removed_at)));
      return rows.map(r => r.project);
    },

    async findMember(ctx: TenantContext, projectId: number, userId: number): Promise<ProjectMemberRow | undefined> {
      return db.query.project_members.findFirst({
        where: and(
          eq(project_members.org_id, ctx.orgId),
          eq(project_members.project_id, projectId),
          eq(project_members.user_id, userId),
        ),
      });
    },

    /** Members whose organisation membership is live; a removed member holds no project seat. */
    async listMembers(ctx: TenantContext, projectId: number): Promise<ProjectMemberWithUser[]> {
      return db
        .select({ member: project_members, membership: org_members, user: users })
        .from(project_members)
        .innerJoin(
          org_members,
          and(eq(org_members.org_id, project_members.org_id), eq(org_members.user_id, project_members.user_id)),
        )
        .innerJoin(users, eq(users.id, project_members.user_id))
        .where(
          and(
            eq(project_members.org_id, ctx.orgId),
            eq(project_members.project_id, projectId),
            isNull(org_members.removed_at),
          ),
        )
        .orderBy(asc(sql`lower(${org_members.username})`));
    },

    /**
     * Who can open the project's issues, and so be assigned or added as a watcher: live
     * members of the project, plus the organisation's admins and owner, who need no row.
     * A deactivated account keeps what it has but is offered for nothing new.
     */
    async listAssignable(
      ctx: TenantContext,
      projectId: number,
      options: { userIds?: number[]; roles?: readonly string[] } = {},
    ): Promise<{ membership: OrgMemberRow; user: UserRow }[]> {
      if (options.userIds?.length === 0) return [];
      return db
        .select({ membership: org_members, user: users })
        .from(org_members)
        .innerJoin(users, eq(users.id, org_members.user_id))
        .innerJoin(organizations, eq(organizations.id, org_members.org_id))
        .leftJoin(
          project_members,
          and(
            eq(project_members.org_id, org_members.org_id),
            eq(project_members.user_id, org_members.user_id),
            eq(project_members.project_id, projectId),
          ),
        )
        .where(
          and(
            eq(org_members.org_id, ctx.orgId),
            isNull(org_members.removed_at),
            isNull(users.deactivated_at),
            isNull(users.deleted_at),
            options.userIds ? inArray(org_members.user_id, options.userIds) : undefined,
            or(
              options.roles
                ? inArray(project_members.role, [...options.roles])
                : sql`${project_members.user_id} is not null`,
              eq(org_members.role, 'org_admin'),
              eq(organizations.owner_user_id, org_members.user_id),
            ),
          ),
        )
        .orderBy(asc(sql`lower(${org_members.username})`));
    },

    async addMember(ctx: TenantContext, input: Omit<NewProjectMemberRow, 'org_id'>): Promise<ProjectMemberRow> {
      const [row] = await db
        .insert(project_members)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async updateMemberRole(
      ctx: TenantContext,
      projectId: number,
      userId: number,
      role: string,
    ): Promise<ProjectMemberRow | undefined> {
      const [row] = await db
        .update(project_members)
        .set({ role })
        .where(
          and(
            eq(project_members.org_id, ctx.orgId),
            eq(project_members.project_id, projectId),
            eq(project_members.user_id, userId),
          ),
        )
        .returning();
      return row;
    },

    async removeMember(ctx: TenantContext, projectId: number, userId: number): Promise<ProjectMemberRow | undefined> {
      const [row] = await db
        .delete(project_members)
        .where(
          and(
            eq(project_members.org_id, ctx.orgId),
            eq(project_members.project_id, projectId),
            eq(project_members.user_id, userId),
          ),
        )
        .returning();
      return row;
    },

    async removeAllMembershipsOf(ctx: TenantContext, userId: number): Promise<ProjectMemberRow[]> {
      return db
        .delete(project_members)
        .where(and(eq(project_members.org_id, ctx.orgId), eq(project_members.user_id, userId)))
        .returning();
    },

    // A counter row rather than a sequence: a rolled-back insert leaves no gap in PROJ-n
    // - docs/data-model.md#projects.
    async claimIssueNumber(ctx: TenantContext, projectId: number): Promise<number> {
      const [row] = await db
        .update(projects)
        .set({ issue_counter: sql`${projects.issue_counter} + 1` })
        .where(and(inOrg(ctx), eq(projects.id, projectId)))
        .returning({ n: projects.issue_counter });
      if (!row) throw new Error('project vanished inside its own transaction');
      return row.n;
    },

    /** Every project an org admin reads, or only those the user is an explicit member of. */
    async listReadable(
      ctx: TenantContext,
      userId: number,
      options: { everyProject: boolean },
    ): Promise<{ project: ProjectRow; role: string | null }[]> {
      return db
        .select({ project: projects, role: project_members.role })
        .from(projects)
        .leftJoin(
          project_members,
          and(
            eq(project_members.project_id, projects.id),
            eq(project_members.org_id, projects.org_id),
            eq(project_members.user_id, userId),
          ),
        )
        .where(and(inOrg(ctx), options.everyProject ? undefined : sql`${project_members.user_id} is not null`))
        .orderBy(asc(projects.name));
    },

    async listIds(ctx: TenantContext): Promise<number[]> {
      const rows = await db.select({ id: projects.id }).from(projects).where(inOrg(ctx));
      return rows.map(r => r.id);
    },
  };
}

export type ProjectsRepository = ReturnType<typeof projectsRepository>;
