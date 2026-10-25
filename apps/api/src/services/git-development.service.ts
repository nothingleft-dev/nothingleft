import type { Analytics } from '@nothingleft/analytics';
import type {
  GitAuthor,
  GitBranch,
  GitCheckConclusion,
  GitCheckStatus,
  GitCiState,
  GitCommit,
  GitLinkInfo,
  GitLinkIntent,
  GitLinkSource,
  GitProviderKind,
  GitPullRequest,
  GitPullRequestDetail,
  GitPullRequestState,
  GitReviewerState,
  GitReviewState,
  IssueDevelopment,
  LinkPullRequest,
  Principal,
} from '@nothingleft/types';
import { formatIssueKey } from '@nothingleft/format';
import type {
  GitBranchRow,
  GitCommitRow,
  GitConnectionRow,
  GitConnectionsRepository,
  GitEntitiesRepository,
  GitLinksRepository,
  GitPullRequestRow,
  GitRepositoriesRepository,
  GitRepositoryRow,
  IssueGitLinkRow,
  OrganizationsRepository,
  TenantContext,
} from '@nothingleft/db';
import { AppError } from '@lib/errors';
import { providerOf } from '@git/connection';
import { GitProviderError } from '@git/http';
import type { ProviderRegistry } from '@git/providers/index';
import type { StoredReviewer } from '@git/rollup';
import type { AccessService, ProjectAccess } from '@services/access';
import { can } from '@services/permissions';
import type { DevelopmentReader } from '@services/git-development';
import { prSnapshot, type GitLinksService } from '@services/git-links.service';
import { recordIssueEvent } from '@services/issue-history';
import type { IssuesService } from '@services/issues.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction } from '@services/transaction';

export interface GitDevelopmentDeps {
  access: AccessService;
  issues: Pick<IssuesService, 'locate'>;
  providers: ProviderRegistry;
  connections: GitConnectionsRepository;
  repositories: GitRepositoriesRepository;
  entities: GitEntitiesRepository;
  links: GitLinksRepository;
  organizations: OrganizationsRepository;
  reader: DevelopmentReader;
  linker: Pick<GitLinksService, 'readPullRequest'>;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  now?: () => Date;
}

/** A provider-sent URL, shown only when it is on the host its connection is, so a payload cannot plant a link elsewhere. */
function onHost(url: string | null, allowed: ReadonlySet<string>): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && allowed.has(parsed.host) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const AVATAR_HOSTS = new Set([
  'avatars.githubusercontent.com',
  'secure.gravatar.com',
  'www.gravatar.com',
  'gitlab.com',
  'assets.gitlab-static.net',
]);

const withoutHead = ({ head: _head, ...rest }: Record<string, unknown>) => rest;

export function gitDevelopmentService(deps: GitDevelopmentDeps) {
  const { access, issues, providers, connections, repositories, entities, links, organizations, inTransaction } = deps;
  const now = deps.now ?? (() => new Date());

  interface Context {
    project: ProjectAccess;
    repos: Map<number, GitRepositoryRow>;
    conns: Map<number, GitConnectionRow>;
    people: Map<number, GitAuthor['member']>;
  }

  const hostsOf = (c: Context, repo: GitRepositoryRow) => {
    const connection = c.conns.get(repo.connection_id)!;
    return new Set([new URL(connection.base_url).host]);
  };

  function author(
    c: Context,
    userId: number | null,
    login: string | null,
    name: string | null,
    avatar: string | null,
  ): GitAuthor {
    return {
      member: userId ? (c.people.get(userId) ?? null) : null,
      login,
      name,
      avatar_url: onHost(avatar, AVATAR_HOSTS),
    };
  }

  const linkInfo = (link: IssueGitLinkRow | undefined): GitLinkInfo | null =>
    link
      ? {
          link_id: link.id,
          sources: link.sources as GitLinkSource[],
          intent: link.intent as GitLinkIntent,
          linked_at: link.created_at.toISOString(),
        }
      : null;

  function commitDto(c: Context, repo: GitRepositoryRow, row: GitCommitRow, link?: IssueGitLinkRow): GitCommit {
    return {
      sha: row.sha,
      short_sha: row.sha.slice(0, 7),
      subject: row.message_subject,
      author: author(c, row.author_user_id, row.author_login, row.author_name, null),
      committed_at: row.committed_at.toISOString(),
      html_url: onHost(row.html_url, hostsOf(c, repo)),
      superseded: row.superseded_at !== null,
      link: linkInfo(link),
    };
  }

  function pullDto(
    c: Context,
    repo: GitRepositoryRow,
    pr: GitPullRequestRow,
    commits: GitCommit[],
    link: IssueGitLinkRow | undefined,
    reverted: boolean,
  ): GitPullRequest {
    const fork = pr.head_repo_full_name && pr.head_repo_full_name !== repo.full_name;
    return {
      ref: `${repo.full_name}#${pr.number}`,
      repository: {
        full_name: repo.full_name,
        provider: c.conns.get(repo.connection_id)!.provider as GitProviderKind,
        html_url: onHost(repo.html_url, hostsOf(c, repo)) ?? '',
      },
      number: pr.number,
      title: pr.title,
      state: pr.state as GitPullRequestState,
      author: author(c, pr.author_user_id, pr.author_login, null, pr.author_avatar_url),
      head_ref: pr.head_ref,
      head_label: fork ? `${pr.head_repo_full_name!.split('/')[0]}:${pr.head_ref}` : pr.head_ref,
      base_ref: pr.base_ref,
      html_url: onHost(pr.html_url, hostsOf(c, repo)),
      review_state: pr.review_state as GitReviewState,
      reviewers: (pr.reviewers as StoredReviewer[]).map(r => ({
        author: author(c, r.user_id, r.login, null, r.avatar_url),
        state: r.state as GitReviewerState,
      })),
      ci_state: pr.ci_state as GitCiState,
      ci_summary: pr.ci_summary as Record<string, number>,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      is_revert: pr.is_revert,
      reverted,
      merged_by:
        pr.merged_by_login || pr.merged_by_user_id
          ? author(c, pr.merged_by_user_id, pr.merged_by_login, null, null)
          : null,
      opened_at: pr.opened_at.toISOString(),
      merged_at: pr.merged_at?.toISOString() ?? null,
      closed_at: pr.closed_at?.toISOString() ?? null,
      updated_at: pr.provider_updated_at.toISOString(),
      commits_scanned: commits.length,
      commits_total: pr.commits_total,
      commits,
      link: linkInfo(link),
    };
  }

  async function contextFor(
    project: ProjectAccess,
    repositoryIds: readonly number[],
    userIds: readonly (number | null)[],
  ): Promise<Context> {
    const ctx = project.ctx;
    const [repos, allConns, people] = await Promise.all([
      repositories.findByIds(ctx, [...new Set(repositoryIds)]),
      connections.list(ctx, { includeRevoked: true }),
      organizations.findMembersByUserIds(ctx, [...new Set(userIds.filter((u): u is number => u !== null))], {
        includeRemoved: true,
      }),
    ]);
    return {
      project,
      repos: new Map(repos.map(r => [r.id, r])),
      conns: new Map(allConns.map(c => [c.id, c])),
      people: new Map(people.map(p => [p.user.id, access.memberRef(p.user, p.membership)])),
    };
  }

  async function panel(project: ProjectAccess, issueId: number): Promise<IssueDevelopment> {
    const ctx = project.ctx;
    const [{ enabled, byIssue }, live] = await Promise.all([
      deps.reader.summaries(ctx, [{ id: issueId, project_id: project.project.id }]),
      links.liveForIssues(ctx, [issueId]),
    ]);
    const idsOf = (type: IssueGitLinkRow['target_type']) =>
      live.filter(l => l.target_type === type).map(l => l.target_id);
    const pulls = await entities.pullRequestsByIds(ctx, idsOf('pull_request'));
    const prCommits = await entities.pullRequestCommits(
      ctx,
      pulls.map(p => p.id),
    );
    const [commits, branches] = await Promise.all([
      entities.commitsByIds(ctx, [...new Set([...idsOf('commit'), ...prCommits.map(pc => pc.commit_id)])]),
      entities.branchesByIds(ctx, idsOf('branch')),
    ]);
    const c = await contextFor(
      project,
      live.map(l => l.repository_id),
      [
        ...commits.map(r => r.author_user_id),
        ...pulls.flatMap(p => [
          p.author_user_id,
          p.merged_by_user_id,
          ...(p.reviewers as StoredReviewer[]).map(r => r.user_id),
        ]),
      ],
    );
    const commitById = new Map(commits.map(r => [r.id, r]));
    const linkOf = (type: IssueGitLinkRow['target_type'], id: number) =>
      live.find(l => l.target_type === type && l.target_id === id);
    const lastRevert = new Map<number, number>();
    for (const p of pulls) {
      if (p.is_revert && p.state === 'merged' && p.merged_at) {
        lastRevert.set(p.repository_id, Math.max(lastRevert.get(p.repository_id) ?? 0, p.merged_at.getTime()));
      }
    }
    const repoIds = [...new Set(live.map(l => l.repository_id))];
    const inPull = new Set(prCommits.map(pc => pc.commit_id));
    const byRecent =
      <T>(at: (x: T) => Date) =>
      (a: T, b: T) =>
        at(b).getTime() - at(a).getTime();

    return {
      summary: byIssue.get(issueId) ?? { rollup: 'none', pull_requests: 0, commits: 0, branches: 0, repositories: 0 },
      git_enabled: enabled.has(project.project.id),
      repositories: repoIds
        .map(id => c.repos.get(id)!)
        .filter(Boolean)
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map(repo => {
          const repoPulls = pulls.filter(p => p.repository_id === repo.id).sort(byRecent(p => p.provider_updated_at));
          const openHeads = new Set(
            repoPulls.filter(p => p.state === 'open' || p.state === 'draft').map(p => p.head_ref),
          );
          return {
            repository: {
              full_name: repo.full_name,
              provider: c.conns.get(repo.connection_id)!.provider as GitProviderKind,
              html_url: onHost(repo.html_url, hostsOf(c, repo)) ?? '',
            },
            pull_requests: repoPulls.map(pr => {
              const prCommitRows = prCommits
                .filter(pc => pc.pull_request_id === pr.id)
                .map(pc => commitById.get(pc.commit_id))
                .filter((r): r is GitCommitRow => r !== undefined && r.superseded_at === null)
                .sort((a, b) => a.committed_at.getTime() - b.committed_at.getTime());
              const reverted =
                !pr.is_revert &&
                pr.state === 'merged' &&
                pr.merged_at !== null &&
                (lastRevert.get(repo.id) ?? 0) > pr.merged_at.getTime();
              return pullDto(
                c,
                repo,
                pr,
                prCommitRows.map(r => commitDto(c, repo, r, linkOf('commit', r.id))),
                linkOf('pull_request', pr.id),
                reverted,
              );
            }),
            branches: branches
              .filter(
                (b): b is GitBranchRow =>
                  b.repository_id === repo.id && b.deleted_at === null && !openHeads.has(b.name),
              )
              .map((b): GitBranch => ({
                name: b.name,
                head_sha: b.head_sha,
                deleted: false,
                link: linkInfo(linkOf('branch', b.id)),
              })),
            commits: idsOf('commit')
              .map(id => commitById.get(id))
              .filter(
                (r): r is GitCommitRow =>
                  r !== undefined && r.repository_id === repo.id && r.superseded_at === null && !inPull.has(r.id),
              )
              .sort(byRecent(r => r.committed_at))
              .map(r => commitDto(c, repo, r, linkOf('commit', r.id))),
          };
        }),
    };
  }

  async function locateReadable(principal: Principal, key: string, hints: OrgHints) {
    const located = await issues.locate(principal, key, hints);
    access.require(principal, 'git.read', located.project.scope);
    return located;
  }

  async function locateWritable(principal: Principal, key: string, hints: OrgHints) {
    const located = await issues.locate(principal, key, hints);
    access.require(principal, 'git.link_manual', located.project.scope);
    if (located.project.project.is_archived) {
      throw new AppError('project.archived', 409, { key: located.project.project.key });
    }
    return located;
  }

  /** The repository and pull request a pasted URL names, among the organisation's live connections. */
  /**
   * The repository and pull request a pasted URL names. Only a repository the issue's project can
   * reference counts: one the connection merely sees, or one linked to another project, would
   * read its private pull requests into this project.
   */
  async function fromUrl(ctx: TenantContext, projectId: number, raw: string) {
    const url = new URL(raw);
    const live = await connections.list(ctx);
    const hosted = live.filter(c => new URL(c.base_url).host === url.host);
    if (hosted.length === 0) throw new AppError('git.url_not_connected', 422, {}, 'url');
    for (const connection of hosted) {
      const parsed = providerOf(providers, connection.provider).pullRequestFromUrl(url);
      if (!parsed) continue;
      const [repo] = await repositories.findByFullName(ctx, parsed.full_name, [connection.id]);
      if (!repo || repo.removed_at) continue;
      const inScope = await repositories.scopeProjects(ctx, repo.id, repo.match_all_projects);
      if (inScope.some(p => p.id === projectId)) return { connection, repo, number: parsed.number };
    }
    const anyPull = hosted.some(c => providerOf(providers, c.provider).pullRequestFromUrl(url));
    throw anyPull
      ? new AppError('git.url_not_connected', 422, {}, 'url')
      : new AppError('git.url_not_pull_request', 422, {}, 'url');
  }

  return {
    async development(principal: Principal, key: string, hints: OrgHints = {}): Promise<IssueDevelopment> {
      const { project, issue } = await locateReadable(principal, key, hints);
      return panel(project, issue.id);
    },

    /** Links a pull request to the issue by its URL; it stays until a person unlinks it. */
    async link(
      principal: Principal,
      key: string,
      input: LinkPullRequest,
      hints: OrgHints = {},
    ): Promise<IssueDevelopment> {
      const { project, issue } = await locateWritable(principal, key, hints);
      const ctx = project.ctx;
      const { connection, repo, number } = await fromUrl(ctx, project.project.id, input.url);
      const pr =
        (await entities.findPullRequest(ctx, repo.id, number)) ??
        (await deps.linker.readPullRequest(ctx, connection, repo, number).catch((error: unknown) => {
          if (error instanceof GitProviderError) return null;
          throw error;
        }));
      if (!pr)
        throw new AppError('git.pull_request_not_found', 404, { pull_request: `${repo.full_name}#${number}` }, 'url');
      const at = now();
      const linked = await inTransaction(async r => {
        const [existing] = (await r.gitLinks.forTarget(ctx, { target_type: 'pull_request', target_id: pr.id })).filter(
          l => l.issue_id === issue.id,
        );
        if (existing && !existing.removed_at && existing.sources.includes('manual')) return false;
        const sources = existing && !existing.removed_at ? [...new Set([...existing.sources, 'manual'])] : ['manual'];
        const row = existing
          ? await r.gitLinks.update(ctx, existing.id, {
              sources,
              removed_at: null,
              removed_by: null,
              removed_sources: [],
              created_by: existing.created_by ?? principal.userId,
              updated_at: at,
            })
          : await r.gitLinks.insert(ctx, {
              issue_id: issue.id,
              repository_id: repo.id,
              target_type: 'pull_request',
              target_id: pr.id,
              sources: ['manual'],
              intent: pr.is_revert ? 'revert' : 'mention',
              created_by: principal.userId,
              at,
            });
        if ((existing && !existing.removed_at) || !row) return false;
        await recordIssueEvent(
          r.issueActivity,
          { ctx, issueId: issue.id, actorId: principal.userId, changeGroupId: Bun.randomUUIDv7(), at },
          'git_linked',
          { new_value: { ...prSnapshot(repo, pr), sources: row.sources, intent: row.intent } },
        );
        return true;
      });
      if (linked) {
        deps.analytics.capture(
          'git_link_created',
          { source: 'manual', target_type: 'pull_request' },
          { userId: principal.userId, orgId: ctx.orgId },
        );
      }
      return panel(project, issue.id);
    },

    /** Unlinks any link, found or made by hand; the same reference never brings it back, a new one does. */
    async unlink(principal: Principal, key: string, linkId: number, hints: OrgHints = {}): Promise<IssueDevelopment> {
      const { project, issue } = await locateWritable(principal, key, hints);
      const ctx = project.ctx;
      const link = await links.findById(ctx, linkId);
      if (!link || link.issue_id !== issue.id || link.removed_at) {
        throw new AppError(
          'git.link_not_found',
          404,
          { key: formatIssueKey(project.project.key, issue.key_number) },
          'link',
        );
      }
      const at = now();
      const repo = (await repositories.findById(ctx, link.repository_id))!;
      const snapshot = await snapshotOf(ctx, repo, link);
      // A pull request's commits are remembered by its head: commits pushed later are a new source and relink it.
      const removed = link.sources.map(s =>
        s === 'pr_commits' && snapshot['head'] ? `pr_commits@${String(snapshot['head'])}` : s,
      );
      await inTransaction(async r => {
        await r.gitLinks.update(ctx, link.id, {
          removed_at: at,
          removed_by: principal.userId,
          removed_sources: removed,
          updated_at: at,
        });
        await recordIssueEvent(
          r.issueActivity,
          { ctx, issueId: issue.id, actorId: principal.userId, changeGroupId: Bun.randomUUIDv7(), at },
          'git_unlinked',
          { old_value: { ...withoutHead(snapshot), sources: link.sources, intent: link.intent } },
        );
      });
      return panel(project, issue.id);
    },

    /** One pull request with its checks, for anyone who can read an issue it is linked to. */
    async pullRequest(
      principal: Principal,
      ref: string,
      number: number,
      hints: OrgHints = {},
    ): Promise<GitPullRequestDetail> {
      const org = await access.current(principal, hints);
      const ctx = org.ctx;
      const notFound = () => new AppError('git.pull_request_not_found', 404, { pull_request: `${ref}#${number}` });
      const live = await connections.list(ctx, { includeRevoked: true });
      const fullName = ref.replace(/^[a-z]+:/, '');
      const candidates = await repositories.findByFullName(
        ctx,
        fullName,
        live.map(c => c.id),
      );
      for (const repo of candidates) {
        const pr = await entities.findPullRequest(ctx, repo.id, number);
        if (!pr) continue;
        const linked = (await links.forTarget(ctx, { target_type: 'pull_request', target_id: pr.id })).filter(
          l => !l.removed_at,
        );
        const issueRows = await links.issuesByIds(
          ctx,
          linked.map(l => l.issue_id),
        );
        const readable: { project: ProjectAccess; key: string }[] = [];
        for (const row of issueRows.filter(i => i.deleted_at === null)) {
          const project = await access.projectById(principal, org, row.project_id).catch(() => null);
          if (project && can(principal, 'git.read', project.scope)) {
            readable.push({ project, key: formatIssueKey(project.project.key, row.key_number) });
          }
        }
        if (readable.length === 0) continue;
        const c = await contextFor(
          readable[0]!.project,
          [repo.id],
          [pr.author_user_id, pr.merged_by_user_id, ...(pr.reviewers as StoredReviewer[]).map(r => r.user_id)],
        );
        const prCommits = await entities.pullRequestCommits(ctx, [pr.id]);
        const commits = (
          await entities.commitsByIds(
            ctx,
            prCommits.map(pc => pc.commit_id),
          )
        )
          .filter(r => r.superseded_at === null)
          .sort((a, b) => a.committed_at.getTime() - b.committed_at.getTime());
        const checks = await entities.checksFor(ctx, repo.id, pr.head_sha);
        return {
          ...pullDto(
            c,
            repo,
            pr,
            commits.map(r => commitDto(c, repo, r)),
            undefined,
            false,
          ),
          checks: checks.map(ch => ({
            name: ch.name,
            status: ch.status as GitCheckStatus,
            conclusion: ch.conclusion as GitCheckConclusion | null,
            details_url: onHost(ch.details_url, hostsOf(c, repo)),
            started_at: ch.started_at?.toISOString() ?? null,
            completed_at: ch.completed_at?.toISOString() ?? null,
          })),
          issues: [...new Set(readable.map(r => r.key))].sort(),
        };
      }
      throw notFound();
    },
  };

  async function snapshotOf(
    ctx: TenantContext,
    repo: GitRepositoryRow,
    link: IssueGitLinkRow,
  ): Promise<Record<string, unknown>> {
    if (link.target_type === 'pull_request') {
      const [pr] = await entities.pullRequestsByIds(ctx, [link.target_id]);
      return pr ? { ...prSnapshot(repo, pr), head: pr.head_sha } : { kind: 'pull_request', repo: repo.full_name };
    }
    if (link.target_type === 'commit') {
      const [c] = await entities.commitsByIds(ctx, [link.target_id]);
      return {
        kind: 'commit',
        repo: repo.full_name,
        sha: c?.sha ?? null,
        title: c?.message_subject ?? null,
        url: c?.html_url ?? null,
      };
    }
    const [b] = await entities.branchesByIds(ctx, [link.target_id]);
    return { kind: 'branch', repo: repo.full_name, name: b?.name ?? null };
  }
}

export type GitDevelopmentService = ReturnType<typeof gitDevelopmentService>;
