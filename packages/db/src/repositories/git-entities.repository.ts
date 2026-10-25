import { and, eq, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  git_branches,
  git_checks,
  git_commits,
  git_pull_request_commits,
  git_pull_requests,
  issue_git_links,
  type GitBranchRow,
  type GitCheckRow,
  type GitCommitRow,
  type GitPullRequestRow,
  type NewGitCheckRow,
  type NewGitCommitRow,
  type NewGitPullRequestRow,
} from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export type CommitInput = Omit<NewGitCommitRow, 'id' | 'org_id' | 'repository_id' | 'created_at' | 'superseded_at'>;
export type PullRequestInput = Omit<NewGitPullRequestRow, 'id' | 'org_id' | 'repository_id' | 'created_at'>;
export type CheckInput = Omit<NewGitCheckRow, 'id' | 'org_id' | 'repository_id'>;

/** Branches, commits, pull requests and checks: what a repository's deliveries describe. */
export function gitEntitiesRepository(db: Queryable) {
  return {
    async upsertBranch(
      ctx: TenantContext,
      repositoryId: number,
      name: string,
      headSha: string | null,
      at: Date,
    ): Promise<GitBranchRow> {
      const [row] = await db
        .insert(git_branches)
        .values({
          org_id: ctx.orgId,
          repository_id: repositoryId,
          name,
          head_sha: headSha,
          created_at: at,
          updated_at: at,
        })
        .onConflictDoUpdate({
          target: [git_branches.repository_id, git_branches.name],
          set: {
            head_sha: sql`coalesce(excluded.head_sha, ${git_branches.head_sha})`,
            deleted_at: null,
            updated_at: at,
          },
          setWhere: eq(git_branches.org_id, ctx.orgId),
        })
        .returning();
      return row!;
    },

    async deleteBranch(
      ctx: TenantContext,
      repositoryId: number,
      name: string,
      at: Date,
    ): Promise<GitBranchRow | undefined> {
      const [row] = await db
        .update(git_branches)
        .set({ deleted_at: at, updated_at: at })
        .where(
          and(
            eq(git_branches.org_id, ctx.orgId),
            eq(git_branches.repository_id, repositoryId),
            eq(git_branches.name, name),
          ),
        )
        .returning();
      return row;
    },

    async findBranch(ctx: TenantContext, repositoryId: number, name: string): Promise<GitBranchRow | undefined> {
      const [row] = await db
        .select()
        .from(git_branches)
        .where(
          and(
            eq(git_branches.org_id, ctx.orgId),
            eq(git_branches.repository_id, repositoryId),
            eq(git_branches.name, name),
          ),
        );
      return row;
    },

    async branchesByIds(ctx: TenantContext, ids: readonly number[]): Promise<GitBranchRow[]> {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(git_branches)
        .where(and(eq(git_branches.org_id, ctx.orgId), inArray(git_branches.id, [...ids])));
    },

    /** Commits are immutable: a known sha keeps its row, only a missing author link is filled in. */
    async upsertCommits(
      ctx: TenantContext,
      repositoryId: number,
      commits: readonly CommitInput[],
    ): Promise<GitCommitRow[]> {
      if (commits.length === 0) return [];
      return db
        .insert(git_commits)
        .values(commits.map(c => ({ ...c, org_id: ctx.orgId, repository_id: repositoryId })))
        .onConflictDoUpdate({
          target: [git_commits.repository_id, git_commits.sha],
          set: {
            author_user_id: sql`coalesce(${git_commits.author_user_id}, excluded.author_user_id)`,
            author_login: sql`coalesce(${git_commits.author_login}, excluded.author_login)`,
          },
          setWhere: eq(git_commits.org_id, ctx.orgId),
        })
        .returning();
    },

    async commitsBySha(ctx: TenantContext, repositoryId: number, shas: readonly string[]): Promise<GitCommitRow[]> {
      if (shas.length === 0) return [];
      return db
        .select()
        .from(git_commits)
        .where(
          and(
            eq(git_commits.org_id, ctx.orgId),
            eq(git_commits.repository_id, repositoryId),
            inArray(git_commits.sha, [...shas]),
          ),
        );
    },

    async commitsByIds(ctx: TenantContext, ids: readonly number[]): Promise<GitCommitRow[]> {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(git_commits)
        .where(and(eq(git_commits.org_id, ctx.orgId), inArray(git_commits.id, [...ids])));
    },

    /** Commits a force push left unreachable; returns those newly superseded. */
    async supersede(
      ctx: TenantContext,
      repositoryId: number,
      shas: readonly string[],
      at: Date,
    ): Promise<GitCommitRow[]> {
      if (shas.length === 0) return [];
      return db
        .update(git_commits)
        .set({ superseded_at: at })
        .where(
          and(
            eq(git_commits.org_id, ctx.orgId),
            eq(git_commits.repository_id, repositoryId),
            inArray(git_commits.sha, [...shas]),
            isNull(git_commits.superseded_at),
          ),
        )
        .returning();
    },

    async findPullRequest(
      ctx: TenantContext,
      repositoryId: number,
      number: number,
    ): Promise<GitPullRequestRow | undefined> {
      const [row] = await db
        .select()
        .from(git_pull_requests)
        .where(
          and(
            eq(git_pull_requests.org_id, ctx.orgId),
            eq(git_pull_requests.repository_id, repositoryId),
            eq(git_pull_requests.number, number),
          ),
        );
      return row;
    },

    /** Undefined when another writer stored that pull request first. */
    async insertPullRequest(
      ctx: TenantContext,
      repositoryId: number,
      input: PullRequestInput,
    ): Promise<GitPullRequestRow | undefined> {
      const [row] = await db
        .insert(git_pull_requests)
        .values({ ...input, org_id: ctx.orgId, repository_id: repositoryId })
        .onConflictDoNothing({ target: [git_pull_requests.repository_id, git_pull_requests.number] })
        .returning();
      return row;
    },

    async updatePullRequest(
      ctx: TenantContext,
      id: number,
      patch: Partial<PullRequestInput>,
    ): Promise<GitPullRequestRow | undefined> {
      const [row] = await db
        .update(git_pull_requests)
        .set(patch)
        .where(and(eq(git_pull_requests.org_id, ctx.orgId), eq(git_pull_requests.id, id)))
        .returning();
      return row;
    },

    async pullRequestsByIds(ctx: TenantContext, ids: readonly number[]): Promise<GitPullRequestRow[]> {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(git_pull_requests)
        .where(and(eq(git_pull_requests.org_id, ctx.orgId), inArray(git_pull_requests.id, [...ids])));
    },

    /** Pull requests whose head is that commit: what a check on it rolls up into. */
    async pullRequestsByHead(ctx: TenantContext, repositoryId: number, sha: string): Promise<GitPullRequestRow[]> {
      return db
        .select()
        .from(git_pull_requests)
        .where(
          and(
            eq(git_pull_requests.org_id, ctx.orgId),
            eq(git_pull_requests.repository_id, repositoryId),
            eq(git_pull_requests.head_sha, sha),
          ),
        );
    },

    /** Open and draft pull requests, for the nightly reconcile. */
    async openPullRequests(ctx: TenantContext, repositoryId: number): Promise<GitPullRequestRow[]> {
      return db
        .select()
        .from(git_pull_requests)
        .where(
          and(
            eq(git_pull_requests.org_id, ctx.orgId),
            eq(git_pull_requests.repository_id, repositoryId),
            inArray(git_pull_requests.state, ['open', 'draft']),
          ),
        );
    },

    /** The pull request's commits become exactly `commitIds`. */
    async setPullRequestCommits(
      ctx: TenantContext,
      pullRequestId: number,
      commitIds: readonly number[],
    ): Promise<void> {
      await db
        .delete(git_pull_request_commits)
        .where(
          and(
            eq(git_pull_request_commits.org_id, ctx.orgId),
            eq(git_pull_request_commits.pull_request_id, pullRequestId),
            commitIds.length ? notInArray(git_pull_request_commits.commit_id, [...commitIds]) : undefined,
          ),
        );
      if (commitIds.length === 0) return;
      await db
        .insert(git_pull_request_commits)
        .values(commitIds.map(commit_id => ({ pull_request_id: pullRequestId, commit_id, org_id: ctx.orgId })))
        .onConflictDoNothing();
    },

    async pullRequestCommits(
      ctx: TenantContext,
      pullRequestIds: readonly number[],
    ): Promise<{ pull_request_id: number; commit_id: number }[]> {
      if (pullRequestIds.length === 0) return [];
      return db
        .select({
          pull_request_id: git_pull_request_commits.pull_request_id,
          commit_id: git_pull_request_commits.commit_id,
        })
        .from(git_pull_request_commits)
        .where(
          and(
            eq(git_pull_request_commits.org_id, ctx.orgId),
            inArray(git_pull_request_commits.pull_request_id, [...pullRequestIds]),
          ),
        );
    },

    /** Only a newer report changes a check: a late delivery for an older run is dropped. */
    async upsertCheck(ctx: TenantContext, repositoryId: number, input: CheckInput): Promise<void> {
      await db
        .insert(git_checks)
        .values({ ...input, org_id: ctx.orgId, repository_id: repositoryId })
        .onConflictDoUpdate({
          target: [git_checks.repository_id, git_checks.sha, git_checks.external_id],
          set: {
            name: sql`excluded.name`,
            status: sql`excluded.status`,
            conclusion: sql`excluded.conclusion`,
            details_url: sql`excluded.details_url`,
            started_at: sql`excluded.started_at`,
            completed_at: sql`excluded.completed_at`,
            updated_at: sql`excluded.updated_at`,
          },
          setWhere: sql`${git_checks.org_id} = ${ctx.orgId} and excluded.updated_at >= ${git_checks.updated_at}`,
        });
    },

    async checksFor(ctx: TenantContext, repositoryId: number, sha: string): Promise<GitCheckRow[]> {
      return db
        .select()
        .from(git_checks)
        .where(
          and(eq(git_checks.org_id, ctx.orgId), eq(git_checks.repository_id, repositoryId), eq(git_checks.sha, sha)),
        )
        .orderBy(git_checks.name);
    },

    /** Erasure: what the provider recorded stays, the link to the erased account goes. */
    async forgetAuthor(_ctx: SystemContext, userId: number): Promise<void> {
      await db.update(git_commits).set({ author_user_id: null }).where(eq(git_commits.author_user_id, userId));
      await db
        .update(git_pull_requests)
        .set({ author_user_id: null })
        .where(eq(git_pull_requests.author_user_id, userId));
      await db
        .update(git_pull_requests)
        .set({ merged_by_user_id: null })
        .where(eq(git_pull_requests.merged_by_user_id, userId));
    },

    /** Checks of commits that are no pull request's head, older than `before`, across organisations. */
    async purgeStaleChecks(_ctx: SystemContext, before: Date, limit: number): Promise<number> {
      const victims = db
        .select({ id: git_checks.id })
        .from(git_checks)
        .where(
          and(
            lt(git_checks.updated_at, before),
            sql`not exists (select 1 from ${git_pull_requests} where ${git_pull_requests.repository_id} = ${git_checks.repository_id} and ${git_pull_requests.head_sha} = ${git_checks.sha})`,
          ),
        )
        .limit(limit);
      const rows = await db.delete(git_checks).where(inArray(git_checks.id, victims)).returning({ id: git_checks.id });
      return rows.length;
    },

    /**
     * Commits and pull requests no live link has needed for `unlinkedFor` (they came in with a
     * pull request whose reference went away), and commits superseded before `supersededBefore`.
     * Their link rows go in the same statement, since a link's target has no foreign key.
     */
    async purgeUnlinked(
      _ctx: SystemContext,
      supersededBefore: Date,
      unlinkedBefore: Date,
      limit: number,
    ): Promise<number> {
      const deadLinks = (type: 'commit' | 'pull_request', id: typeof git_commits.id | typeof git_pull_requests.id) =>
        sql`not exists (select 1 from ${issue_git_links} l where l.target_type = ${type} and l.target_id = ${id} and (l.removed_at is null or l.removed_at >= ${unlinkedBefore}))`;
      const commits = await db
        .delete(git_commits)
        .where(
          inArray(
            git_commits.id,
            db
              .select({ id: git_commits.id })
              .from(git_commits)
              .where(
                sql`(${git_commits.superseded_at} < ${supersededBefore} or (${lt(git_commits.created_at, unlinkedBefore)} and ${deadLinks('commit', git_commits.id)} and not exists (select 1 from ${git_pull_request_commits} pc join ${issue_git_links} l on l.target_type = 'pull_request' and l.target_id = pc.pull_request_id and l.removed_at is null where pc.commit_id = ${git_commits.id})))`,
              )
              .limit(limit),
          ),
        )
        .returning({ id: git_commits.id });
      const pulls = await db
        .delete(git_pull_requests)
        .where(
          inArray(
            git_pull_requests.id,
            db
              .select({ id: git_pull_requests.id })
              .from(git_pull_requests)
              .where(
                and(
                  lt(git_pull_requests.created_at, unlinkedBefore),
                  notInArray(git_pull_requests.state, ['open', 'draft']),
                  deadLinks('pull_request', git_pull_requests.id),
                ),
              )
              .limit(limit),
          ),
        )
        .returning({ id: git_pull_requests.id });
      const gone = [
        ...commits.map(c => ({ type: 'commit', id: c.id })),
        ...pulls.map(p => ({ type: 'pull_request', id: p.id })),
      ];
      for (const type of ['commit', 'pull_request'] as const) {
        const ids = gone.filter(g => g.type === type).map(g => g.id);
        if (ids.length) {
          await db
            .delete(issue_git_links)
            .where(and(eq(issue_git_links.target_type, type), inArray(issue_git_links.target_id, ids)));
        }
      }
      return gone.length;
    },
  };
}

export type GitEntitiesRepository = ReturnType<typeof gitEntitiesRepository>;
