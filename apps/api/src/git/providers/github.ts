import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import {
  cap,
  capOrNull,
  TEXT_CAPS,
  type CheckConclusion,
  type CheckStatus,
  type EventActor,
  type NormalizedCommit,
  type NormalizedEvent,
  type NormalizedPullRequest,
  type ProviderRepo,
  type PullRequestAction,
  type RepoRef,
  type RepositoryEventType,
  type ReviewState,
} from '@git/events';
import { gitPages, gitRequest, GitProviderError, nextLink, type GitRequest, type GitResponse } from '@git/http';
import {
  BRANCHES_MAX,
  PULL_REQUEST_COMMITS_MAX,
  REPOSITORIES_MAX,
  type ConnectionAuth,
  type DeliveryHeaders,
  type GitAppInstall,
  type GitProvider,
  type ProviderDeps,
} from '@git/provider';

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  /** The web base: `https://github.com` or a GitHub Enterprise Server URL. */
  baseUrl: string;
}

const GITHUB_COM = 'https://github.com';
const API_HEADERS = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'nothingleft',
};
const BRANCH_PREFIX = 'refs/heads/';
const PUSH_COMMITS_MAX = 100;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

type Json = Record<string, unknown>;

class Malformed extends Error {}

function need<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Malformed();
  return value;
}

const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function at(v: unknown, ...path: string[]): unknown {
  let current = v;
  for (const key of path) current = obj(current)?.[key];
  return current;
}

function id(v: unknown): string | null {
  if (typeof v === 'number' && Number.isSafeInteger(v)) return String(v);
  return typeof v === 'string' && v !== '' ? v : null;
}

function iso(v: unknown): string | null {
  const text = str(v);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function parsed<T>(read: () => T): T[] {
  try {
    return [read()];
  } catch {
    return [];
  }
}

function parseOne<T>(read: () => T): T {
  try {
    return read();
  } catch {
    throw new GitProviderError('invalid');
  }
}

function header(headers: DeliveryHeaders, name: string): string | null {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first : null;
}

const trimSlash = (url: string) => url.replace(/\/+$/, '');

function apiBase(baseUrl: string): string {
  const base = trimSlash(baseUrl);
  return base === GITHUB_COM ? 'https://api.github.com' : `${base}/api/v3`;
}

const repoPath = (repo: RepoRef) => `/repositories/${encodeURIComponent(repo.provider_repo_id)}`;
const refSegment = (ref: string) => encodeURIComponent(ref).replace(/%2F/g, '/');

function actor(user: unknown, contact: unknown = null): EventActor {
  return {
    login: capOrNull(str(at(user, 'login')), TEXT_CAPS.name),
    provider_user_id: id(at(user, 'id')),
    name: capOrNull(str(at(contact, 'name')) ?? str(at(user, 'name')), TEXT_CAPS.name),
    email: capOrNull(str(at(contact, 'email')) ?? str(at(user, 'email')), TEXT_CAPS.name),
    avatar_url: capOrNull(str(at(user, 'avatar_url')), TEXT_CAPS.url),
  };
}

function repoRef(v: unknown): RepoRef {
  return {
    provider_repo_id: need(id(at(v, 'id'))),
    full_name: cap(need(str(at(v, 'full_name'))), TEXT_CAPS.name),
  };
}

function providerRepo(v: unknown): ProviderRepo {
  return {
    ...repoRef(v),
    html_url: cap(str(at(v, 'html_url')), TEXT_CAPS.url),
    default_branch: cap(str(at(v, 'default_branch')), TEXT_CAPS.ref),
    is_private: at(v, 'private') === true,
    is_archived: at(v, 'archived') === true,
  };
}

function pullRequest(v: unknown): NormalizedPullRequest {
  const merged = at(v, 'merged') === true || iso(at(v, 'merged_at')) !== null;
  const draft = at(v, 'draft') === true;
  const state = merged ? 'merged' : at(v, 'state') !== 'open' ? 'closed' : draft ? 'draft' : 'open';
  return {
    number: need(num(at(v, 'number'))),
    title: cap(str(at(v, 'title')), TEXT_CAPS.title),
    body: cap(str(at(v, 'body')), TEXT_CAPS.body),
    state,
    draft,
    author: actor(at(v, 'user')),
    head: {
      repo_full_name: capOrNull(str(at(v, 'head', 'repo', 'full_name')), TEXT_CAPS.name),
      ref: cap(need(str(at(v, 'head', 'ref'))), TEXT_CAPS.ref),
      sha: cap(need(str(at(v, 'head', 'sha'))), TEXT_CAPS.ref),
    },
    base: { ref: cap(need(str(at(v, 'base', 'ref'))), TEXT_CAPS.ref) },
    // GitHub fills merge_commit_sha with a test merge while the pull request is open.
    merge_commit_sha: merged ? capOrNull(str(at(v, 'merge_commit_sha')), TEXT_CAPS.ref) : null,
    merged_by: merged && obj(at(v, 'merged_by')) ? actor(at(v, 'merged_by')) : null,
    html_url: cap(str(at(v, 'html_url')), TEXT_CAPS.url),
    requested_reviewers: list(at(v, 'requested_reviewers')).map(user => actor(user)),
    additions: num(at(v, 'additions')),
    deletions: num(at(v, 'deletions')),
    changed_files: num(at(v, 'changed_files')),
    commits_count: num(at(v, 'commits')),
    provider_updated_at: need(iso(at(v, 'updated_at'))),
    opened_at: need(iso(at(v, 'created_at'))),
    merged_at: iso(at(v, 'merged_at')),
    closed_at: iso(at(v, 'closed_at')),
  };
}

function pushCommit(v: unknown): NormalizedCommit {
  return {
    sha: cap(need(str(at(v, 'id'))), TEXT_CAPS.ref),
    message: cap(str(at(v, 'message')), TEXT_CAPS.message),
    author_name: cap(str(at(v, 'author', 'name')), TEXT_CAPS.name),
    author_email: cap(str(at(v, 'author', 'email')), TEXT_CAPS.name),
    author_login: capOrNull(str(at(v, 'author', 'username')), TEXT_CAPS.name),
    author_provider_id: null,
    committed_at: need(iso(at(v, 'timestamp'))),
    url: cap(str(at(v, 'url')), TEXT_CAPS.url),
    distinct: at(v, 'distinct') !== false,
  };
}

function apiCommit(v: unknown): NormalizedCommit {
  return {
    sha: cap(need(str(at(v, 'sha'))), TEXT_CAPS.ref),
    message: cap(str(at(v, 'commit', 'message')), TEXT_CAPS.message),
    author_name: cap(str(at(v, 'commit', 'author', 'name')), TEXT_CAPS.name),
    author_email: cap(str(at(v, 'commit', 'author', 'email')), TEXT_CAPS.name),
    author_login: capOrNull(str(at(v, 'author', 'login')), TEXT_CAPS.name),
    author_provider_id: id(at(v, 'author', 'id')),
    committed_at: need(iso(at(v, 'commit', 'committer', 'date')) ?? iso(at(v, 'commit', 'author', 'date'))),
    url: cap(str(at(v, 'html_url')), TEXT_CAPS.url),
    distinct: true,
  };
}

function branchEvent(type: 'branch.created' | 'branch.deleted', p: unknown): NormalizedEvent[] {
  if (at(p, 'ref_type') !== 'branch') return [];
  return [
    {
      type,
      repo: repoRef(at(p, 'repository')),
      ref: cap(need(str(at(p, 'ref'))), TEXT_CAPS.ref),
      head_sha: null,
      actor: actor(at(p, 'sender')),
    },
  ];
}

function pushEvent(p: unknown): NormalizedEvent[] {
  const ref = need(str(at(p, 'ref')));
  if (!ref.startsWith(BRANCH_PREFIX)) return [];
  const commits = list(at(p, 'commits')).map(pushCommit);
  const ordered = [...commits.filter(c => c.distinct), ...commits.filter(c => !c.distinct)];
  return [
    {
      type: 'push',
      repo: repoRef(at(p, 'repository')),
      ref: cap(ref.slice(BRANCH_PREFIX.length), TEXT_CAPS.ref),
      before: cap(need(str(at(p, 'before'))), TEXT_CAPS.ref),
      after: cap(need(str(at(p, 'after'))), TEXT_CAPS.ref),
      forced: at(p, 'forced') === true,
      created: at(p, 'created') === true,
      deleted: at(p, 'deleted') === true,
      commits: ordered.slice(0, PUSH_COMMITS_MAX),
      commits_truncated: commits.length > PUSH_COMMITS_MAX,
      pusher: actor(at(p, 'sender'), at(p, 'pusher')),
    },
  ];
}

const PULL_REQUEST_ACTIONS = new Map<string, PullRequestAction>([
  ['opened', 'opened'],
  ['ready_for_review', 'ready_for_review'],
  ['converted_to_draft', 'converted_to_draft'],
  ['synchronize', 'synchronized'],
  ['reopened', 'reopened'],
  ['closed', 'closed'],
  // Requested reviewers live on the pull request, so a change to them refreshes it.
  ['review_requested', 'edited'],
  ['review_request_removed', 'edited'],
]);

function pullRequestEvent(p: unknown): NormalizedEvent[] {
  const action = str(at(p, 'action')) ?? '';
  const actions: PullRequestAction[] = [];
  if (action === 'edited') {
    if (at(p, 'changes', 'title') || at(p, 'changes', 'body')) actions.push('edited');
    if (at(p, 'changes', 'base')) actions.push('retargeted');
  } else {
    const mapped = PULL_REQUEST_ACTIONS.get(action);
    if (mapped) actions.push(mapped);
  }
  if (actions.length === 0) return [];
  const repo = repoRef(at(p, 'repository'));
  const pr = pullRequest(at(p, 'pull_request'));
  const by = actor(at(p, 'sender'));
  return actions.map(a => ({ type: `pull_request.${a}` as const, repo, pull_request: pr, actor: by }));
}

const REVIEW_STATES: ReadonlySet<string> = new Set<ReviewState>([
  'approved',
  'changes_requested',
  'commented',
  'dismissed',
]);

function reviewEvent(p: unknown): NormalizedEvent[] {
  const action = at(p, 'action');
  if (action !== 'submitted' && action !== 'dismissed') return [];
  const state = action === 'dismissed' ? 'dismissed' : (str(at(p, 'review', 'state'))?.toLowerCase() ?? '');
  if (!REVIEW_STATES.has(state)) return [];
  return [
    {
      type: 'pull_request.review',
      repo: repoRef(at(p, 'repository')),
      number: need(num(at(p, 'pull_request', 'number'))),
      reviewer: actor(at(p, 'review', 'user')),
      state: state as ReviewState,
      submitted_at: need(iso(at(p, 'review', 'submitted_at')) ?? iso(at(p, 'pull_request', 'updated_at'))),
    },
  ];
}

const CHECK_CONCLUSIONS: ReadonlySet<string> = new Set<CheckConclusion>([
  'success',
  'failure',
  'neutral',
  'cancelled',
  'skipped',
  'timed_out',
  'action_required',
  'stale',
]);

function checkStatus(v: unknown): CheckStatus {
  return v === 'completed' ? 'completed' : v === 'in_progress' ? 'in_progress' : 'queued';
}

function checkRunEvent(p: unknown): NormalizedEvent[] {
  const run = at(p, 'check_run');
  const conclusion = str(at(run, 'conclusion'));
  return [
    {
      type: 'check.updated',
      repo: repoRef(at(p, 'repository')),
      sha: cap(need(str(at(run, 'head_sha'))), TEXT_CAPS.ref),
      check: {
        external_id: need(id(at(run, 'id'))),
        name: cap(str(at(run, 'name')), TEXT_CAPS.name),
        status: checkStatus(at(run, 'status')),
        conclusion: conclusion && CHECK_CONCLUSIONS.has(conclusion) ? (conclusion as CheckConclusion) : null,
        details_url: capOrNull(str(at(run, 'details_url')) ?? str(at(run, 'html_url')), TEXT_CAPS.url),
        started_at: iso(at(run, 'started_at')),
        completed_at: iso(at(run, 'completed_at')),
      },
    },
  ];
}

const STATUS_CONCLUSIONS = new Map<string, CheckConclusion | null>([
  ['success', 'success'],
  ['failure', 'failure'],
  ['error', 'failure'],
  ['pending', null],
]);

function statusEvent(p: unknown): NormalizedEvent[] {
  const state = str(at(p, 'state')) ?? '';
  if (!STATUS_CONCLUSIONS.has(state)) return [];
  const context = need(str(at(p, 'context')));
  const pending = state === 'pending';
  return [
    {
      type: 'check.updated',
      repo: repoRef(at(p, 'repository')),
      sha: cap(need(str(at(p, 'sha'))), TEXT_CAPS.ref),
      check: {
        external_id: cap(`status:${context}`, TEXT_CAPS.name),
        name: cap(context, TEXT_CAPS.name),
        status: pending ? 'in_progress' : 'completed',
        conclusion: STATUS_CONCLUSIONS.get(state) ?? null,
        details_url: capOrNull(str(at(p, 'target_url')), TEXT_CAPS.url),
        started_at: iso(at(p, 'created_at')),
        completed_at: pending ? null : iso(at(p, 'updated_at')),
      },
    },
  ];
}

const REPOSITORY_ACTIONS = new Map<string, RepositoryEventType>([
  ['renamed', 'repository.renamed'],
  ['transferred', 'repository.transferred'],
  ['archived', 'repository.archived'],
  ['unarchived', 'repository.unarchived'],
  ['deleted', 'repository.deleted'],
]);

function previousFullName(action: string, p: unknown): string | null {
  const repository = at(p, 'repository');
  if (action === 'renamed') {
    const owner = str(at(repository, 'owner', 'login'));
    const from = str(at(p, 'changes', 'repository', 'name', 'from'));
    return owner && from ? cap(`${owner}/${from}`, TEXT_CAPS.name) : null;
  }
  if (action === 'transferred') {
    const from = at(p, 'changes', 'owner', 'from');
    const owner = str(at(from, 'user', 'login')) ?? str(at(from, 'organization', 'login'));
    const name = str(at(repository, 'name'));
    return owner && name ? cap(`${owner}/${name}`, TEXT_CAPS.name) : null;
  }
  return null;
}

function repositoryEvent(p: unknown): NormalizedEvent[] {
  const action = str(at(p, 'action')) ?? '';
  const type = REPOSITORY_ACTIONS.get(action);
  if (!type) return [];
  return [{ type, repo: providerRepo(at(p, 'repository')), previous_full_name: previousFullName(action, p) }];
}

// These payloads carry no default branch or URL; the service refetches each repository.
function installationRepositoriesEvent(p: unknown): NormalizedEvent[] {
  const action = at(p, 'action');
  const [type, key] =
    action === 'added'
      ? (['repository.added_to_installation', 'repositories_added'] as const)
      : action === 'removed'
        ? (['repository.removed_from_installation', 'repositories_removed'] as const)
        : [null, null];
  if (!type) return [];
  return list(at(p, key)).map(repo => ({ type, repo: providerRepo(repo), previous_full_name: null }));
}

const INSTALLATION_ACTIONS = new Map<
  string,
  'connection.suspended' | 'connection.unsuspended' | 'connection.uninstalled'
>([
  ['suspend', 'connection.suspended'],
  ['unsuspend', 'connection.unsuspended'],
  ['deleted', 'connection.uninstalled'],
]);

function installationEvent(p: unknown): NormalizedEvent[] {
  const type = INSTALLATION_ACTIONS.get(str(at(p, 'action')) ?? '');
  return type ? [{ type }] : [];
}

function normalizeEvent(eventName: string, p: unknown): NormalizedEvent[] {
  switch (eventName) {
    case 'create':
      return branchEvent('branch.created', p);
    case 'delete':
      return branchEvent('branch.deleted', p);
    case 'push':
      return pushEvent(p);
    case 'pull_request':
      return pullRequestEvent(p);
    case 'pull_request_review':
      return reviewEvent(p);
    case 'check_run':
      return checkRunEvent(p);
    case 'status':
      return statusEvent(p);
    case 'repository':
      return repositoryEvent(p);
    case 'installation_repositories':
      return installationRepositoriesEvent(p);
    case 'installation':
      return installationEvent(p);
    default:
      // check_suite included: its runs arrive as check_run, and counting both would double.
      return [];
  }
}

const INSTALLATION_EVENTS = new Set(['installation', 'installation_repositories']);

function withoutFileLists(commit: unknown): unknown {
  const c = obj(commit);
  if (!c) return commit;
  const rest = { ...c };
  delete rest.added;
  delete rest.removed;
  delete rest.modified;
  return rest;
}

/** GitHub writes `2026-11-20 10:00:00 UTC`. */
function tokenExpiry(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*(UTC|Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim());
  const zone = match?.[3] && match[3] !== 'UTC' ? match[3] : 'Z';
  const time = match ? Date.parse(`${match[1]}T${match[2]}${zone}`) : Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

function account(v: unknown) {
  return {
    login: cap(need(str(at(v, 'login'))), TEXT_CAPS.name),
    avatar_url: capOrNull(str(at(v, 'avatar_url')), TEXT_CAPS.url),
    url: cap(str(at(v, 'html_url')), TEXT_CAPS.url),
  };
}

const isOpen = (pr: NormalizedPullRequest) => pr.state === 'open' || pr.state === 'draft';

async function orNullWhenGone<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof GitProviderError && error.reason === 'not_found') return null;
    throw error;
  }
}

export function githubProvider(deps: ProviderDeps & { app: GitHubAppConfig | null }): GitProvider {
  const { app } = deps;
  const installationTokens = new Map<string, { token: string; refreshAt: number }>();
  const mintingTokens = new Map<string, Promise<string>>();

  // GitHub's App protocol: a signed assertion trades for an installation token. Not our authentication.
  function appAssertion(config: GitHubAppConfig): string {
    const now = Math.floor(deps.now().getTime() / 1000);
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: config.appId })}`;
    return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(config.privateKey, 'base64url')}`;
  }

  async function mintInstallationToken(config: GitHubAppConfig, baseUrl: string, installationId: string) {
    const res = await gitRequest<unknown>(
      deps.fetch,
      `${apiBase(baseUrl)}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      { method: 'POST', headers: { ...API_HEADERS, authorization: `Bearer ${appAssertion(config)}` } },
    );
    const token = str(at(res.data, 'token'));
    if (!token) throw new GitProviderError('token_invalid');
    const expiresAt = Date.parse(str(at(res.data, 'expires_at')) ?? '');
    if (!Number.isNaN(expiresAt)) {
      installationTokens.set(installationId, { token, refreshAt: expiresAt - TOKEN_REFRESH_MARGIN_MS });
    }
    return token;
  }

  async function installationToken(auth: ConnectionAuth): Promise<string> {
    const installationId = auth.installation_id;
    if (!app || !installationId) throw new GitProviderError('token_invalid');
    const cached = installationTokens.get(installationId);
    if (cached && cached.refreshAt > deps.now().getTime()) return cached.token;
    let minting = mintingTokens.get(installationId);
    if (!minting) {
      minting = mintInstallationToken(app, auth.base_url, installationId).finally(() =>
        mintingTokens.delete(installationId),
      );
      mintingTokens.set(installationId, minting);
    }
    return minting;
  }

  async function authorization(auth: ConnectionAuth): Promise<string> {
    if (auth.auth_kind === 'app_installation') return `Bearer ${await installationToken(auth)}`;
    if (!auth.token) throw new GitProviderError('token_invalid');
    return `Bearer ${auth.token}`;
  }

  async function withAuth<T>(auth: ConnectionAuth, run: (headers: Record<string, string>) => Promise<T>): Promise<T> {
    const headers = { ...API_HEADERS, authorization: await authorization(auth) };
    try {
      return await run(headers);
    } catch (error) {
      if (error instanceof GitProviderError && error.reason === 'token_invalid' && auth.installation_id) {
        installationTokens.delete(auth.installation_id);
      }
      throw error;
    }
  }

  function get<T>(auth: ConnectionAuth, path: string, query: GitRequest['query'] = {}): Promise<GitResponse<T>> {
    return withAuth(auth, headers => gitRequest<T>(deps.fetch, `${apiBase(auth.base_url)}${path}`, { headers, query }));
  }

  function pages(
    auth: ConnectionAuth,
    path: string,
    query: GitRequest['query'],
    pick: (page: unknown) => unknown[],
    limit: number,
  ): Promise<unknown[]> {
    return withAuth(auth, async headers => {
      const url = `${apiBase(auth.base_url)}${path}`;
      const { items } = await gitPages<unknown, unknown>(deps.fetch, url, { headers, query: query ?? {} }, pick, limit);
      return items;
    });
  }

  async function getPullRequest(auth: ConnectionAuth, repo: RepoRef, number: number) {
    const res = await orNullWhenGone(get<unknown>(auth, `${repoPath(repo)}/pulls/${number}`));
    return res ? parseOne(() => pullRequest(res.data)) : null;
  }

  async function confirmInstallation(config: GitHubAppConfig, code: string, installationId: string): Promise<void> {
    const base = trimSlash(config.baseUrl);
    const exchange = await gitRequest<unknown>(deps.fetch, `${base}/login/oauth/access_token`, {
      method: 'POST',
      headers: { accept: 'application/json', 'user-agent': API_HEADERS['user-agent'] },
      body: { client_id: config.clientId, client_secret: config.clientSecret, code },
    });
    const userToken = str(at(exchange.data, 'access_token'));
    if (!userToken) throw new GitProviderError('forbidden');
    const headers = { ...API_HEADERS, authorization: `Bearer ${userToken}` };
    let next: string | null = `${apiBase(base)}/user/installations?per_page=100`;
    let account: unknown = null;
    while (next && !account) {
      const res: GitResponse<unknown> = await gitRequest<unknown>(deps.fetch, next, { headers });
      account =
        at(
          list(at(res.data, 'installations')).find(i => id(at(i, 'id')) === installationId),
          'account',
        ) ?? null;
      next = nextLink(res.headers, next);
    }
    if (!account) throw new GitProviderError('forbidden');
    // The list includes installations the person can merely read; connecting one needs its administrator.
    const login = str(at(account, 'login'));
    if (at(account, 'type') === 'User') {
      const me = await gitRequest<unknown>(deps.fetch, `${apiBase(base)}/user`, { headers });
      if (id(at(me.data, 'id')) !== id(at(account, 'id'))) throw new GitProviderError('forbidden');
      return;
    }
    if (!login) throw new GitProviderError('forbidden');
    const membership = await gitRequest<unknown>(
      deps.fetch,
      `${apiBase(base)}/user/memberships/orgs/${encodeURIComponent(login)}`,
      { headers },
    ).catch(() => null);
    if (at(membership?.data, 'state') !== 'active' || at(membership?.data, 'role') !== 'admin') {
      throw new GitProviderError('forbidden');
    }
  }

  const appInstall: GitAppInstall = app
    ? {
        configured: true,
        baseUrl: trimSlash(app.baseUrl),
        webhookSecret: app.webhookSecret,
        installUrl: state =>
          `${trimSlash(app.baseUrl)}/apps/${encodeURIComponent(app.slug)}/installations/new?state=${encodeURIComponent(state)}`,
        confirmInstallation: (code, installationId) => confirmInstallation(app, code, installationId),
      }
    : {
        configured: false,
        baseUrl: GITHUB_COM,
        webhookSecret: null,
        installUrl: () => {
          throw new GitProviderError('invalid');
        },
        confirmInstallation: () => Promise.reject(new GitProviderError('invalid')),
      };

  return {
    kind: 'github',
    defaultBaseUrl: GITHUB_COM,
    supports: { checks: true, reviews: true, compare: true, webhook_registration: false },
    app: appInstall,

    verifyWebhook(headers, rawBody, secret) {
      const signature = header(headers, 'x-hub-signature-256');
      const eventName = header(headers, 'x-github-event');
      const deliveryId = header(headers, 'x-github-delivery');
      if (!signature || !eventName || !deliveryId || !secret) return null;
      const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
      const given = Buffer.from(signature);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      return { delivery_id: deliveryId, event_name: eventName };
    },

    route(eventName, payload) {
      return {
        installation_id: id(at(payload, 'installation', 'id')),
        provider_repo_id: INSTALLATION_EVENTS.has(eventName) ? null : id(at(payload, 'repository', 'id')),
      };
    },

    normalize(eventName, payload) {
      try {
        return normalizeEvent(eventName, payload);
      } catch {
        return [];
      }
    },

    repositoryFromPayload(_eventName, payload) {
      return parsed(() => providerRepo(at(payload, 'repository')))[0] ?? null;
    },

    trim(eventName, payload) {
      const p = obj(payload);
      if (eventName !== 'push' || !p) return payload;
      return {
        ...p,
        commits: list(p.commits).slice(0, PUSH_COMMITS_MAX).map(withoutFileLists),
        head_commit: withoutFileLists(p.head_commit),
      };
    },

    async describeConnection(auth) {
      if (auth.auth_kind === 'app_installation') {
        if (!app || !auth.installation_id) throw new GitProviderError('token_invalid');
        const res = await gitRequest<unknown>(
          deps.fetch,
          `${apiBase(auth.base_url)}/app/installations/${encodeURIComponent(auth.installation_id)}`,
          { headers: { ...API_HEADERS, authorization: `Bearer ${appAssertion(app)}` } },
        );
        return { account: parseOne(() => account(at(res.data, 'account'))), token_expires_at: null };
      }
      const res = await get<unknown>(auth, '/user');
      return {
        account: parseOne(() => account(res.data)),
        token_expires_at: tokenExpiry(res.headers.get('github-authentication-token-expiration')),
      };
    },

    async listRepositories(auth) {
      const items =
        auth.auth_kind === 'app_installation'
          ? await pages(
              auth,
              '/installation/repositories',
              { per_page: 100 },
              page => list(at(page, 'repositories')),
              REPOSITORIES_MAX,
            )
          : await pages(
              auth,
              '/user/repos',
              { per_page: 100, affiliation: 'owner,collaborator,organization_member' },
              list,
              REPOSITORIES_MAX,
            );
      return items.flatMap(item => parsed(() => providerRepo(item)));
    },

    async getRepository(auth, repo) {
      const res = await orNullWhenGone(get<unknown>(auth, repoPath(repo)));
      return res ? parseOne(() => providerRepo(res.data)) : null;
    },

    getPullRequest,

    listPullRequests(auth, repo, since, limit) {
      return withAuth(auth, async headers => {
        const found: NormalizedPullRequest[] = [];
        let next: string | null =
          `${apiBase(auth.base_url)}${repoPath(repo)}/pulls?state=all&sort=updated&direction=desc&per_page=100`;
        while (next && found.length < limit) {
          const res: GitResponse<unknown> = await gitRequest<unknown>(deps.fetch, next, { headers });
          let reachedOld = false;
          for (const pr of list(res.data).flatMap(item => parsed(() => pullRequest(item)))) {
            if (Date.parse(pr.provider_updated_at) < since.getTime() && !isOpen(pr)) reachedOld = true;
            else found.push(pr);
          }
          next = reachedOld ? null : nextLink(res.headers, next);
        }
        return found.slice(0, limit);
      });
    },

    async listPullRequestCommits(auth, repo, number) {
      const items = await pages(
        auth,
        `${repoPath(repo)}/pulls/${number}/commits`,
        { per_page: 100 },
        list,
        PULL_REQUEST_COMMITS_MAX,
      );
      const commits = items.flatMap(item => parsed(() => apiCommit(item)));
      if (items.length < PULL_REQUEST_COMMITS_MAX) return { commits, total: items.length };
      const pr = await getPullRequest(auth, repo, number);
      return { commits, total: pr?.commits_count ?? items.length };
    },

    async listBranches(auth, repo, limit) {
      const items = await pages(
        auth,
        `${repoPath(repo)}/branches`,
        { per_page: 100 },
        list,
        Math.min(limit, BRANCHES_MAX),
      );
      return items.flatMap(item =>
        parsed(() => ({
          name: cap(need(str(at(item, 'name'))), TEXT_CAPS.ref),
          head_sha: cap(need(str(at(item, 'commit', 'sha'))), TEXT_CAPS.ref),
        })),
      );
    },

    async compare(auth, repo, base, head) {
      const res = await get<unknown>(auth, `${repoPath(repo)}/compare/${refSegment(base)}...${refSegment(head)}`);
      return list(at(res.data, 'commits')).flatMap(c => str(at(c, 'sha')) ?? []);
    },

    registerWebhook: () => Promise.reject(new GitProviderError('invalid')),
    updateWebhook: () => Promise.reject(new GitProviderError('invalid')),
    removeWebhook: () => Promise.reject(new GitProviderError('invalid')),
    webhookExists: () => Promise.resolve(true),

    redeliveryUrl(connection, repo) {
      if (connection.auth_kind === 'app_installation') {
        return app ? `${trimSlash(app.baseUrl)}/settings/apps/${encodeURIComponent(app.slug)}/advanced` : null;
      }
      return repo ? `${trimSlash(connection.base_url)}/${repo.full_name}/settings/hooks` : null;
    },
  };
}
