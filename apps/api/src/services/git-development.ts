import type { GitDevelopmentSummary, GitPullRequestState, GitReviewState, GitCiState } from '@nothingleft/types';
import type { GitEntitiesRepository, GitLinksRepository, IssueGitLinkRow, TenantContext } from '@nothingleft/db';
import { developmentRollup } from '@git/rollup';

export interface DevelopmentReaderDeps {
  links: GitLinksRepository;
  entities: GitEntitiesRepository;
}

export interface DevelopmentSummaries {
  /** Projects with a linked repository: everything git-related shows only for these. */
  enabled: ReadonlySet<number>;
  byIssue: ReadonlyMap<number, GitDevelopmentSummary>;
}

const NONE: GitDevelopmentSummary = { rollup: 'none', pull_requests: 0, commits: 0, branches: 0, repositories: 0 };

/** The badge and counts lists and boards show, for many issues at once, from their live links. */
export function developmentReader({ links, entities }: DevelopmentReaderDeps) {
  return {
    async summaries(
      ctx: TenantContext,
      issues: readonly { id: number; project_id: number }[],
    ): Promise<DevelopmentSummaries> {
      const enabled = await links.gitEnabledProjects(ctx, [...new Set(issues.map(i => i.project_id))]);
      const wanted = issues.filter(i => enabled.has(i.project_id)).map(i => i.id);
      const live = await links.liveForIssues(ctx, wanted);
      const ids = (type: IssueGitLinkRow['target_type']) => [
        ...new Set(live.filter(l => l.target_type === type).map(l => l.target_id)),
      ];
      const prIds = ids('pull_request');
      const [pulls, branches, commits, prCommits] = await Promise.all([
        entities.pullRequestsByIds(ctx, prIds),
        entities.branchesByIds(ctx, ids('branch')),
        entities.commitsByIds(ctx, ids('commit')),
        entities.pullRequestCommits(ctx, prIds),
      ]);
      const pullById = new Map(pulls.map(p => [p.id, p]));
      const branchById = new Map(branches.map(b => [b.id, b]));
      const commitById = new Map(commits.map(c => [c.id, c]));
      const prCommitRows = await entities.commitsByIds(ctx, [...new Set(prCommits.map(pc => pc.commit_id))]);
      const superseded = new Set(prCommitRows.filter(c => c.superseded_at !== null).map(c => c.id));
      const commitsOfPull = new Map<number, number[]>();
      for (const pc of prCommits) {
        if (superseded.has(pc.commit_id)) continue;
        commitsOfPull.set(pc.pull_request_id, [...(commitsOfPull.get(pc.pull_request_id) ?? []), pc.commit_id]);
      }
      const linksOf = new Map<number, IssueGitLinkRow[]>();
      for (const l of live) linksOf.set(l.issue_id, [...(linksOf.get(l.issue_id) ?? []), l]);

      const byIssue = new Map<number, GitDevelopmentSummary>();
      for (const issueId of wanted) {
        const mine = linksOf.get(issueId) ?? [];
        if (mine.length === 0) {
          byIssue.set(issueId, NONE);
          continue;
        }
        const targets = (type: IssueGitLinkRow['target_type']) =>
          mine.filter(l => l.target_type === type).map(l => l.target_id);
        const myPulls = targets('pull_request').flatMap(id => pullById.get(id) ?? []);
        const inPulls = new Set(myPulls.flatMap(p => commitsOfPull.get(p.id) ?? []));
        const myBranches = targets('branch')
          .flatMap(id => branchById.get(id) ?? [])
          .filter(b => b.deleted_at === null);
        const standalone = targets('commit')
          .flatMap(id => commitById.get(id) ?? [])
          .filter(c => c.superseded_at === null && !inPulls.has(c.id));
        byIssue.set(issueId, {
          rollup: developmentRollup(
            myPulls.map(p => ({
              state: p.state as GitPullRequestState,
              review_state: p.review_state as GitReviewState,
              ci_state: p.ci_state as GitCiState,
              is_revert: p.is_revert,
              merged_at: p.merged_at,
            })),
            myBranches.length,
            standalone.length,
          ),
          pull_requests: myPulls.length,
          commits: inPulls.size + standalone.length,
          branches: myBranches.length,
          repositories: new Set(mine.map(l => l.repository_id)).size,
        });
      }
      return { enabled, byIssue };
    },
  };
}

export type DevelopmentReader = ReturnType<typeof developmentReader>;
