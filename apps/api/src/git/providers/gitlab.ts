import { timingSafeEqual } from 'node:crypto';
import {
  cap,
  capOrNull,
  TEXT_CAPS,
  type CheckConclusion,
  type CheckStatus,
  type EventActor,
  type NormalizedCheck,
  type NormalizedCommit,
  type NormalizedEvent,
  type NormalizedPullRequest,
  type ProviderRepo,
  type PullRequestAction,
  type PullRequestState,
  type RepoRef,
  type ReviewState,
} from '@git/events';
import { gitPages, gitRequest, GitProviderError, nextLink, pageBudget, type GitRequest } from '@git/http';
import {
  BRANCHES_MAX,
  PULL_REQUEST_COMMITS_MAX,
  REPOSITORIES_MAX,
  type ConnectionAuth,
  type DeliveryHeaders,
  type GitProvider,
  type ProviderDeps,
} from '@git/provider';

type Json = Record<string, unknown>;

const PUSH_COMMITS_MAX = 100;
const PAGE = 100;
const ZERO_SHA = /^0+$/;
const DRAFT_TITLE = /^\s*(\[draft\]|\(draft\)|draft:|\[wip\]|wip:)\s*/i;
const COMMIT_FILE_LISTS = new Set(['added', 'modified', 'removed']);

const rec = (v: unknown): Json => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.map(rec) : []);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);
const idOf = (v: unknown): string | null =>
  typeof v === 'number' ? String(v) : typeof v === 'string' && v !== '' ? v : null;
const trimSlash = (url: string) => url.replace(/\/+$/, '');

// GitLab redacts hook emails as `[REDACTED]` or sends an empty string.
function email(v: unknown): string | null {
  const value = str(v);
  return value && value.includes('@') ? cap(value, TEXT_CAPS.name) : null;
}

// Hooks send `2026-10-25 10:00:00 UTC`; the REST API and commit timestamps send ISO 8601.
function isoOrNull(v: unknown): string | null {
  const value = str(v);
  if (!value) return null;
  const utc = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/.exec(value);
  const ms = Date.parse(utc ? `${utc[1]}T${utc[2]}Z` : value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function header(headers: DeliveryHeaders, name: string): string | null {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first : null;
}

export function gitlabEventName(hookHeader: string): string {
  return hookHeader
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/_hook$/, '');
}

function actor(u: Json): EventActor {
  return {
    login: capOrNull(str(u.username), TEXT_CAPS.name),
    provider_user_id: idOf(u.id),
    name: capOrNull(str(u.name), TEXT_CAPS.name),
    email: email(u.email),
    avatar_url: capOrNull(str(u.avatar_url), TEXT_CAPS.url),
  };
}

function repoOf(payload: Json): RepoRef | null {
  const project = rec(payload.project);
  const id = idOf(project.id) ?? idOf(payload.project_id);
  const fullName = str(project.path_with_namespace);
  return id && fullName ? { provider_repo_id: id, full_name: cap(fullName, TEXT_CAPS.name) } : null;
}

function hookCommit(c: Json, now: () => Date): NormalizedCommit {
  const author = rec(c.author);
  return {
    sha: cap(str(c.id), TEXT_CAPS.ref),
    message: cap(str(c.message), TEXT_CAPS.message),
    author_name: cap(str(author.name), TEXT_CAPS.name),
    author_email: cap(str(author.email), TEXT_CAPS.name),
    author_login: null,
    author_provider_id: null,
    committed_at: isoOrNull(c.timestamp) ?? now().toISOString(),
    url: cap(str(c.url), TEXT_CAPS.url),
    distinct: true,
  };
}

function normalizePush(p: Json, now: () => Date): NormalizedEvent[] {
  const repo = repoOf(p);
  const fullRef = str(p.ref);
  const before = str(p.before);
  const after = str(p.after);
  if (!repo || !fullRef?.startsWith('refs/heads/') || !before || !after) return [];
  const ref = cap(fullRef.slice('refs/heads/'.length), TEXT_CAPS.ref);
  const pusher: EventActor = {
    login: capOrNull(str(p.user_username), TEXT_CAPS.name),
    provider_user_id: idOf(p.user_id),
    name: capOrNull(str(p.user_name), TEXT_CAPS.name),
    email: email(p.user_email),
    avatar_url: capOrNull(str(p.user_avatar), TEXT_CAPS.url),
  };
  if (ZERO_SHA.test(after)) return [{ type: 'branch.deleted', repo, ref, head_sha: null, actor: pusher }];

  const created = ZERO_SHA.test(before);
  const listed = list(p.commits);
  const total = int(p.total_commits_count) ?? listed.length;
  const events: NormalizedEvent[] = [];
  if (created) events.push({ type: 'branch.created', repo, ref, head_sha: cap(after, TEXT_CAPS.ref), actor: pusher });
  events.push({
    type: 'push',
    repo,
    ref,
    before: cap(before, TEXT_CAPS.ref),
    after: cap(after, TEXT_CAPS.ref),
    // Push hooks do not say whether the push was forced; `compare` finds superseded commits instead.
    forced: false,
    created,
    deleted: false,
    commits: listed.slice(0, PUSH_COMMITS_MAX).map(c => hookCommit(c, now)),
    commits_truncated: listed.length > PUSH_COMMITS_MAX || total > listed.length,
    pusher,
  });
  return events;
}

function pullRequestState(raw: string | null, draft: boolean): PullRequestState {
  if (raw === 'merged') return 'merged';
  if (raw === 'closed') return 'closed';
  return draft ? 'draft' : 'open';
}

function hookPullRequest(p: Json, action: string, now: () => Date): NormalizedPullRequest | null {
  const a = rec(p.object_attributes);
  const number = int(a.iid);
  if (number === null) return null;
  const user = rec(p.user);
  const draft = a.draft === true || a.work_in_progress === true;
  const state = action === 'merge' ? 'merged' : action === 'close' ? 'closed' : pullRequestState(str(a.state), draft);
  const authorId = idOf(a.author_id);
  const updatedAt = isoOrNull(a.updated_at) ?? now().toISOString();
  return {
    number,
    title: cap(str(a.title), TEXT_CAPS.title),
    body: cap(str(a.description), TEXT_CAPS.body),
    state,
    draft,
    author:
      authorId !== null && authorId === idOf(user.id)
        ? actor(user)
        : { login: null, provider_user_id: authorId, name: null, email: null, avatar_url: null },
    head: {
      repo_full_name: capOrNull(str(rec(a.source).path_with_namespace), TEXT_CAPS.name),
      ref: cap(str(a.source_branch), TEXT_CAPS.ref),
      sha: cap(str(rec(a.last_commit).id), TEXT_CAPS.ref),
    },
    base: { ref: cap(str(a.target_branch), TEXT_CAPS.ref) },
    merge_commit_sha: action === 'merge' ? capOrNull(str(a.merge_commit_sha), TEXT_CAPS.ref) : null,
    merged_by: action === 'merge' ? actor(user) : null,
    html_url: cap(str(a.url), TEXT_CAPS.url),
    requested_reviewers: list(p.reviewers).map(actor),
    additions: null,
    deletions: null,
    changed_files: null,
    commits_count: null,
    provider_updated_at: updatedAt,
    opened_at: isoOrNull(a.created_at) ?? updatedAt,
    merged_at: state === 'merged' ? updatedAt : null,
    closed_at: state === 'merged' || state === 'closed' ? updatedAt : null,
  };
}

function draftChange(changes: Json): 'ready' | 'draft' | null {
  const flag = rec(changes.draft ?? changes.work_in_progress);
  if (typeof flag.previous === 'boolean' && typeof flag.current === 'boolean' && flag.previous !== flag.current) {
    return flag.current ? 'draft' : 'ready';
  }
  const title = rec(changes.title);
  const before = DRAFT_TITLE.test(str(title.previous) ?? '');
  const after = DRAFT_TITLE.test(str(title.current) ?? '');
  if ('title' in changes && before !== after) return after ? 'draft' : 'ready';
  return null;
}

// A title change that only adds or drops the draft prefix is the draft transition, not an edit.
function titleEdited(changes: Json): boolean {
  if (!('title' in changes)) return false;
  const title = rec(changes.title);
  const bare = (v: unknown) => (str(v) ?? '').replace(DRAFT_TITLE, '');
  return bare(title.previous) !== bare(title.current);
}

function updateActions(p: Json): PullRequestAction[] {
  const changes = rec(p.changes);
  const actions: PullRequestAction[] = [];
  if ('target_branch' in changes) actions.push('retargeted');
  if (str(rec(p.object_attributes).oldrev)) actions.push('synchronized');
  const draft = draftChange(changes);
  if (draft) actions.push(draft === 'ready' ? 'ready_for_review' : 'converted_to_draft');
  if (titleEdited(changes) || 'description' in changes || 'reviewers' in changes) actions.push('edited');
  return actions;
}

const PULL_REQUEST_ACTION: Record<string, PullRequestAction> = {
  open: 'opened',
  reopen: 'reopened',
  close: 'closed',
  merge: 'closed',
};

const REVIEW_STATE: Record<string, ReviewState> = {
  approved: 'approved',
  approval: 'approved',
  unapproved: 'dismissed',
  unapproval: 'dismissed',
};

function normalizeMergeRequest(p: Json, now: () => Date): NormalizedEvent[] {
  const repo = repoOf(p);
  const attrs = rec(p.object_attributes);
  const action = str(attrs.action) ?? '';
  const iid = int(attrs.iid);
  if (!repo || iid === null) return [];

  const review = REVIEW_STATE[action];
  if (review) {
    return [
      {
        type: 'pull_request.review',
        repo,
        number: iid,
        reviewer: actor(rec(p.user)),
        state: review,
        submitted_at: isoOrNull(attrs.updated_at) ?? now().toISOString(),
      },
    ];
  }

  const single = PULL_REQUEST_ACTION[action];
  const actions = single ? [single] : action === 'update' ? updateActions(p) : [];
  const pullRequest = actions.length ? hookPullRequest(p, action, now) : null;
  if (!pullRequest) return [];
  const by = actor(rec(p.user));
  return actions.map(a => ({ type: `pull_request.${a}` as const, repo, pull_request: pullRequest, actor: by }));
}

const CHECK_STATUS: Record<string, { status: CheckStatus; conclusion: CheckConclusion | null }> = {
  created: { status: 'queued', conclusion: null },
  pending: { status: 'queued', conclusion: null },
  waiting_for_resource: { status: 'queued', conclusion: null },
  waiting_for_callback: { status: 'queued', conclusion: null },
  preparing: { status: 'queued', conclusion: null },
  scheduled: { status: 'queued', conclusion: null },
  manual: { status: 'queued', conclusion: null },
  running: { status: 'in_progress', conclusion: null },
  canceling: { status: 'in_progress', conclusion: null },
  success: { status: 'completed', conclusion: 'success' },
  failed: { status: 'completed', conclusion: 'failure' },
  canceled: { status: 'completed', conclusion: 'cancelled' },
  skipped: { status: 'completed', conclusion: 'skipped' },
};

function check(
  externalId: string,
  name: string | null,
  rawStatus: unknown,
  detailsUrl: string | null,
  startedAt: unknown,
  finishedAt: unknown,
): NormalizedCheck | null {
  const mapped = CHECK_STATUS[str(rawStatus) ?? ''];
  if (!mapped) return null;
  return {
    external_id: cap(externalId, TEXT_CAPS.name),
    name: cap(name, TEXT_CAPS.name),
    status: mapped.status,
    conclusion: mapped.conclusion,
    details_url: capOrNull(detailsUrl, TEXT_CAPS.url),
    started_at: isoOrNull(startedAt),
    completed_at: mapped.status === 'completed' ? isoOrNull(finishedAt) : null,
  };
}

function projectWebUrl(p: Json): string | null {
  const url = str(rec(p.project).web_url) ?? str(rec(p.repository).homepage);
  return url ? trimSlash(url) : null;
}

function normalizePipeline(p: Json): NormalizedEvent[] {
  const repo = repoOf(p);
  const attrs = rec(p.object_attributes);
  const sha = str(attrs.sha);
  const pipelineId = idOf(attrs.id);
  if (!repo || !sha || !pipelineId) return [];
  const web = projectWebUrl(p);
  const builds = list(p.builds);
  const checks = builds.length
    ? builds.map(b => {
        const jobId = idOf(b.id);
        return jobId
          ? check(`job:${jobId}`, str(b.name), b.status, web && `${web}/-/jobs/${jobId}`, b.started_at, b.finished_at)
          : null;
      })
    : [
        check(
          `pipeline:${pipelineId}`,
          'pipeline',
          attrs.status,
          str(attrs.url) ?? (web && `${web}/-/pipelines/${pipelineId}`),
          attrs.created_at,
          attrs.finished_at,
        ),
      ];
  return checks.flatMap(c =>
    c ? [{ type: 'check.updated' as const, repo, sha: cap(sha, TEXT_CAPS.ref), check: c }] : [],
  );
}

function normalizeJob(p: Json): NormalizedEvent[] {
  const repo = repoOf(p);
  const sha = str(p.sha);
  const jobId = idOf(p.build_id);
  if (!repo || !sha || !jobId) return [];
  const web = projectWebUrl(p);
  const c = check(
    `job:${jobId}`,
    str(p.build_name),
    p.build_status,
    web && `${web}/-/jobs/${jobId}`,
    p.build_started_at,
    p.build_finished_at,
  );
  return c ? [{ type: 'check.updated', repo, sha: cap(sha, TEXT_CAPS.ref), check: c }] : [];
}

function restUser(v: unknown): EventActor | null {
  const u = rec(v);
  return idOf(u.id) || str(u.username) ? { ...actor(u), email: email(u.public_email) } : null;
}

const NO_ACTOR: EventActor = { login: null, provider_user_id: null, name: null, email: null, avatar_url: null };

function restPullRequest(m: Json, repo: RepoRef, now: () => Date): NormalizedPullRequest | null {
  const number = int(m.iid);
  if (number === null) return null;
  const draft = m.draft === true || m.work_in_progress === true;
  const state = pullRequestState(str(m.state), draft);
  const updatedAt = isoOrNull(m.updated_at) ?? now().toISOString();
  const sameProject = m.source_project_id === undefined || m.source_project_id === m.target_project_id;
  return {
    number,
    title: cap(str(m.title), TEXT_CAPS.title),
    body: cap(str(m.description), TEXT_CAPS.body),
    state,
    draft,
    author: restUser(m.author) ?? NO_ACTOR,
    head: {
      repo_full_name: sameProject ? repo.full_name : null,
      ref: cap(str(m.source_branch), TEXT_CAPS.ref),
      sha: cap(str(m.sha), TEXT_CAPS.ref),
    },
    base: { ref: cap(str(m.target_branch), TEXT_CAPS.ref) },
    merge_commit_sha: capOrNull(str(m.merge_commit_sha) ?? str(m.squash_commit_sha), TEXT_CAPS.ref),
    merged_by: restUser(m.merge_user) ?? restUser(m.merged_by),
    html_url: cap(str(m.web_url), TEXT_CAPS.url),
    requested_reviewers: list(m.reviewers).flatMap(r => restUser(r) ?? []),
    additions: null,
    deletions: null,
    changed_files: null,
    commits_count: null,
    provider_updated_at: updatedAt,
    opened_at: isoOrNull(m.created_at) ?? updatedAt,
    merged_at: state === 'merged' ? (isoOrNull(m.merged_at) ?? updatedAt) : null,
    closed_at: state === 'merged' || state === 'closed' ? (isoOrNull(m.closed_at ?? m.merged_at) ?? updatedAt) : null,
  };
}

function restCommit(c: Json, now: () => Date): NormalizedCommit {
  return {
    sha: cap(str(c.id), TEXT_CAPS.ref),
    message: cap(str(c.message), TEXT_CAPS.message),
    author_name: cap(str(c.author_name), TEXT_CAPS.name),
    author_email: cap(str(c.author_email), TEXT_CAPS.name),
    author_login: null,
    author_provider_id: null,
    committed_at: isoOrNull(c.committed_date ?? c.authored_date ?? c.created_at) ?? now().toISOString(),
    url: cap(str(c.web_url), TEXT_CAPS.url),
    distinct: true,
  };
}

function restRepo(p: Json): ProviderRepo | null {
  const id = idOf(p.id);
  const fullName = str(p.path_with_namespace);
  if (!id || !fullName) return null;
  return {
    provider_repo_id: id,
    full_name: cap(fullName, TEXT_CAPS.name),
    html_url: cap(str(p.web_url), TEXT_CAPS.url),
    default_branch: cap(str(p.default_branch), TEXT_CAPS.ref),
    is_private: p.visibility !== 'public',
    is_archived: p.archived === true,
  };
}

function expiryDate(v: unknown): Date | null {
  const value = str(v);
  if (!value) return null;
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (err) {
    if (err instanceof GitProviderError && err.reason === 'not_found') return null;
    throw err;
  }
}

export function gitlabProvider(deps: ProviderDeps): GitProvider {
  const { fetch, now } = deps;

  const api = (auth: ConnectionAuth, path: string) => `${trimSlash(auth.base_url)}/api/v4${path}`;
  const project = (repo: RepoRef) => `/projects/${encodeURIComponent(repo.provider_repo_id)}`;

  function authHeaders(auth: ConnectionAuth): Record<string, string> {
    if (!auth.token) throw new GitProviderError('token_invalid');
    return { 'PRIVATE-TOKEN': auth.token };
  }

  async function get<T>(auth: ConnectionAuth, path: string, query?: GitRequest['query']): Promise<T> {
    const res = await gitRequest<T>(fetch, api(auth, path), {
      headers: authHeaders(auth),
      ...(query ? { query } : {}),
    });
    return res.data;
  }

  function paged(auth: ConnectionAuth, path: string, query: GitRequest['query'], limit: number) {
    return gitPages<unknown, Json>(
      fetch,
      api(auth, path),
      { headers: authHeaders(auth), query: { per_page: PAGE, ...query } },
      list,
      limit,
    );
  }

  const pages = async (...args: Parameters<typeof paged>) => (await paged(...args)).items;

  async function listRepositories(auth: ConnectionAuth): Promise<{ repos: ProviderRepo[]; complete: boolean }> {
    const { items, complete } = await paged(
      auth,
      '/projects',
      { membership: true, min_access_level: 20, simple: false },
      REPOSITORIES_MAX,
    );
    return { repos: items.flatMap(p => restRepo(p) ?? []), complete };
  }

  function hookBody(target: { url: string; secret: string }) {
    return {
      url: target.url,
      token: target.secret,
      push_events: true,
      merge_requests_events: true,
      pipeline_events: true,
      job_events: true,
      tag_push_events: false,
      enable_ssl_verification: true,
    };
  }

  return {
    kind: 'gitlab',
    defaultBaseUrl: 'https://gitlab.com',
    supports: { checks: true, reviews: true, compare: true, webhook_registration: true, reports_forced_push: false },

    verifyWebhook(headers, _rawBody, secret) {
      const token = header(headers, 'x-gitlab-token');
      const event = header(headers, 'x-gitlab-event');
      // `Idempotency-Key` stays the same across GitLab's retries; older instances send only the event UUID.
      const delivery = header(headers, 'idempotency-key') ?? header(headers, 'x-gitlab-event-uuid');
      if (!secret || !token || !event || !delivery) return null;
      const given = Buffer.from(token);
      const expected = Buffer.from(secret);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      return { delivery_id: delivery, event_name: gitlabEventName(event) };
    },

    route(_eventName, payload) {
      const p = rec(payload);
      return { installation_id: null, provider_repo_id: idOf(rec(p.project).id) ?? idOf(p.project_id) };
    },

    normalize(eventName, payload) {
      const p = rec(payload);
      try {
        switch (eventName) {
          case 'push':
            return normalizePush(p, now);
          case 'merge_request':
            return normalizeMergeRequest(p, now);
          case 'pipeline':
            return normalizePipeline(p);
          case 'job':
            return normalizeJob(p);
          default:
            return [];
        }
      } catch {
        return [];
      }
    },

    pullRequestFromUrl(url) {
      const match = /^\/(.+?)\/-\/merge_requests\/(\d{1,9})(?:\/|$)/.exec(url.pathname);
      return match ? { full_name: decodeURIComponent(match[1]!), number: Number(match[2]) } : null;
    },

    repositoryFromPayload(_eventName, payload) {
      const project = rec(rec(payload).project);
      const repo = restRepo({ ...project, visibility: project.visibility_level === 20 ? 'public' : 'private' });
      return repo;
    },

    trim(eventName, payload) {
      if (eventName !== 'push') return payload;
      const p = rec(payload);
      const commits = list(p.commits)
        .slice(0, PUSH_COMMITS_MAX)
        .map(c => Object.fromEntries(Object.entries(c).filter(([key]) => !COMMIT_FILE_LISTS.has(key))));
      return { ...p, commits };
    },

    async describeConnection(auth) {
      const [token, user, { repos }] = await Promise.all([
        orNull(get<Json>(auth, '/personal_access_tokens/self')),
        get<Json>(auth, '/user'),
        listRepositories(auth),
      ]);
      const namespaces = new Set(repos.map(r => r.full_name.split('/')[0]));
      const shared = namespaces.size === 1 ? [...namespaces][0] : undefined;
      const login = shared ?? cap(str(user.username), TEXT_CAPS.name);
      let avatar = capOrNull(str(user.avatar_url), TEXT_CAPS.url);
      if (shared) {
        try {
          const namespace = await get<Json>(auth, `/namespaces/${encodeURIComponent(shared)}`);
          avatar = capOrNull(str(namespace.avatar_url), TEXT_CAPS.url) ?? avatar;
        } catch (err) {
          if (err instanceof GitProviderError && err.reason === 'token_invalid') throw err;
        }
      }
      // `read_api` lists projects but cannot add hooks; `api` can. Older instances do not describe the token.
      const scopes = Array.isArray(token?.scopes) ? (token.scopes as unknown[]).map(String) : null;
      return {
        account: { login, avatar_url: avatar, url: `${trimSlash(auth.base_url)}/${login}` },
        token_expires_at: expiryDate(token?.expires_at),
        can_manage_webhooks: scopes ? scopes.includes('api') : null,
      };
    },

    listRepositories,

    async getRepository(auth, repo) {
      const p = await orNull(get<Json>(auth, project(repo)));
      return p ? restRepo(rec(p)) : null;
    },

    async getPullRequest(auth, repo, number) {
      const m = await orNull(get<Json>(auth, `${project(repo)}/merge_requests/${number}`));
      return m ? restPullRequest(rec(m), repo, now) : null;
    },

    async listPullRequests(auth, repo, since, limit) {
      const path = `${project(repo)}/merge_requests`;
      const order = { order_by: 'updated_at', sort: 'desc' };
      const [open, recent] = await Promise.all([
        pages(auth, path, { state: 'opened', ...order }, limit),
        pages(auth, path, { updated_after: since.toISOString(), ...order }, limit),
      ]);
      const byNumber = new Map<number, NormalizedPullRequest>();
      for (const m of [...open, ...recent]) {
        const pr = restPullRequest(m, repo, now);
        if (pr && !byNumber.has(pr.number)) byNumber.set(pr.number, pr);
      }
      return [...byNumber.values()]
        .sort((a, b) => b.provider_updated_at.localeCompare(a.provider_updated_at))
        .slice(0, limit);
    },

    async listPullRequestCommits(auth, repo, number) {
      const headers = authHeaders(auth);
      const newestFirst: Json[] = [];
      let total: number | null = null;
      let next: string | null = api(auth, `${project(repo)}/merge_requests/${number}/commits`);
      let query: GitRequest['query'] = { per_page: PAGE };
      const more = pageBudget();
      while (next && newestFirst.length < PULL_REQUEST_COMMITS_MAX && more(next)) {
        const res: { data: unknown; headers: Headers } = await gitRequest<unknown>(fetch, next, {
          headers,
          ...(query ? { query } : {}),
        });
        const xTotal = res.headers.get('x-total');
        if (total === null && xTotal && /^\d+$/.test(xTotal)) total = Number(xTotal);
        newestFirst.push(...list(res.data));
        next = nextLink(res.headers, next);
        query = undefined;
      }
      const capped = next !== null || newestFirst.length > PULL_REQUEST_COMMITS_MAX;
      const commits = newestFirst
        .slice(0, PULL_REQUEST_COMMITS_MAX)
        .reverse()
        .map(c => restCommit(c, now));
      return { commits, total: capped ? (total ?? newestFirst.length) : newestFirst.length };
    },

    async listBranches(auth, repo, limit) {
      const branches = await pages(auth, `${project(repo)}/repository/branches`, {}, Math.min(limit, BRANCHES_MAX));
      return branches.flatMap(b => {
        const name = str(b.name);
        const sha = str(rec(b.commit).id);
        return name && sha ? [{ name: cap(name, TEXT_CAPS.ref), head_sha: cap(sha, TEXT_CAPS.ref) }] : [];
      });
    },

    async compare(auth, repo, base, head) {
      const res = await get<Json>(auth, `${project(repo)}/repository/compare`, {
        from: base,
        to: head,
        straight: true,
      });
      return list(rec(res).commits).flatMap(c => str(c.id) ?? []);
    },

    async registerWebhook(auth, repo, target) {
      const res = await gitRequest<Json>(fetch, api(auth, `${project(repo)}/hooks`), {
        method: 'POST',
        headers: authHeaders(auth),
        body: hookBody(target),
      });
      const id = idOf(rec(res.data).id);
      if (!id) throw new GitProviderError('invalid', res.status);
      return { provider_webhook_id: id };
    },

    async updateWebhook(auth, repo, providerWebhookId, target) {
      await gitRequest(fetch, api(auth, `${project(repo)}/hooks/${encodeURIComponent(providerWebhookId)}`), {
        method: 'PUT',
        headers: authHeaders(auth),
        body: hookBody(target),
      });
    },

    async removeWebhook(auth, repo, providerWebhookId) {
      await orNull(
        gitRequest(fetch, api(auth, `${project(repo)}/hooks/${encodeURIComponent(providerWebhookId)}`), {
          method: 'DELETE',
          headers: authHeaders(auth),
        }),
      );
    },

    async webhookExists(auth, repo, providerWebhookId) {
      const hook = await orNull(get<Json>(auth, `${project(repo)}/hooks/${encodeURIComponent(providerWebhookId)}`));
      return hook !== null;
    },

    redeliveryUrl(connection, repo, providerWebhookId) {
      if (!repo || !providerWebhookId) return null;
      return `${trimSlash(connection.base_url)}/${repo.full_name}/-/hooks/${encodeURIComponent(providerWebhookId)}/edit`;
    },
  };
}
