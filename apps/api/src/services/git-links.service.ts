import { findIssueReferences, isRevert as isRevertName } from '@nothingleft/format';
import {
  ACTIVITY_COALESCE_WINDOW_MS,
  GIT_BACKFILL_DAYS,
  GIT_BACKFILL_PULL_REQUESTS_MAX,
  GIT_COMMIT_MESSAGE_STORED_MAX,
  GIT_PUSH_COMMITS_MAX,
  type GitLinkIntent,
  type GitLinkSource,
  type GitLinkTarget,
} from '@nothingleft/types';
import {
  systemContext,
  type GitCommitRow,
  type GitConnectionRow,
  type GitEntitiesRepository,
  type GitIdentitiesRepository,
  type GitLinksRepository,
  type GitPullRequestRow,
  type GitRepositoriesRepository,
  type GitRepositoryRow,
  type GitWebhookEventRow,
  type IssueGitLinkRow,
  type OrganizationsRepository,
  type TenantContext,
  type UsersRepository,
} from '@nothingleft/db';
import { connectionAuth, providerOf } from '@git/connection';
import {
  cap,
  type EventActor,
  type NormalizedCommit,
  type NormalizedEvent,
  type NormalizedPullRequest,
} from '@git/events';
import type { ConnectionAuth, GitProvider } from '@git/provider';
import type { ProviderRegistry } from '@git/providers/index';
import { applyReview, ciState, ciSummary, reviewState, withRequested, type StoredReviewer } from '@git/rollup';
import { recordIssueEvent } from '@services/issue-history';
import type { EntityOutcome } from '@services/git-ingest.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface GitLinksDeps {
  providers: ProviderRegistry;
  repositories: GitRepositoriesRepository;
  entities: GitEntitiesRepository;
  links: GitLinksRepository;
  identities: GitIdentitiesRepository;
  users: UsersRepository;
  organizations: OrganizationsRepository;
  inTransaction: InTenantTransaction;
  masterKey: Buffer;
  appBaseUrl: string;
  now?: () => Date;
}

const sys = systemContext('a git author is matched to an account by provider id or email, across organisations');

const PR_SOURCES: GitLinkSource[] = ['pr_title', 'pr_body', 'branch_name', 'pr_commits'];

interface Wanted {
  sources: Set<GitLinkSource>;
  closing: boolean;
}

interface Scope {
  keys: string[];
  projectIdByKey: Map<string, number>;
}

export type Snapshot = Record<string, unknown>;

/** What the issue's history says the link is to: readable values, never ids. */
export function prSnapshot(repo: Pick<GitRepositoryRow, 'full_name'>, pr: GitPullRequestRow): Snapshot {
  return {
    kind: 'pull_request',
    repo: repo.full_name,
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    state: pr.state,
    review: pr.review_state,
    ci: pr.ci_state,
  };
}

const commitSnapshot = (repo: Pick<GitRepositoryRow, 'full_name'>, c: GitCommitRow): Snapshot => ({
  kind: 'commit',
  repo: repo.full_name,
  sha: c.sha,
  title: c.message_subject,
  url: c.html_url,
});

const branchSnapshot = (repo: Pick<GitRepositoryRow, 'full_name' | 'html_url'>, name: string): Snapshot => ({
  kind: 'branch',
  repo: repo.full_name,
  name,
  url: `${repo.html_url}/tree/${name.split('/').map(encodeURIComponent).join('/')}`,
});

function intentOf(wanted: Wanted, isRevert: boolean): GitLinkIntent {
  if (isRevert) return 'revert';
  return wanted.closing ? 'closes' : 'mention';
}

const subjectOf = (message: string) => cap(message.split('\n', 1)[0], 1_000);

export function gitLinksService(deps: GitLinksDeps) {
  const { providers, repositories, entities, links, identities, users, organizations, inTransaction, masterKey } = deps;
  const now = deps.now ?? (() => new Date());

  async function scopeOf(ctx: TenantContext, repo: GitRepositoryRow): Promise<Scope> {
    const projects = await repositories.scopeProjects(ctx, repo.id, repo.match_all_projects);
    return { keys: projects.map(p => p.key), projectIdByKey: new Map(projects.map(p => [p.key, p.id])) };
  }

  /** The issues the texts reference, each with the sources that named it and whether any closed it. */
  async function referenced(
    ctx: TenantContext,
    scope: Scope,
    texts: { source: GitLinkSource; text: string; skipCode?: boolean }[],
    linkRepo: GitLinksRepository = links,
  ): Promise<Map<number, Wanted>> {
    const found = new Map<
      string,
      { project_id: number; number: number; sources: Set<GitLinkSource>; closing: boolean }
    >();
    for (const { source, text, skipCode } of texts) {
      const { references } = findIssueReferences(text, scope.keys, { issueUrlBase: deps.appBaseUrl, skipCode });
      for (const ref of references) {
        const projectId = scope.projectIdByKey.get(ref.project_key);
        if (projectId === undefined) continue;
        const entry = found.get(ref.key) ?? {
          project_id: projectId,
          number: ref.number,
          sources: new Set(),
          closing: false,
        };
        entry.sources.add(source);
        entry.closing ||= ref.closing;
        found.set(ref.key, entry);
      }
    }
    const issues = await linkRepo.issuesByNumbers(
      ctx,
      [...found.values()].map(f => ({ project_id: f.project_id, number: f.number })),
    );
    const wanted = new Map<number, Wanted>();
    for (const f of found.values()) {
      const issue = issues.find(i => i.project_id === f.project_id && i.key_number === f.number);
      // A key whose number does not exist is dropped: nothing is ever created from git.
      if (issue) wanted.set(issue.id, { sources: f.sources, closing: f.closing });
    }
    return wanted;
  }

  /** Account of a provider author, when it maps to a member of this organisation. */
  function authorResolver(ctx: TenantContext, connection: GitConnectionRow) {
    const memo = new Map<string, Promise<number | null>>();
    const member = async (userId: number | undefined | null) =>
      userId && (await organizations.findMembership(ctx, userId)) ? userId : null;

    async function byProviderId(id: string): Promise<number | null> {
      const claimed = await identities.findByProviderUser(sys, connection.provider, connection.base_url, id);
      if (claimed) return member(claimed.user_id);
      // Sign-in's GitHub id is read as a hint only; this feature never writes it.
      if (connection.provider === 'github' && connection.base_url === 'https://github.com') {
        return member((await users.findByProviderId(sys, 'github', id))?.id);
      }
      return null;
    }

    async function resolve(actor: Pick<EventActor, 'login' | 'provider_user_id' | 'email'>): Promise<number | null> {
      if (actor.provider_user_id) {
        const found = await byProviderId(actor.provider_user_id);
        if (found) return found;
      }
      const noreply = actor.email ? /^(\d+)\+[^@]+@users\.noreply\.github\.com$/i.exec(actor.email) : null;
      if (noreply) {
        const found = await byProviderId(noreply[1]!);
        if (found) return found;
      }
      if (actor.email) {
        const user = await users.findByEmail(sys, actor.email);
        if (user?.email_verified_at) {
          const found = await member(user.id);
          if (found) return found;
        }
        const claimed = await identities.findByEmail(sys, actor.email);
        if (claimed) {
          const found = await member(claimed.user_id);
          if (found) return found;
        }
      }
      if (actor.login) {
        const claimed = await identities.findByLogin(sys, connection.provider, connection.base_url, actor.login);
        if (claimed) return member(claimed.user_id);
      }
      return null;
    }

    return (actor: Pick<EventActor, 'login' | 'provider_user_id' | 'email'>): Promise<number | null> => {
      const key = `${actor.provider_user_id ?? ''}|${actor.login ?? ''}|${actor.email ?? ''}`;
      if (!memo.has(key)) memo.set(key, resolve(actor));
      return memo.get(key)!;
    };
  }

  /**
   * Makes the target's links match `wanted` for the sources this event knows (`managed`), keeping
   * every other source a link has (a manual link, a source another event set). A link left with
   * no source is removed; one a person removed comes back only for a source it did not have then.
   */
  async function syncLinks(
    repos: TenantRepos,
    ctx: TenantContext,
    target: { type: GitLinkTarget; id: number; repository_id: number },
    wanted: Map<number, Wanted>,
    managed: readonly GitLinkSource[],
    snapshot: Snapshot,
    options: {
      isRevert?: boolean;
      changeGroupId: string;
      at: Date;
      /** Commits of a pull request count as a new source when its head moved since a person unlinked it. */
      headSha?: string;
    },
  ): Promise<{ linked: number[]; unlinked: number[] }> {
    const existing = await repos.gitLinks.forTarget(ctx, { target_type: target.type, target_id: target.id });
    const linked: number[] = [];
    const unlinked: number[] = [];
    const history = (
      issueId: number,
      kind: 'git_linked' | 'git_unlinked',
      link: Pick<IssueGitLinkRow, 'sources' | 'intent'>,
    ) =>
      recordIssueEvent(
        repos.issueActivity,
        { ctx, issueId, actorId: null, changeGroupId: options.changeGroupId, at: options.at },
        kind,
        kind === 'git_linked'
          ? { new_value: { ...snapshot, sources: link.sources, intent: link.intent } }
          : { old_value: { ...snapshot, sources: link.sources, intent: link.intent } },
      );

    for (const link of existing) {
      const want = wanted.get(link.issue_id);
      const kept = link.sources.filter(s => !managed.includes(s as GitLinkSource));
      const sources = [...new Set([...kept, ...(want ? [...want.sources] : [])])] as GitLinkSource[];
      const intent = want ? intentOf(want, options.isRevert ?? false) : (link.intent as GitLinkIntent);
      if (link.removed_at) {
        // Only a person's unlink is remembered; one the system made comes back as soon as a source does.
        const removedAs = (s: GitLinkSource) =>
          link.removed_by !== null &&
          (link.removed_sources.includes(s) ||
            (s === 'pr_commits' &&
              options.headSha !== undefined &&
              link.removed_sources.includes(`pr_commits@${options.headSha}`)));
        const fresh = want ? [...want.sources].filter(s => !removedAs(s)) : [];
        if (fresh.length === 0) continue;
        await repos.gitLinks.update(ctx, link.id, {
          sources,
          intent,
          removed_at: null,
          removed_by: null,
          removed_sources: [],
          updated_at: options.at,
        });
        await history(link.issue_id, 'git_linked', { sources, intent });
        linked.push(link.issue_id);
        continue;
      }
      if (sources.length === 0) {
        await repos.gitLinks.update(ctx, link.id, {
          removed_at: options.at,
          removed_sources: link.sources,
          updated_at: options.at,
        });
        await history(link.issue_id, 'git_unlinked', link);
        unlinked.push(link.issue_id);
        continue;
      }
      const same = sources.length === link.sources.length && sources.every(s => link.sources.includes(s));
      if (!same || intent !== link.intent) {
        await repos.gitLinks.update(ctx, link.id, { sources, intent, updated_at: options.at });
      }
    }

    for (const [issueId, want] of wanted) {
      if (existing.some(l => l.issue_id === issueId)) continue;
      const sources = [...want.sources];
      const intent = intentOf(want, options.isRevert ?? false);
      const inserted = await repos.gitLinks.insert(ctx, {
        issue_id: issueId,
        repository_id: target.repository_id,
        target_type: target.type,
        target_id: target.id,
        sources,
        intent,
        created_by: null,
        at: options.at,
      });
      if (!inserted) continue;
      await history(issueId, 'git_linked', { sources, intent });
      linked.push(issueId);
    }
    return { linked, unlinked };
  }

  /** One `git_pr_changed` row per issue per pull request per five minutes, coalesced to the net change. */
  async function recordPrChange(
    repos: TenantRepos,
    ctx: TenantContext,
    issueIds: readonly number[],
    before: Snapshot,
    after: Snapshot,
    changeGroupId: string,
    at: Date,
  ) {
    const same = (a: Snapshot, b: Snapshot) =>
      a['state'] === b['state'] && a['review'] === b['review'] && a['ci'] === b['ci'];
    if (same(before, after)) return;
    const since = new Date(at.getTime() - ACTIVITY_COALESCE_WINDOW_MS);
    for (const issueId of issueIds) {
      const latest = await repos.issueActivity.latestPullRequestChange(
        ctx,
        issueId,
        { repo: String(after['repo']), number: Number(after['number']) },
        since,
      );
      if (!latest) {
        await recordIssueEvent(
          repos.issueActivity,
          { ctx, issueId, actorId: null, changeGroupId, at },
          'git_pr_changed',
          { old_value: before, new_value: after },
        );
      } else if (same(latest.old_value as Snapshot, after)) {
        await repos.issueActivity.erase(ctx, latest.id);
      } else {
        await repos.issueActivity.rewriteBoth(ctx, latest.id, latest.old_value, after, at);
      }
    }
  }

  const liveIssuesOf = async (repos: TenantRepos, ctx: TenantContext, type: GitLinkTarget, id: number) =>
    (await repos.gitLinks.forTarget(ctx, { target_type: type, target_id: id }))
      .filter(l => !l.removed_at)
      .map(l => l.issue_id);

  const canFetch = (auth: ConnectionAuth) => auth.auth_kind === 'app_installation' || auth.token !== null;

  function commitInput(c: NormalizedCommit, authorUserId: number | null) {
    return {
      sha: c.sha,
      message_subject: subjectOf(c.message),
      message_full:
        c.message.length > GIT_COMMIT_MESSAGE_STORED_MAX
          ? c.message.slice(0, GIT_COMMIT_MESSAGE_STORED_MAX)
          : c.message,
      author_name: cap(c.author_name, 255),
      author_email: cap(c.author_email, 255),
      author_login: c.author_login,
      author_provider_id: c.author_provider_id,
      author_user_id: authorUserId,
      committed_at: new Date(c.committed_at),
      html_url: c.url,
    };
  }

  /** Stores the commits that reference an issue, links each by its message, and returns their rows by sha. */
  async function linkCommits(
    repos: TenantRepos,
    ctx: TenantContext,
    repo: GitRepositoryRow,
    scope: Scope,
    commits: readonly NormalizedCommit[],
    keepAll: boolean,
    author: (a: Pick<EventActor, 'login' | 'provider_user_id' | 'email'>) => Promise<number | null>,
    changeGroupId: string,
    at: Date,
  ): Promise<Map<string, GitCommitRow>> {
    const wantedBySha = new Map<string, Map<number, Wanted>>();
    for (const c of commits)
      wantedBySha.set(
        c.sha,
        await referenced(ctx, scope, [{ source: 'commit_message', text: c.message }], repos.gitLinks),
      );
    const known = new Set(
      (
        await repos.gitEntities.commitsBySha(
          ctx,
          repo.id,
          commits.map(c => c.sha),
        )
      ).map(c => c.sha),
    );
    const toStore = commits.filter(c => keepAll || known.has(c.sha) || wantedBySha.get(c.sha)!.size > 0);
    const inputs = [];
    for (const c of toStore) {
      inputs.push(
        commitInput(
          c,
          await author({ login: c.author_login, provider_user_id: c.author_provider_id, email: c.author_email }),
        ),
      );
    }
    const rows = await repos.gitEntities.upsertCommits(ctx, repo.id, inputs);
    const bySha = new Map(rows.map(r => [r.sha, r]));
    for (const row of rows) {
      await syncLinks(
        repos,
        ctx,
        { type: 'commit', id: row.id, repository_id: repo.id },
        wantedBySha.get(row.sha) ?? new Map(),
        ['commit_message'],
        commitSnapshot(repo, row),
        { changeGroupId, at },
      );
    }
    return bySha;
  }

  async function applyBranch(
    repos: TenantRepos,
    ctx: TenantContext,
    repo: GitRepositoryRow,
    scope: Scope,
    event: Extract<NormalizedEvent, { type: 'branch.created' | 'branch.deleted' }>,
    changeGroupId: string,
    at: Date,
  ) {
    if (event.type === 'branch.deleted') {
      await repos.gitEntities.deleteBranch(ctx, repo.id, event.ref, at);
      return;
    }
    const wanted = await referenced(ctx, scope, [{ source: 'branch_name', text: event.ref }], repos.gitLinks);
    const known = await repos.gitEntities.findBranch(ctx, repo.id, event.ref);
    if (wanted.size === 0 && !known) return;
    const branch = await repos.gitEntities.upsertBranch(ctx, repo.id, event.ref, event.head_sha, at);
    await syncLinks(
      repos,
      ctx,
      { type: 'branch', id: branch.id, repository_id: repo.id },
      wanted,
      ['branch_name'],
      branchSnapshot(repo, branch.name),
      { changeGroupId, at },
    );
  }

  async function applyPush(
    repos: TenantRepos,
    ctx: TenantContext,
    repo: GitRepositoryRow,
    scope: Scope,
    event: Extract<NormalizedEvent, { type: 'push' }>,
    superseded: readonly string[],
    author: ReturnType<typeof authorResolver>,
    changeGroupId: string,
    at: Date,
  ) {
    if (event.created) {
      await applyBranch(
        repos,
        ctx,
        repo,
        scope,
        { type: 'branch.created', repo: event.repo, ref: event.ref, head_sha: event.after, actor: event.pusher },
        changeGroupId,
        at,
      );
    } else if (await repos.gitEntities.findBranch(ctx, repo.id, event.ref)) {
      await repos.gitEntities.upsertBranch(ctx, repo.id, event.ref, event.after, at);
    }
    for (const row of await repos.gitEntities.supersede(ctx, repo.id, superseded, at)) {
      await syncLinks(
        repos,
        ctx,
        { type: 'commit', id: row.id, repository_id: repo.id },
        new Map(),
        ['commit_message'],
        commitSnapshot(repo, row),
        {
          changeGroupId,
          at,
        },
      );
    }
    const distinct = event.commits.filter(c => c.distinct).slice(0, GIT_PUSH_COMMITS_MAX);
    await linkCommits(repos, ctx, repo, scope, distinct, false, author, changeGroupId, at);
  }

  interface FetchedCommits {
    commits: NormalizedCommit[];
    total: number;
  }

  async function applyPullRequest(
    repos: TenantRepos,
    ctx: TenantContext,
    repo: GitRepositoryRow,
    scope: Scope,
    pr: NormalizedPullRequest,
    fetched: FetchedCommits | null,
    author: ReturnType<typeof authorResolver>,
    changeGroupId: string,
    at: Date,
  ): Promise<GitPullRequestRow | null> {
    const existing = await repos.gitEntities.findPullRequest(ctx, repo.id, pr.number);
    // An event older than what is stored (out of order, or a retry) changes nothing; the nightly reconcile catches up.
    if (existing && Date.parse(pr.provider_updated_at) < existing.provider_updated_at.getTime()) return existing;

    const isRevert = isRevertName(pr.title, pr.head.ref);
    const texts: { source: GitLinkSource; text: string; skipCode?: boolean }[] = [
      { source: 'pr_title', text: pr.title },
      { source: 'pr_body', text: pr.body, skipCode: true },
      { source: 'branch_name', text: pr.head.ref },
      ...(fetched?.commits ?? []).map(c => ({ source: 'pr_commits' as const, text: c.message })),
    ];
    const wanted = await referenced(ctx, scope, texts, repos.gitLinks);
    if (!existing && wanted.size === 0) return null;

    const authorId = await author(pr.author);
    const requestedIds = new Map<EventActor, number | null>();
    for (const r of pr.requested_reviewers) requestedIds.set(r, await author(r));
    const reviewers = withRequested(
      (existing?.reviewers ?? []) as StoredReviewer[],
      pr.requested_reviewers,
      r => requestedIds.get(r) ?? null,
    );
    const mergedBy = pr.merged_by ? await author(pr.merged_by) : null;
    const fields = {
      title: cap(pr.title, 1_000),
      state: pr.state,
      author_login: pr.author.login,
      author_provider_id: pr.author.provider_user_id,
      author_avatar_url: pr.author.avatar_url,
      author_user_id: authorId,
      head_repo_full_name: pr.head.repo_full_name,
      head_ref: pr.head.ref,
      head_sha: pr.head.sha,
      base_ref: pr.base.ref,
      merge_commit_sha: pr.state === 'merged' ? pr.merge_commit_sha : null,
      merged_by_login: pr.merged_by?.login ?? null,
      merged_by_user_id: mergedBy,
      is_revert: isRevert,
      html_url: pr.html_url,
      reviewers,
      review_state: reviewState(reviewers),
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      provider_updated_at: new Date(pr.provider_updated_at),
      opened_at: new Date(pr.opened_at),
      merged_at: pr.merged_at ? new Date(pr.merged_at) : null,
      closed_at: pr.closed_at ? new Date(pr.closed_at) : null,
      updated_at: at,
      ...(fetched ? { commits_fetched_for_sha: pr.head.sha, commits_total: fetched.total } : {}),
    };
    const headChanged = existing && existing.head_sha !== pr.head.sha;
    const checks = headChanged || !existing ? await repos.gitEntities.checksFor(ctx, repo.id, pr.head.sha) : null;
    const ci = checks ? { ci_state: ciState(checks), ci_summary: ciSummary(checks) } : {};
    const row = existing
      ? (await repos.gitEntities.updatePullRequest(ctx, existing.id, { ...fields, ...ci }))!
      : ((await repos.gitEntities.insertPullRequest(ctx, repo.id, { number: pr.number, ...fields, ...ci })) ??
        // Another writer (a backfill, a manual link) stored it first.
        (await repos.gitEntities.updatePullRequest(
          ctx,
          (await repos.gitEntities.findPullRequest(ctx, repo.id, pr.number))!.id,
          { ...fields, ...ci },
        ))!);

    if (fetched) {
      const stored = await linkCommits(repos, ctx, repo, scope, fetched.commits, true, author, changeGroupId, at);
      await repos.gitEntities.setPullRequestCommits(
        ctx,
        row.id,
        [...stored.values()].map(c => c.id),
      );
    }
    const managed = fetched ? PR_SOURCES : PR_SOURCES.filter(s => s !== 'pr_commits');
    const { linked } = await syncLinks(
      repos,
      ctx,
      { type: 'pull_request', id: row.id, repository_id: repo.id },
      wanted,
      managed,
      prSnapshot(repo, row),
      { isRevert, changeGroupId, at, headSha: row.head_sha },
    );

    if (row.head_ref && (await repos.gitEntities.findBranch(ctx, repo.id, row.head_ref))) {
      await repos.gitEntities.upsertBranch(ctx, repo.id, row.head_ref, row.head_sha, at);
    }
    if (row.state === 'merged' && row.merge_commit_sha) await linkMergeCommit(repos, ctx, repo, row, changeGroupId, at);
    if (existing) {
      const issues = (await liveIssuesOf(repos, ctx, 'pull_request', row.id)).filter(id => !linked.includes(id));
      await recordPrChange(repos, ctx, issues, prSnapshot(repo, existing), prSnapshot(repo, row), changeGroupId, at);
    }
    return row;
  }

  /** What landed on the base branch is linked to every issue the pull request is, whatever its message says. */
  async function linkMergeCommit(
    repos: TenantRepos,
    ctx: TenantContext,
    repo: GitRepositoryRow,
    pr: GitPullRequestRow,
    changeGroupId: string,
    at: Date,
  ) {
    const issues = await liveIssuesOf(repos, ctx, 'pull_request', pr.id);
    const [known] = await repos.gitEntities.commitsBySha(ctx, repo.id, [pr.merge_commit_sha!]);
    const commit =
      known ??
      (
        await repos.gitEntities.upsertCommits(ctx, repo.id, [
          {
            sha: pr.merge_commit_sha!,
            message_subject: pr.title,
            message_full: null,
            author_name: pr.merged_by_login ?? '',
            author_email: '',
            author_login: pr.merged_by_login,
            author_provider_id: null,
            author_user_id: pr.merged_by_user_id,
            committed_at: pr.merged_at ?? at,
            html_url: `${repo.html_url}/commit/${pr.merge_commit_sha}`,
          },
        ])
      )[0]!;
    const wanted = new Map<number, Wanted>(
      issues.map(id => [id, { sources: new Set(['merge_commit']), closing: false }]),
    );
    await syncLinks(
      repos,
      ctx,
      { type: 'commit', id: commit.id, repository_id: repo.id },
      wanted,
      ['merge_commit'],
      commitSnapshot(repo, commit),
      {
        changeGroupId,
        at,
      },
    );
  }

  async function applyReviewEvent(
    repos: TenantRepos,
    ctx: TenantContext,
    repo: GitRepositoryRow,
    event: Extract<NormalizedEvent, { type: 'pull_request.review' }>,
    author: ReturnType<typeof authorResolver>,
    changeGroupId: string,
    at: Date,
  ) {
    const pr = await repos.gitEntities.findPullRequest(ctx, repo.id, event.number);
    if (!pr) return;
    const reviewers = applyReview(
      pr.reviewers as StoredReviewer[],
      event.reviewer,
      event.state,
      event.submitted_at,
      await author(event.reviewer),
    );
    const updated = (await repos.gitEntities.updatePullRequest(ctx, pr.id, {
      reviewers,
      review_state: reviewState(reviewers),
      updated_at: at,
    }))!;
    const issues = await liveIssuesOf(repos, ctx, 'pull_request', pr.id);
    await recordPrChange(repos, ctx, issues, prSnapshot(repo, pr), prSnapshot(repo, updated), changeGroupId, at);
  }

  async function applyCheck(
    repos: TenantRepos,
    ctx: TenantContext,
    repo: GitRepositoryRow,
    event: Extract<NormalizedEvent, { type: 'check.updated' }>,
    changeGroupId: string,
    at: Date,
  ) {
    // Kept for any commit of the repository: one may become a pull request's head a moment later.
    const heads = await repos.gitEntities.pullRequestsByHead(ctx, repo.id, event.sha);
    const c = event.check;
    await repos.gitEntities.upsertCheck(ctx, repo.id, {
      sha: event.sha,
      external_id: cap(c.external_id, 255),
      name: cap(c.name, 255),
      status: c.status,
      conclusion: c.conclusion,
      details_url: c.details_url,
      started_at: c.started_at ? new Date(c.started_at) : null,
      completed_at: c.completed_at ? new Date(c.completed_at) : null,
      updated_at: new Date(c.completed_at ?? c.started_at ?? at.toISOString()),
    });
    const checks = await repos.gitEntities.checksFor(ctx, repo.id, event.sha);
    for (const pr of heads) {
      const updated = (await repos.gitEntities.updatePullRequest(ctx, pr.id, {
        ci_state: ciState(checks),
        ci_summary: ciSummary(checks),
        updated_at: at,
      }))!;
      const issues = await liveIssuesOf(repos, ctx, 'pull_request', pr.id);
      await recordPrChange(repos, ctx, issues, prSnapshot(repo, pr), prSnapshot(repo, updated), changeGroupId, at);
    }
  }

  type Actor = Pick<EventActor, 'login' | 'provider_user_id' | 'email'>;
  const commitAuthor = (c: NormalizedCommit): Actor => ({
    login: c.author_login,
    provider_user_id: c.author_provider_id,
    email: c.author_email,
  });

  function actorsOf(event: NormalizedEvent, fetched: FetchedCommits | null): Actor[] {
    const fromCommits = (fetched?.commits ?? []).map(commitAuthor);
    if (event.type === 'push') return [...event.commits.map(commitAuthor), ...fromCommits];
    if (event.type === 'pull_request.review') return [event.reviewer];
    if ('pull_request' in event) {
      const pr = event.pull_request;
      return [pr.author, ...(pr.merged_by ? [pr.merged_by] : []), ...pr.requested_reviewers, ...fromCommits];
    }
    return [];
  }

  /** The network half of an event: what must be read from the provider before the writes. */
  async function prefetch(
    ctx: TenantContext,
    connection: GitConnectionRow,
    provider: GitProvider,
    repo: GitRepositoryRow,
    event: NormalizedEvent,
    stored: GitPullRequestRow | undefined,
  ): Promise<{ commits: FetchedCommits | null; superseded: string[] }> {
    const auth = connectionAuth(masterKey, connection);
    if (!canFetch(auth)) return { commits: null, superseded: [] };
    if (event.type === 'push' && !event.created && provider.supports.compare && !/^0+$/.test(event.before)) {
      const known = !provider.supports.reports_forced_push && (await entities.findBranch(ctx, repo.id, event.ref));
      if (event.forced || known) {
        return { commits: null, superseded: await provider.compare(auth, repo, event.after, event.before) };
      }
    }
    if (event.type.startsWith('pull_request.') && event.type !== 'pull_request.review') {
      const pr = (event as Extract<NormalizedEvent, { pull_request: NormalizedPullRequest }>).pull_request;
      // Cached by head: a review or a title edit does not read the commits again, and a pull request
      // not stored yet is read only when its commits can have changed.
      const fresh = ['pull_request.opened', 'pull_request.synchronized', 'pull_request.reopened'].includes(event.type);
      if (stored ? stored.commits_fetched_for_sha === pr.head.sha : !fresh) return { commits: null, superseded: [] };
      return { commits: await provider.listPullRequestCommits(auth, repo, pr.number), superseded: [] };
    }
    return { commits: null, superseded: [] };
  }

  /** Applies one normalized event to a linked repository: entities, links, history. */
  async function applyOne(
    ctx: TenantContext,
    connection: GitConnectionRow,
    repo: GitRepositoryRow,
    scope: Scope,
    event: NormalizedEvent,
    at: Date,
  ) {
    const provider = providerOf(providers, connection.provider);
    const author = authorResolver(ctx, connection);
    const prNumber = 'pull_request' in event ? event.pull_request.number : null;
    const stored = prNumber === null ? undefined : await entities.findPullRequest(ctx, repo.id, prNumber);
    const { commits, superseded } = await prefetch(ctx, connection, provider, repo, event, stored);
    // Authors are matched before the transaction opens, so it never waits on a second connection.
    await Promise.all(actorsOf(event, commits).map(author));
    const changeGroupId = Bun.randomUUIDv7();
    await inTransaction(async repos => {
      if (event.type === 'branch.created' || event.type === 'branch.deleted') {
        await applyBranch(repos, ctx, repo, scope, event, changeGroupId, at);
      } else if (event.type === 'push') {
        await applyPush(repos, ctx, repo, scope, event, superseded, author, changeGroupId, at);
      } else if (event.type === 'pull_request.review') {
        await applyReviewEvent(repos, ctx, repo, event, author, changeGroupId, at);
      } else if (event.type === 'check.updated') {
        await applyCheck(repos, ctx, repo, event, changeGroupId, at);
      } else if ('pull_request' in event) {
        await applyPullRequest(repos, ctx, repo, scope, event.pull_request, commits, author, changeGroupId, at);
      }
    });
  }

  return {
    prSnapshot,

    /** Checks of old heads after 7 days, superseded commits after 30, rows nothing has linked for 90. */
    async purge(at = now()): Promise<number> {
      const day = 24 * 60 * 60 * 1000;
      const purgeSys = systemContext('git.purge: retention spans every organisation');
      let total = 0;
      for (;;) {
        const n =
          (await entities.purgeStaleChecks(purgeSys, new Date(at.getTime() - 7 * day), 5_000)) +
          (await entities.purgeUnlinked(
            purgeSys,
            new Date(at.getTime() - 30 * day),
            new Date(at.getTime() - GIT_BACKFILL_DAYS * day),
            1_000,
          ));
        total += n;
        if (n === 0) return total;
      }
    },

    /** The ingest step for branches, commits, pull requests and checks of a linked repository. */
    async applyEntities(
      ctx: TenantContext,
      connection: GitConnectionRow,
      repo: GitRepositoryRow,
      events: NormalizedEvent[],
      _row: GitWebhookEventRow,
    ): Promise<EntityOutcome> {
      const scope = await scopeOf(ctx, repo);
      for (const event of events) await applyOne(ctx, connection, repo, scope, event, now());
      return { status: 'done' };
    },

    /**
     * Reads a newly linked repository's recent history in: open pull requests and those updated in
     * the last 90 days, and the branches whose names reference an issue. Never runs automations.
     */
    async backfill(
      ctx: TenantContext,
      connection: GitConnectionRow,
      repo: GitRepositoryRow,
    ): Promise<{ pull_requests: number; branches: number }> {
      const provider = providerOf(providers, connection.provider);
      const auth = connectionAuth(masterKey, connection);
      if (!canFetch(auth)) return { pull_requests: 0, branches: 0 };
      const scope = await scopeOf(ctx, repo);
      const since = new Date(now().getTime() - GIT_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
      const pulls = await provider.listPullRequests(auth, repo, since, GIT_BACKFILL_PULL_REQUESTS_MAX);
      let linkedPulls = 0;
      for (const pr of pulls) {
        await applyOne(
          ctx,
          connection,
          repo,
          scope,
          { type: 'pull_request.opened', repo, pull_request: pr, actor: pr.author },
          now(),
        );
        if (await entities.findPullRequest(ctx, repo.id, pr.number)) linkedPulls++;
      }
      let linkedBranches = 0;
      for (const branch of await provider.listBranches(auth, repo, 1_000)) {
        if (!findIssueReferences(branch.name, scope.keys).references.length) continue;
        await applyOne(
          ctx,
          connection,
          repo,
          scope,
          {
            type: 'branch.created',
            repo,
            ref: branch.name,
            head_sha: branch.head_sha,
            actor: { login: null, provider_user_id: null, name: null, email: null, avatar_url: null },
          },
          now(),
        );
        if (await entities.findBranch(ctx, repo.id, branch.name)) linkedBranches++;
      }
      return { pull_requests: linkedPulls, branches: linkedBranches };
    },

    /** Re-reads the pull requests still open here, as if their events had arrived again. */
    async reconcile(ctx: TenantContext, connection: GitConnectionRow, repo: GitRepositoryRow): Promise<number> {
      const provider = providerOf(providers, connection.provider);
      const auth = connectionAuth(masterKey, connection);
      if (!canFetch(auth)) return 0;
      const scope = await scopeOf(ctx, repo);
      let applied = 0;
      for (const stored of await entities.openPullRequests(ctx, repo.id)) {
        // One pull request the provider will not return tonight does not hold back the rest.
        const pr = await provider.getPullRequest(auth, repo, stored.number).catch(() => null);
        if (!pr) continue;
        await applyOne(
          ctx,
          connection,
          repo,
          scope,
          { type: 'pull_request.edited', repo, pull_request: pr, actor: pr.author },
          now(),
        );
        applied++;
      }
      return applied;
    },

    /** Applies a pull request read by hand (a pasted URL), so a manual link has a row to point at. */
    async readPullRequest(
      ctx: TenantContext,
      connection: GitConnectionRow,
      repo: GitRepositoryRow,
      number: number,
    ): Promise<GitPullRequestRow | null> {
      const provider = providerOf(providers, connection.provider);
      const auth = connectionAuth(masterKey, connection);
      if (!canFetch(auth)) return (await entities.findPullRequest(ctx, repo.id, number)) ?? null;
      const pr = await provider.getPullRequest(auth, repo, number);
      if (!pr) return null;
      const scope = await scopeOf(ctx, repo);
      const author = authorResolver(ctx, connection);
      const fetched = await provider.listPullRequestCommits(auth, repo, number);
      return inTransaction(async repos => {
        const applied = await applyPullRequest(repos, ctx, repo, scope, pr, fetched, author, Bun.randomUUIDv7(), now());
        if (applied) return applied;
        // Nothing references an issue yet: store it anyway, for the manual link about to be made.
        const stored = await repos.gitEntities.insertPullRequest(ctx, repo.id, {
          number: pr.number,
          title: cap(pr.title, 1_000),
          state: pr.state,
          author_login: pr.author.login,
          author_provider_id: pr.author.provider_user_id,
          author_avatar_url: pr.author.avatar_url,
          author_user_id: await author(pr.author),
          head_repo_full_name: pr.head.repo_full_name,
          head_ref: pr.head.ref,
          head_sha: pr.head.sha,
          base_ref: pr.base.ref,
          merge_commit_sha: pr.state === 'merged' ? pr.merge_commit_sha : null,
          merged_by_login: pr.merged_by?.login ?? null,
          is_revert: isRevertName(pr.title, pr.head.ref),
          html_url: pr.html_url,
          provider_updated_at: new Date(pr.provider_updated_at),
          opened_at: new Date(pr.opened_at),
          merged_at: pr.merged_at ? new Date(pr.merged_at) : null,
          closed_at: pr.closed_at ? new Date(pr.closed_at) : null,
          updated_at: now(),
        });
        return stored ?? (await repos.gitEntities.findPullRequest(ctx, repo.id, pr.number))!;
      });
    },
  };
}

export type GitLinksService = ReturnType<typeof gitLinksService>;
