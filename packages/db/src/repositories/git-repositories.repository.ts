import { and, asc, eq, exists, inArray, isNotNull, isNull, not, notInArray, sql, type SQL } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  git_repositories,
  project_repositories,
  projects,
  type GitRepositoryRow,
  type NewGitRepositoryRow,
  type ProjectRepositoryRow,
} from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export type DiscoveredRepository = Pick<
  NewGitRepositoryRow,
  'provider_repo_id' | 'full_name' | 'html_url' | 'default_branch' | 'is_private' | 'is_archived'
>;

export type GitRepositoryPatch = Partial<
  Pick<
    GitRepositoryRow,
    | 'full_name'
    | 'html_url'
    | 'default_branch'
    | 'is_private'
    | 'is_archived'
    | 'provider_webhook_id'
    | 'webhook_status'
    | 'webhook_last_status_code'
    | 'match_all_projects'
    | 'merge_base_branches'
    | 'backfill_state'
    | 'removed_at'
  >
>;

export interface GitRepositoryFilter {
  connectionIds?: readonly number[];
  /** Substring of the full name, case-insensitive. */
  q?: string;
  linked?: boolean;
  includeRemoved?: boolean;
}

export interface RepositoryCounts {
  connection_id: number;
  known: number;
  linked: number;
  webhooks_missing: number;
}

export type LinkedRepositoryRow = GitRepositoryRow & Pick<ProjectRepositoryRow, 'linked_by' | 'linked_at'>;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, c => `\\${c}`);

export function gitRepositoriesRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(git_repositories.org_id, ctx.orgId);
  const isLinked = (ctx: TenantContext) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(project_repositories)
        .where(
          and(eq(project_repositories.org_id, ctx.orgId), eq(project_repositories.repository_id, git_repositories.id)),
        ),
    );

  function filtered(ctx: TenantContext, filter: GitRepositoryFilter): SQL {
    const parts: SQL[] = [inOrg(ctx)];
    if (filter.connectionIds) parts.push(inArray(git_repositories.connection_id, [...filter.connectionIds]));
    if (filter.q) parts.push(sql`${git_repositories.full_name} ilike ${`%${escapeLike(filter.q)}%`}`);
    if (filter.linked !== undefined) parts.push(filter.linked ? isLinked(ctx) : not(isLinked(ctx)));
    if (!filter.includeRemoved) parts.push(isNull(git_repositories.removed_at));
    return and(...parts)!;
  }

  return {
    /** What the provider lists now: new rows inserted, known ones refreshed, a returning one revived. */
    async upsertDiscovered(
      ctx: TenantContext,
      connectionId: number,
      repos: readonly DiscoveredRepository[],
      at: Date,
    ): Promise<GitRepositoryRow[]> {
      if (repos.length === 0) return [];
      return db
        .insert(git_repositories)
        .values(
          repos.map(r => ({ ...r, org_id: ctx.orgId, connection_id: connectionId, created_at: at, updated_at: at })),
        )
        .onConflictDoUpdate({
          target: [git_repositories.connection_id, git_repositories.provider_repo_id],
          set: {
            full_name: sql`excluded.full_name`,
            html_url: sql`excluded.html_url`,
            default_branch: sql`excluded.default_branch`,
            is_private: sql`excluded.is_private`,
            is_archived: sql`excluded.is_archived`,
            removed_at: null,
            updated_at: at,
          },
          // The conflict target is per connection, and a connection belongs to one organisation.
          setWhere: eq(git_repositories.org_id, ctx.orgId),
        })
        .returning();
    },

    /** Repositories of a connection the provider no longer lists. */
    async markRemovedExcept(
      ctx: TenantContext,
      connectionId: number,
      keep: readonly string[],
      at: Date,
    ): Promise<GitRepositoryRow[]> {
      return db
        .update(git_repositories)
        .set({ removed_at: at, updated_at: at })
        .where(
          and(
            inOrg(ctx),
            eq(git_repositories.connection_id, connectionId),
            isNull(git_repositories.removed_at),
            keep.length ? notInArray(git_repositories.provider_repo_id, [...keep]) : undefined,
          ),
        )
        .returning();
    },

    async findById(ctx: TenantContext, id: number): Promise<GitRepositoryRow | undefined> {
      const [row] = await db
        .select()
        .from(git_repositories)
        .where(and(inOrg(ctx), eq(git_repositories.id, id)));
      return row;
    },

    async findByIds(ctx: TenantContext, ids: readonly number[]): Promise<GitRepositoryRow[]> {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(git_repositories)
        .where(and(inOrg(ctx), inArray(git_repositories.id, [...ids])));
    },

    async findByProviderId(
      ctx: TenantContext,
      connectionId: number,
      providerRepoId: string,
    ): Promise<GitRepositoryRow | undefined> {
      const [row] = await db
        .select()
        .from(git_repositories)
        .where(
          and(
            inOrg(ctx),
            eq(git_repositories.connection_id, connectionId),
            eq(git_repositories.provider_repo_id, providerRepoId),
          ),
        );
      return row;
    },

    /** Every repository of that name, case-insensitively, across the given connections. */
    async findByFullName(
      ctx: TenantContext,
      fullName: string,
      connectionIds: readonly number[],
    ): Promise<GitRepositoryRow[]> {
      if (connectionIds.length === 0) return [];
      return db
        .select()
        .from(git_repositories)
        .where(
          and(
            inOrg(ctx),
            inArray(git_repositories.connection_id, [...connectionIds]),
            sql`lower(${git_repositories.full_name}) = lower(${fullName})`,
          ),
        )
        .orderBy(asc(git_repositories.id));
    },

    async list(
      ctx: TenantContext,
      filter: GitRepositoryFilter,
      page: { limit: number; offset: number },
    ): Promise<{ rows: GitRepositoryRow[]; total: number }> {
      const where = filtered(ctx, filter);
      const [rows, [total]] = await Promise.all([
        db
          .select()
          .from(git_repositories)
          .where(where)
          .orderBy(sql`lower(${git_repositories.full_name})`, asc(git_repositories.id))
          .limit(page.limit)
          .offset(page.offset),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(git_repositories)
          .where(where),
      ]);
      return { rows, total: total?.n ?? 0 };
    },

    async update(
      ctx: TenantContext,
      id: number,
      patch: GitRepositoryPatch,
      at: Date,
    ): Promise<GitRepositoryRow | undefined> {
      const [row] = await db
        .update(git_repositories)
        .set({ ...patch, updated_at: at })
        .where(and(inOrg(ctx), eq(git_repositories.id, id)))
        .returning();
      return row;
    },

    async touch(ctx: TenantContext, id: number, at: Date): Promise<void> {
      await db
        .update(git_repositories)
        .set({ last_event_at: at })
        .where(and(inOrg(ctx), eq(git_repositories.id, id)));
    },

    /** Per connection: repositories known, linked to a project, and linked with a webhook not working. */
    async counts(ctx: TenantContext): Promise<RepositoryCounts[]> {
      const linked = isLinked(ctx);
      return db
        .select({
          connection_id: git_repositories.connection_id,
          known: sql<number>`count(*) filter (where ${git_repositories.removed_at} is null)::int`,
          linked: sql<number>`count(*) filter (where ${linked})::int`,
          webhooks_missing: sql<number>`count(*) filter (where ${linked} and ${git_repositories.webhook_status} in ('missing', 'failing'))::int`,
        })
        .from(git_repositories)
        .where(inOrg(ctx))
        .groupBy(git_repositories.connection_id);
    },

    async link(
      ctx: TenantContext,
      projectId: number,
      repositoryId: number,
      linkedBy: number,
      at: Date,
    ): Promise<ProjectRepositoryRow | undefined> {
      const [row] = await db
        .insert(project_repositories)
        .values({
          project_id: projectId,
          repository_id: repositoryId,
          org_id: ctx.orgId,
          linked_by: linkedBy,
          linked_at: at,
        })
        .onConflictDoNothing()
        .returning();
      return row;
    },

    async unlink(ctx: TenantContext, projectId: number, repositoryId: number): Promise<boolean> {
      const rows = await db
        .delete(project_repositories)
        .where(
          and(
            eq(project_repositories.org_id, ctx.orgId),
            eq(project_repositories.project_id, projectId),
            eq(project_repositories.repository_id, repositoryId),
          ),
        )
        .returning({ id: project_repositories.repository_id });
      return rows.length > 0;
    },

    async listForProject(ctx: TenantContext, projectId: number): Promise<LinkedRepositoryRow[]> {
      const rows = await db
        .select({
          repo: git_repositories,
          linked_by: project_repositories.linked_by,
          linked_at: project_repositories.linked_at,
        })
        .from(project_repositories)
        .innerJoin(
          git_repositories,
          and(
            eq(git_repositories.id, project_repositories.repository_id),
            eq(git_repositories.org_id, project_repositories.org_id),
          ),
        )
        .where(and(eq(project_repositories.org_id, ctx.orgId), eq(project_repositories.project_id, projectId)))
        .orderBy(sql`lower(${git_repositories.full_name})`);
      return rows.map(r => ({ ...r.repo, linked_by: r.linked_by, linked_at: r.linked_at }));
    },

    async countForProject(ctx: TenantContext, projectId: number): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(project_repositories)
        .where(and(eq(project_repositories.org_id, ctx.orgId), eq(project_repositories.project_id, projectId)));
      return row?.n ?? 0;
    },

    async projectLinks(
      ctx: TenantContext,
      repositoryIds: readonly number[],
    ): Promise<{ repository_id: number; project_id: number }[]> {
      if (repositoryIds.length === 0) return [];
      return db
        .select({ repository_id: project_repositories.repository_id, project_id: project_repositories.project_id })
        .from(project_repositories)
        .where(
          and(
            eq(project_repositories.org_id, ctx.orgId),
            inArray(project_repositories.repository_id, [...repositoryIds]),
          ),
        );
    },

    /**
     * The projects a repository's references may name: those it is linked to, or with
     * `everyProject` (the monorepo setting) every project of the organisation.
     */
    async scopeProjects(
      ctx: TenantContext,
      repositoryId: number,
      everyProject: boolean,
    ): Promise<{ id: number; key: string; is_archived: boolean }[]> {
      const columns = { id: projects.id, key: projects.key, is_archived: projects.is_archived };
      if (everyProject) return db.select(columns).from(projects).where(eq(projects.org_id, ctx.orgId));
      return db
        .select(columns)
        .from(projects)
        .innerJoin(
          project_repositories,
          and(eq(project_repositories.project_id, projects.id), eq(project_repositories.org_id, projects.org_id)),
        )
        .where(and(eq(projects.org_id, ctx.orgId), eq(project_repositories.repository_id, repositoryId)));
    },

    /** The repository, if still available to its connection, held until the caller's transaction ends. */
    async lockAvailable(ctx: TenantContext, id: number): Promise<GitRepositoryRow | undefined> {
      const [row] = await db
        .select()
        .from(git_repositories)
        .where(and(inOrg(ctx), eq(git_repositories.id, id), isNull(git_repositories.removed_at)))
        .for('share');
      return row;
    },

    /**
     * Whether the repository serves the project now (available, and linked to it or matching every
     * project), holding both rows so an unlink waits for the caller's transaction or is seen by it.
     */
    async lockServing(ctx: TenantContext, repositoryId: number, projectId: number): Promise<boolean> {
      const [repo] = await db
        .select({ match_all_projects: git_repositories.match_all_projects })
        .from(git_repositories)
        .where(and(inOrg(ctx), eq(git_repositories.id, repositoryId), isNull(git_repositories.removed_at)))
        .for('share');
      if (!repo) return false;
      if (repo.match_all_projects) return true;
      const [link] = await db
        .select({ project_id: project_repositories.project_id })
        .from(project_repositories)
        .where(
          and(
            eq(project_repositories.org_id, ctx.orgId),
            eq(project_repositories.repository_id, repositoryId),
            eq(project_repositories.project_id, projectId),
          ),
        )
        .for('share');
      return link !== undefined;
    },

    /** Linked repositories of a connection whose webhook we registered, for re-registration and removal. */
    async listHooked(ctx: TenantContext, connectionId: number): Promise<GitRepositoryRow[]> {
      return db
        .select()
        .from(git_repositories)
        .where(
          and(
            inOrg(ctx),
            eq(git_repositories.connection_id, connectionId),
            isNotNull(git_repositories.provider_webhook_id),
          ),
        );
    },
  };
}

export type GitRepositoriesRepository = ReturnType<typeof gitRepositoriesRepository>;
