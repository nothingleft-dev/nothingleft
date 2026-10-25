import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { GitLinkIntent, GitLinkSource, GitLinkTarget } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import { issue_git_links, issues, project_repositories, type IssueGitLinkRow } from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export interface LinkTarget {
  target_type: GitLinkTarget;
  target_id: number;
}

export interface GitLinkedIssue {
  id: number;
  project_id: number;
  key_number: number;
  deleted_at: Date | null;
}

export interface LinkInsert extends LinkTarget {
  issue_id: number;
  repository_id: number;
  sources: GitLinkSource[];
  intent: GitLinkIntent;
  created_by: number | null;
  at: Date;
}

export function gitLinksRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(issue_git_links.org_id, ctx.orgId);

  return {
    /** Every link of one branch, commit or pull request, removed ones included. */
    async forTarget(ctx: TenantContext, target: LinkTarget): Promise<IssueGitLinkRow[]> {
      return db
        .select()
        .from(issue_git_links)
        .where(
          and(
            inOrg(ctx),
            eq(issue_git_links.target_type, target.target_type),
            eq(issue_git_links.target_id, target.target_id),
          ),
        );
    },

    async forTargets(ctx: TenantContext, type: GitLinkTarget, ids: readonly number[]): Promise<IssueGitLinkRow[]> {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(issue_git_links)
        .where(and(inOrg(ctx), eq(issue_git_links.target_type, type), inArray(issue_git_links.target_id, [...ids])));
    },

    async findById(ctx: TenantContext, id: number): Promise<IssueGitLinkRow | undefined> {
      const [row] = await db
        .select()
        .from(issue_git_links)
        .where(and(inOrg(ctx), eq(issue_git_links.id, id)));
      return row;
    },

    /** Undefined when the issue already has a link to that target (a concurrent writer made it). */
    async insert(ctx: TenantContext, input: LinkInsert): Promise<IssueGitLinkRow | undefined> {
      const [row] = await db
        .insert(issue_git_links)
        .values({
          org_id: ctx.orgId,
          issue_id: input.issue_id,
          repository_id: input.repository_id,
          target_type: input.target_type,
          target_id: input.target_id,
          sources: input.sources,
          intent: input.intent,
          created_by: input.created_by,
          created_at: input.at,
          updated_at: input.at,
        })
        .onConflictDoNothing({
          target: [issue_git_links.issue_id, issue_git_links.target_type, issue_git_links.target_id],
        })
        .returning();
      return row;
    },

    async update(
      ctx: TenantContext,
      id: number,
      patch: Partial<
        Pick<IssueGitLinkRow, 'sources' | 'intent' | 'removed_at' | 'removed_by' | 'removed_sources' | 'created_by'>
      > & { updated_at: Date },
    ): Promise<IssueGitLinkRow | undefined> {
      const [row] = await db
        .update(issue_git_links)
        .set(patch)
        .where(and(inOrg(ctx), eq(issue_git_links.id, id)))
        .returning();
      return row;
    },

    /** The live links of these issues, oldest first. */
    async liveForIssues(ctx: TenantContext, issueIds: readonly number[]): Promise<IssueGitLinkRow[]> {
      if (issueIds.length === 0) return [];
      return db
        .select()
        .from(issue_git_links)
        .where(and(inOrg(ctx), inArray(issue_git_links.issue_id, [...issueIds]), isNull(issue_git_links.removed_at)))
        .orderBy(asc(issue_git_links.id));
    },

    /** Issues of these projects by number, soft-deleted ones included: a reference may name either. */
    async issuesByNumbers(
      ctx: TenantContext,
      wanted: readonly { project_id: number; number: number }[],
    ): Promise<GitLinkedIssue[]> {
      if (wanted.length === 0) return [];
      return db
        .select({
          id: issues.id,
          project_id: issues.project_id,
          key_number: issues.key_number,
          deleted_at: issues.deleted_at,
        })
        .from(issues)
        .where(
          and(
            eq(issues.org_id, ctx.orgId),
            or(...wanted.map(w => and(eq(issues.project_id, w.project_id), eq(issues.key_number, w.number)))),
          ),
        );
    },

    async issuesByIds(ctx: TenantContext, ids: readonly number[]): Promise<GitLinkedIssue[]> {
      if (ids.length === 0) return [];
      return db
        .select({
          id: issues.id,
          project_id: issues.project_id,
          key_number: issues.key_number,
          deleted_at: issues.deleted_at,
        })
        .from(issues)
        .where(and(eq(issues.org_id, ctx.orgId), inArray(issues.id, [...ids])));
    },

    /** Which of these projects have a linked repository: the git-enabled ones. */
    async gitEnabledProjects(ctx: TenantContext, projectIds: readonly number[]): Promise<Set<number>> {
      if (projectIds.length === 0) return new Set();
      const rows = await db
        .selectDistinct({ project_id: project_repositories.project_id })
        .from(project_repositories)
        .where(
          and(eq(project_repositories.org_id, ctx.orgId), inArray(project_repositories.project_id, [...projectIds])),
        );
      return new Set(rows.map(r => r.project_id));
    },

    async countLiveByIssue(ctx: TenantContext, issueIds: readonly number[]): Promise<Map<number, number>> {
      if (issueIds.length === 0) return new Map();
      const rows = await db
        .select({ issue_id: issue_git_links.issue_id, n: sql<number>`count(*)::int` })
        .from(issue_git_links)
        .where(and(inOrg(ctx), inArray(issue_git_links.issue_id, [...issueIds]), isNull(issue_git_links.removed_at)))
        .groupBy(issue_git_links.issue_id);
      return new Map(rows.map(r => [r.issue_id, r.n]));
    },
  };
}

export type GitLinksRepository = ReturnType<typeof gitLinksRepository>;
