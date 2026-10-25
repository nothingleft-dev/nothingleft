import { describe, expect, test } from 'bun:test';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { TEXT_CAPS, type NormalizedEvent } from '@git/events';
import { GitProviderError } from '@git/http';
import type { ConnectionAuth } from '@git/provider';
import { githubProvider, type GitHubAppConfig } from '@git/providers/github';
import { fakeFetch, type FakeCall } from './git-fake-fetch.ts';
import { gitFixture, signedDelivery } from './git-fixtures.ts';

const SECRET = 'whsec-test';
const API = 'https://api.github.com';
const REPO = { provider_repo_id: '101', full_name: 'acme-inc/web' };
const NOW = new Date('2026-10-20T12:00:00Z');

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const APP: GitHubAppConfig = {
  appId: '300',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  webhookSecret: 'app-secret',
  slug: 'nothingleft-acme',
  clientId: 'Iv1.client',
  clientSecret: 'client-secret',
  baseUrl: 'https://github.com',
};

const MANUAL: ConnectionAuth = {
  base_url: 'https://github.com',
  auth_kind: 'manual',
  installation_id: null,
  token: 'ghp_manual',
};
const INSTALLED: ConnectionAuth = {
  base_url: 'https://github.com',
  auth_kind: 'app_installation',
  installation_id: '5001',
  token: null,
};

function provider(
  routes: Parameters<typeof fakeFetch>[0] = {},
  clock = { now: NOW },
  app: GitHubAppConfig | null = APP,
) {
  const fake = fakeFetch(routes);
  return { ...fake, github: githubProvider({ fetch: fake.fetch, now: () => clock.now, app }) };
}

const github = provider().github;

function normalized(name: string): NormalizedEvent[] {
  const fixture = gitFixture('github', name);
  return github.normalize(fixture.headers['x-github-event']!, fixture.body);
}

function only<T extends NormalizedEvent['type']>(events: NormalizedEvent[], type: T) {
  expect(events).toHaveLength(1);
  expect(events[0]!.type).toBe(type);
  return events[0] as NormalizedEvent & { type: T };
}

async function failure(promise: Promise<unknown>): Promise<GitProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(GitProviderError);
    return error as GitProviderError;
  }
  throw new Error('expected a GitProviderError');
}

function prJson(number: number, updatedAt: string, state = 'open') {
  return {
    number,
    state,
    title: `API-${number}: change`,
    body: null,
    draft: false,
    user: { login: 'alex-lee', id: 9001, avatar_url: null },
    head: { ref: `feat/api-${number}`, sha: 'a'.repeat(40), repo: { full_name: 'acme-inc/web' } },
    base: { ref: 'main' },
    merged_at: null,
    merge_commit_sha: null,
    html_url: `https://github.com/acme-inc/web/pull/${number}`,
    requested_reviewers: [],
    created_at: '2026-10-01T09:00:00Z',
    updated_at: updatedAt,
    closed_at: state === 'closed' ? updatedAt : null,
  };
}

describe('verifyWebhook', () => {
  const fixture = gitFixture('github', 'push.feature');

  test('accepts a delivery signed with the secret', () => {
    const { headers, payload } = signedDelivery('github', fixture, SECRET);
    expect(github.verifyWebhook(headers, Buffer.from(payload), SECRET)).toEqual({
      delivery_id: fixture.headers['x-github-delivery']!,
      event_name: 'push',
    });
  });

  test('rejects a signature made with another secret', () => {
    const { headers, payload } = signedDelivery('github', fixture, 'other-secret');
    expect(github.verifyWebhook(headers, Buffer.from(payload), SECRET)).toBeNull();
  });

  test('rejects a delivery missing a required header', () => {
    const { headers, payload } = signedDelivery('github', fixture, SECRET);
    for (const name of ['x-hub-signature-256', 'x-github-event', 'x-github-delivery']) {
      const without = { ...headers, [name]: undefined };
      expect(github.verifyWebhook(without, Buffer.from(payload), SECRET)).toBeNull();
    }
  });

  test('rejects a tampered body and a truncated signature', () => {
    const { headers, payload } = signedDelivery('github', fixture, SECRET);
    expect(github.verifyWebhook(headers, Buffer.from(payload.replace('API-7', 'API-9')), SECRET)).toBeNull();
    const short = { ...headers, 'x-hub-signature-256': headers['x-hub-signature-256']!.slice(0, 20) };
    expect(github.verifyWebhook(short, Buffer.from(payload), SECRET)).toBeNull();
  });
});

describe('route', () => {
  test('reads the installation and repository ids as strings', () => {
    const push = gitFixture('github', 'push.feature');
    expect(github.route('push', push.body)).toEqual({ installation_id: '5001', provider_repo_id: '101' });
  });

  test('installation events have no repository', () => {
    const added = gitFixture('github', 'installation_repositories.added');
    expect(github.route('installation_repositories', added.body)).toEqual({
      installation_id: '5001',
      provider_repo_id: null,
    });
    const deleted = gitFixture('github', 'installation.deleted');
    expect(github.route('installation', deleted.body)).toEqual({ installation_id: '5001', provider_repo_id: null });
  });

  test('a malformed payload routes nowhere instead of throwing', () => {
    expect(github.route('push', null)).toEqual({ installation_id: null, provider_repo_id: null });
  });
});

describe('normalize', () => {
  test('branch created and deleted; tags ignored', () => {
    const created = only(normalized('create.branch'), 'branch.created');
    expect(created.ref).toBe('feat/api-7-login');
    expect(created.repo).toEqual(REPO);
    expect(created.head_sha).toBeNull();
    expect(created.actor.login).toBe('alex-lee');
    const deleted = only(normalized('delete.branch'), 'branch.deleted');
    expect(deleted.actor).toMatchObject({ login: 'casey-kim', provider_user_id: '9002' });
    const tag = gitFixture('github', 'create.branch');
    expect(github.normalize('create', { ...tag.body, ref_type: 'tag', ref: 'v1.2.0' })).toEqual([]);
  });

  test('push to a branch: distinct commits first, pusher from pusher and sender', () => {
    const push = only(normalized('push.feature'), 'push');
    expect(push.ref).toBe('feat/api-7-login');
    expect(push).toMatchObject({ forced: false, created: false, deleted: false, commits_truncated: false });
    expect(push.commits.map(c => c.distinct)).toEqual([true, true, false]);
    expect(push.commits[0]).toMatchObject({
      sha: '02'.repeat(20),
      author_name: 'Alex Lee',
      author_email: 'alex@acme.example',
      author_login: 'alex-lee',
      author_provider_id: null,
      committed_at: '2026-10-20T10:10:00.000Z',
    });
    expect(push.commits[0]!.message).toContain('API-7');
    expect(push.pusher).toEqual({
      login: 'alex-lee',
      provider_user_id: '9001',
      name: 'alex-lee',
      email: 'alex@acme.example',
      avatar_url: 'https://avatars.githubusercontent.com/u/9001?v=4',
    });
  });

  test('a forced push is marked forced', () => {
    const push = only(normalized('push.forced'), 'push');
    expect(push.forced).toBe(true);
    expect(push.before).toBe('03'.repeat(20));
    expect(push.commits).toHaveLength(1);
  });

  test('a tag push normalizes to nothing', () => {
    expect(normalized('push.tag')).toEqual([]);
  });

  test('a push of more than 100 commits keeps 100, distinct first, and says it was truncated', () => {
    const fixture = gitFixture('github', 'push.feature');
    const template = (fixture.body.commits as Record<string, unknown>[])[1]!;
    const commits = Array.from({ length: 120 }, (_, i) => ({
      ...template,
      id: i.toString(16).padStart(40, '0'),
      distinct: i % 2 === 1,
    }));
    const push = only(github.normalize('push', { ...fixture.body, commits }), 'push');
    expect(push.commits).toHaveLength(100);
    expect(push.commits_truncated).toBe(true);
    expect(push.commits.slice(0, 60).every(c => c.distinct)).toBe(true);
    expect(push.commits.slice(60).every(c => !c.distinct)).toBe(true);
    expect(push.commits[0]!.sha).toBe('1'.padStart(40, '0'));
  });

  test('pull request opened', () => {
    const event = only(normalized('pull_request.opened'), 'pull_request.opened');
    expect(event.repo).toEqual(REPO);
    expect(event.actor.login).toBe('alex-lee');
    expect(event.pull_request).toMatchObject({
      number: 42,
      title: 'API-7: Fix login redirect',
      state: 'open',
      draft: false,
      head: { repo_full_name: 'acme-inc/web', ref: 'feat/api-7-login', sha: '03'.repeat(20) },
      base: { ref: 'main' },
      merge_commit_sha: null,
      merged_by: null,
      additions: 48,
      deletions: 6,
      changed_files: 3,
      commits_count: 2,
      opened_at: '2026-10-20T10:20:00.000Z',
      merged_at: null,
      closed_at: null,
    });
    expect(event.pull_request.body).toContain('Fixes API-7');
    expect(event.pull_request.author.login).toBe('alex-lee');
    expect(event.pull_request.requested_reviewers.map(r => r.login)).toEqual(['casey-kim']);
  });

  test('an over-long title and body are capped', () => {
    const fixture = gitFixture('github', 'pull_request.opened');
    const pr = fixture.body.pull_request as Record<string, unknown>;
    const body = { ...fixture.body, pull_request: { ...pr, title: 'x'.repeat(5_000), body: 'y'.repeat(70_000) } };
    const event = only(github.normalize('pull_request', body), 'pull_request.opened');
    expect(event.pull_request.title).toHaveLength(TEXT_CAPS.title);
    expect(event.pull_request.body).toHaveLength(TEXT_CAPS.body);
  });

  test('a draft pull request is in the draft state', () => {
    const fixture = gitFixture('github', 'pull_request.opened');
    const body = { ...fixture.body, pull_request: { ...(fixture.body.pull_request as object), draft: true } };
    expect(only(github.normalize('pull_request', body), 'pull_request.opened').pull_request.state).toBe('draft');
  });

  test('edited title or body, and a base change as retargeted', () => {
    expect(only(normalized('pull_request.edited'), 'pull_request.edited').pull_request.title).toContain('API-8');
    const retargeted = only(normalized('pull_request.edited.base'), 'pull_request.retargeted');
    expect(retargeted.pull_request.base.ref).toBe('release/2026-10');
    const fixture = gitFixture('github', 'pull_request.edited');
    expect(github.normalize('pull_request', { ...fixture.body, changes: {} })).toEqual([]);
  });

  test('synchronize, ready for review, review requests', () => {
    const synced = only(normalized('pull_request.synchronize'), 'pull_request.synchronized');
    expect(synced.pull_request.head.sha).toBe('04'.repeat(20));
    expect(synced.pull_request.commits_count).toBe(3);
    only(normalized('pull_request.ready_for_review'), 'pull_request.ready_for_review');
    const fixture = gitFixture('github', 'pull_request.opened');
    only(github.normalize('pull_request', { ...fixture.body, action: 'review_requested' }), 'pull_request.edited');
    only(
      github.normalize('pull_request', { ...fixture.body, action: 'review_request_removed' }),
      'pull_request.edited',
    );
    expect(github.normalize('pull_request', { ...fixture.body, action: 'labeled' })).toEqual([]);
    expect(github.normalize('pull_request', { ...fixture.body, action: 'assigned' })).toEqual([]);
  });

  test('closed merged and closed unmerged', () => {
    const merged = only(normalized('pull_request.closed.merged'), 'pull_request.closed');
    expect(merged.pull_request).toMatchObject({
      state: 'merged',
      merge_commit_sha: 'c1'.repeat(20),
      merged_at: '2026-10-21T09:00:00.000Z',
      closed_at: '2026-10-21T09:00:00.000Z',
    });
    expect(merged.pull_request.merged_by?.login).toBe('casey-kim');
    expect(merged.actor.login).toBe('casey-kim');
    const closed = only(normalized('pull_request.closed.unmerged'), 'pull_request.closed');
    expect(closed.pull_request).toMatchObject({ state: 'closed', merge_commit_sha: null, merged_by: null });
    expect(closed.pull_request.head.repo_full_name).toBeNull();
  });

  test('review submitted and dismissed', () => {
    const review = only(normalized('pull_request_review.approved'), 'pull_request.review');
    expect(review).toMatchObject({ number: 42, state: 'approved', submitted_at: '2026-10-20T13:00:00.000Z' });
    expect(review.reviewer.login).toBe('casey-kim');
    const fixture = gitFixture('github', 'pull_request_review.approved');
    const upper = { ...fixture.body, review: { ...(fixture.body.review as object), state: 'CHANGES_REQUESTED' } };
    expect(only(github.normalize('pull_request_review', upper), 'pull_request.review').state).toBe('changes_requested');
    const dismissed = { ...fixture.body, action: 'dismissed' };
    expect(only(github.normalize('pull_request_review', dismissed), 'pull_request.review').state).toBe('dismissed');
    expect(github.normalize('pull_request_review', { ...fixture.body, action: 'edited' })).toEqual([]);
  });

  test('check run', () => {
    const event = only(normalized('check_run.completed.failure'), 'check.updated');
    expect(event.sha).toBe('04'.repeat(20));
    expect(event.check).toEqual({
      external_id: '33000001',
      name: 'test',
      status: 'completed',
      conclusion: 'failure',
      details_url: 'https://github.com/acme-inc/web/actions/runs/7700001/job/33000001',
      started_at: '2026-10-20T12:01:00.000Z',
      completed_at: '2026-10-20T12:04:30.000Z',
    });
  });

  test('commit status', () => {
    const event = only(normalized('status.success'), 'check.updated');
    expect(event.sha).toBe('04'.repeat(20));
    expect(event.check).toMatchObject({
      external_id: 'status:ci/build',
      name: 'ci/build',
      status: 'completed',
      conclusion: 'success',
      details_url: 'https://ci.acme.example/builds/1200',
    });
    const fixture = gitFixture('github', 'status.success');
    const pending = only(github.normalize('status', { ...fixture.body, state: 'pending' }), 'check.updated');
    expect(pending.check).toMatchObject({ status: 'in_progress', conclusion: null, completed_at: null });
    const errored = only(github.normalize('status', { ...fixture.body, state: 'error' }), 'check.updated');
    expect(errored.check.conclusion).toBe('failure');
  });

  test('check suites are not counted alongside their runs', () => {
    expect(normalized('check_suite.completed')).toEqual([]);
  });

  test('repository renamed, transferred, archived', () => {
    const renamed = only(normalized('repository.renamed'), 'repository.renamed');
    expect(renamed.previous_full_name).toBe('acme-inc/website');
    expect(renamed.repo).toEqual({
      ...REPO,
      html_url: 'https://github.com/acme-inc/web',
      default_branch: 'main',
      is_private: true,
      is_archived: false,
    });
    const fixture = gitFixture('github', 'repository.renamed');
    const transferred = {
      ...fixture.body,
      action: 'transferred',
      changes: { owner: { from: { organization: { login: 'acme-labs' } } } },
    };
    expect(only(github.normalize('repository', transferred), 'repository.transferred').previous_full_name).toBe(
      'acme-labs/web',
    );
    const archived = only(
      github.normalize('repository', { ...fixture.body, action: 'archived' }),
      'repository.archived',
    );
    expect(archived.previous_full_name).toBeNull();
    expect(github.normalize('repository', { ...fixture.body, action: 'publicized' })).toEqual([]);
  });

  test('repositories added to and removed from the installation', () => {
    const added = normalized('installation_repositories.added');
    expect(added.map(e => e.type)).toEqual(['repository.added_to_installation', 'repository.added_to_installation']);
    expect(added[1]).toMatchObject({
      repo: { provider_repo_id: '102', full_name: 'acme-inc/api', default_branch: '', is_private: true },
      previous_full_name: null,
    });
    const removed = only(normalized('installation_repositories.removed'), 'repository.removed_from_installation');
    expect(removed.repo.provider_repo_id).toBe('102');
  });

  test('installation suspended, unsuspended, deleted; created ignored', () => {
    only(normalized('installation.suspend'), 'connection.suspended');
    only(normalized('installation.deleted'), 'connection.uninstalled');
    const fixture = gitFixture('github', 'installation.suspend');
    only(github.normalize('installation', { ...fixture.body, action: 'unsuspend' }), 'connection.unsuspended');
    expect(github.normalize('installation', { ...fixture.body, action: 'created' })).toEqual([]);
  });

  test('unknown events and malformed payloads normalize to nothing', () => {
    expect(github.normalize('star', { action: 'created' })).toEqual([]);
    expect(github.normalize('push', null)).toEqual([]);
    expect(github.normalize('push', { ref: 'refs/heads/main', repository: { id: 101 } })).toEqual([]);
    expect(github.normalize('pull_request', { action: 'opened', pull_request: 'nope' })).toEqual([]);
    expect(github.normalize('check_run', { check_run: [] })).toEqual([]);
  });
});

describe('trim', () => {
  test('a push keeps 100 commits without their file lists', () => {
    const fixture = gitFixture('github', 'push.feature');
    const template = (fixture.body.commits as Record<string, unknown>[])[1]!;
    const commits = Array.from({ length: 150 }, (_, i) => ({ ...template, id: String(i) }));
    const trimmed = github.trim('push', { ...fixture.body, commits }) as Record<string, unknown>;
    const kept = trimmed.commits as Record<string, unknown>[];
    expect(kept).toHaveLength(100);
    expect(kept[0]).not.toHaveProperty('added');
    expect(kept[0]).not.toHaveProperty('modified');
    expect(kept[0]).not.toHaveProperty('removed');
    expect(kept[0]!.message).toBe(template.message);
    expect(trimmed.head_commit).not.toHaveProperty('added');
    expect(trimmed.ref).toBe(fixture.body.ref);
  });

  test('anything else is returned as is', () => {
    const fixture = gitFixture('github', 'pull_request.opened');
    expect(github.trim('pull_request', fixture.body)).toBe(fixture.body);
  });
});

describe('app installation token', () => {
  const installation = {
    id: 5001,
    account: { login: 'acme-inc', avatar_url: null, html_url: 'https://github.com/acme-inc' },
  };

  function tokenRoutes(expiresAt: string) {
    let minted = 0;
    return {
      get minted() {
        return minted;
      },
      routes: {
        [`POST ${API}/app/installations/5001/access_tokens`]: () => ({
          status: 201,
          body: { token: `ghs_${++minted}`, expires_at: expiresAt },
        }),
        [`GET ${API}/repositories/101`]: { id: 101, full_name: 'acme-inc/web', default_branch: 'main' },
        [`GET ${API}/app/installations/5001`]: installation,
      },
    };
  }

  test('signs a verifiable RS256 assertion and uses the installation token', async () => {
    const tokens = tokenRoutes('2026-10-20T13:00:00Z');
    const { github: gh, calls } = provider(tokens.routes);
    await gh.getRepository(INSTALLED, REPO);
    const [mint, get] = calls;
    expect(mint!.method).toBe('POST');
    expect(mint!.headers['x-github-api-version']).toBe('2022-11-28');
    const assertion = mint!.headers.authorization!.replace(/^Bearer /, '');
    const [head, payload, signature] = assertion.split('.');
    expect(JSON.parse(Buffer.from(head!, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const now = NOW.getTime() / 1000;
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toEqual({
      iat: now - 60,
      exp: now + 540,
      iss: '300',
    });
    const verifier = createVerify('RSA-SHA256').update(`${head}.${payload}`);
    expect(verifier.verify(publicKey, signature!, 'base64url')).toBe(true);
    expect(get!.headers.authorization).toBe('Bearer ghs_1');
    expect(get!.headers.accept).toBe('application/vnd.github+json');
    expect(get!.headers['user-agent']).toBe('nothingleft');
  });

  test('caches the token until five minutes before it expires', async () => {
    const tokens = tokenRoutes('2026-10-20T13:00:00Z');
    const clock = { now: NOW };
    const { github: gh, calls } = provider(tokens.routes, clock);
    await gh.getRepository(INSTALLED, REPO);
    await gh.getRepository(INSTALLED, REPO);
    expect(tokens.minted).toBe(1);
    clock.now = new Date('2026-10-20T12:54:00Z');
    await gh.getRepository(INSTALLED, REPO);
    expect(tokens.minted).toBe(1);
    clock.now = new Date('2026-10-20T12:56:00Z');
    await gh.getRepository(INSTALLED, REPO);
    expect(tokens.minted).toBe(2);
    expect(calls.at(-1)!.headers.authorization).toBe('Bearer ghs_2');
  });

  test('concurrent calls share one token request', async () => {
    const tokens = tokenRoutes('2026-10-20T13:00:00Z');
    const { github: gh } = provider(tokens.routes);
    await Promise.all([gh.getRepository(INSTALLED, REPO), gh.getRepository(INSTALLED, REPO)]);
    expect(tokens.minted).toBe(1);
  });

  test('a rejected installation token is dropped from the cache', async () => {
    const tokens = tokenRoutes('2026-10-20T13:00:00Z');
    let rejected = false;
    const { github: gh } = provider({
      ...tokens.routes,
      [`GET ${API}/repositories/101`]: () => {
        if (rejected) return { status: 200, body: { id: 101, full_name: 'acme-inc/web' } };
        rejected = true;
        return { status: 401 };
      },
    });
    expect((await failure(gh.getRepository(INSTALLED, REPO))).reason).toBe('token_invalid');
    await gh.getRepository(INSTALLED, REPO);
    expect(tokens.minted).toBe(2);
  });

  test('describeConnection reads the installation account with the app assertion', async () => {
    const tokens = tokenRoutes('2026-10-20T13:00:00Z');
    const { github: gh, calls } = provider(tokens.routes);
    expect(await gh.describeConnection(INSTALLED)).toEqual({
      account: { login: 'acme-inc', avatar_url: null, url: 'https://github.com/acme-inc' },
      token_expires_at: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.authorization!.split('.')).toHaveLength(3);
    expect(tokens.minted).toBe(0);
  });

  test('without a configured app, an installation cannot authenticate', async () => {
    const { github: gh, calls } = provider({}, { now: NOW }, null);
    expect((await failure(gh.getRepository(INSTALLED, REPO))).reason).toBe('token_invalid');
    expect(calls).toHaveLength(0);
  });
});

describe('API with a personal token', () => {
  test('describeConnection reads the user and the token expiry header', async () => {
    const { github: gh, calls } = provider({
      [`GET ${API}/user`]: {
        status: 200,
        body: {
          login: 'alex-lee',
          id: 9001,
          avatar_url: 'https://avatars.example/a',
          html_url: 'https://github.com/alex-lee',
        },
        headers: { 'github-authentication-token-expiration': '2026-11-20 10:00:00 UTC' },
      },
    });
    expect(await gh.describeConnection(MANUAL)).toEqual({
      account: { login: 'alex-lee', avatar_url: 'https://avatars.example/a', url: 'https://github.com/alex-lee' },
      token_expires_at: new Date('2026-11-20T10:00:00Z'),
    });
    expect(calls[0]!.headers.authorization).toBe('Bearer ghp_manual');
  });

  test('a token without expiry has none', async () => {
    const { github: gh } = provider({
      [`GET ${API}/user`]: { login: 'alex-lee', html_url: 'https://github.com/alex-lee' },
    });
    expect((await gh.describeConnection(MANUAL)).token_expires_at).toBeNull();
  });

  test('a missing token and a rejected token are token_invalid', async () => {
    const { github: gh, calls } = provider({
      [`GET ${API}/user`]: { status: 401, body: { message: 'Bad credentials' } },
    });
    expect((await failure(gh.describeConnection({ ...MANUAL, token: null }))).reason).toBe('token_invalid');
    expect(calls).toHaveLength(0);
    expect((await failure(gh.describeConnection(MANUAL))).reason).toBe('token_invalid');
  });

  test('GitHub Enterprise Server is reached under /api/v3', async () => {
    const { github: gh, calls } = provider({
      'GET https://ghe.example.com/api/v3/user': { login: 'alex-lee', html_url: 'https://ghe.example.com/alex-lee' },
    });
    await gh.describeConnection({ ...MANUAL, base_url: 'https://ghe.example.com/' });
    expect(calls[0]!.url).toStartWith('https://ghe.example.com/api/v3/user');
  });

  test('listRepositories pages through Link headers', async () => {
    const repo = (n: number) => ({
      id: n,
      full_name: `acme-inc/repo-${n}`,
      html_url: `https://github.com/acme-inc/repo-${n}`,
      default_branch: 'main',
      private: n % 2 === 0,
      archived: false,
    });
    const { github: gh, calls } = provider({
      [`GET ${API}/user/repos`]: (call: FakeCall) =>
        call.url.includes('page=2')
          ? { status: 200, body: [repo(3)] }
          : {
              status: 200,
              body: [repo(1), repo(2), { id: 'broken' }],
              headers: {
                link: `<${API}/user/repos?per_page=100&page=2>; rel="next", <${API}/user/repos?page=2>; rel="last"`,
              },
            },
    });
    const { repos } = await gh.listRepositories(MANUAL);
    expect(repos.map(r => r.provider_repo_id)).toEqual(['1', '2', '3']);
    expect(repos[1]).toMatchObject({ is_private: true, default_branch: 'main' });
    const first = new URL(calls[0]!.url);
    expect(first.searchParams.get('per_page')).toBe('100');
    expect(first.searchParams.get('affiliation')).toBe('owner,collaborator,organization_member');
    expect(calls).toHaveLength(2);
  });

  test('listRepositories for an installation reads .repositories', async () => {
    const { github: gh, calls } = provider({
      [`POST ${API}/app/installations/5001/access_tokens`]: { token: 'ghs_x', expires_at: '2026-10-20T13:00:00Z' },
      [`GET ${API}/installation/repositories`]: {
        total_count: 1,
        repositories: [
          {
            id: 101,
            full_name: 'acme-inc/web',
            html_url: 'https://github.com/acme-inc/web',
            default_branch: 'main',
            private: true,
          },
        ],
      },
    });
    expect((await gh.listRepositories(INSTALLED)).repos.map(r => r.full_name)).toEqual(['acme-inc/web']);
    expect(calls[1]!.headers.authorization).toBe('Bearer ghs_x');
  });

  test('getRepository by id; 404 is null', async () => {
    const { github: gh, calls } = provider({
      [`GET ${API}/repositories/101`]: { id: 101, full_name: 'acme-inc/web', default_branch: 'trunk', archived: true },
      [`GET ${API}/repositories/999`]: { status: 404, body: { message: 'Not Found' } },
    });
    expect(await gh.getRepository(MANUAL, REPO)).toMatchObject({ default_branch: 'trunk', is_archived: true });
    expect(calls[0]!.url).toStartWith(`${API}/repositories/101`);
    expect(await gh.getRepository(MANUAL, { provider_repo_id: '999', full_name: 'acme-inc/gone' })).toBeNull();
  });

  test('getPullRequest; 404 is null', async () => {
    const { github: gh } = provider({
      [`GET ${API}/repositories/101/pulls/7`]: { ...prJson(7, '2026-10-20T10:00:00Z'), commits: 4, additions: 1 },
      [`GET ${API}/repositories/101/pulls/8`]: { status: 404 },
    });
    expect(await gh.getPullRequest(MANUAL, REPO, 7)).toMatchObject({ number: 7, state: 'open', commits_count: 4 });
    expect(await gh.getPullRequest(MANUAL, REPO, 8)).toBeNull();
  });

  test('listPullRequests stops paging at the first closed one older than since', async () => {
    const { github: gh, calls } = provider({
      [`GET ${API}/repositories/101/pulls`]: (call: FakeCall) =>
        call.url.includes('page=2')
          ? { status: 200, body: [prJson(4, '2026-10-01T00:00:00Z', 'closed'), prJson(5, '2026-09-01T00:00:00Z')] }
          : {
              status: 200,
              body: [prJson(1, '2026-10-19T00:00:00Z'), prJson(2, '2026-10-18T00:00:00Z', 'closed')],
              headers: { link: `<${API}/repositories/101/pulls?page=2>; rel="next"` },
            },
    });
    const prs = await gh.listPullRequests(MANUAL, REPO, new Date('2026-10-10T00:00:00Z'), 50);
    expect(prs.map(p => p.number)).toEqual([1, 2, 5]);
    expect(calls).toHaveLength(2);
    const first = new URL(calls[0]!.url);
    expect(Object.fromEntries(first.searchParams)).toEqual({
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: '100',
    });
  });

  test('listPullRequests honours the limit', async () => {
    const { github: gh } = provider({
      [`GET ${API}/repositories/101/pulls`]: [prJson(1, '2026-10-19T00:00:00Z'), prJson(2, '2026-10-18T00:00:00Z')],
    });
    expect(await gh.listPullRequests(MANUAL, REPO, new Date('2026-10-10T00:00:00Z'), 1)).toHaveLength(1);
  });

  const apiCommit = (n: number) => ({
    sha: n.toString(16).padStart(40, '0'),
    commit: {
      message: `API-7: step ${n}`,
      author: { name: 'Alex Lee', email: 'alex@acme.example', date: '2026-10-20T10:00:00Z' },
      committer: { name: 'Alex Lee', email: 'alex@acme.example', date: '2026-10-20T10:05:00Z' },
    },
    author: { login: 'alex-lee', id: 9001 },
    html_url: `https://github.com/acme-inc/web/commit/${n}`,
  });

  test('listPullRequestCommits under the cap counts the list', async () => {
    const { github: gh, calls } = provider({
      [`GET ${API}/repositories/101/pulls/42/commits`]: [apiCommit(1), apiCommit(2)],
    });
    const { commits, total } = await gh.listPullRequestCommits(MANUAL, REPO, 42);
    expect(total).toBe(2);
    expect(commits[0]).toEqual({
      sha: '1'.padStart(40, '0'),
      message: 'API-7: step 1',
      author_name: 'Alex Lee',
      author_email: 'alex@acme.example',
      author_login: 'alex-lee',
      author_provider_id: '9001',
      committed_at: '2026-10-20T10:05:00.000Z',
      url: 'https://github.com/acme-inc/web/commit/1',
      distinct: true,
    });
    expect(calls).toHaveLength(1);
  });

  test('listPullRequestCommits at the cap takes the total from the pull request', async () => {
    const page = (start: number) => Array.from({ length: 100 }, (_, i) => apiCommit(start + i));
    const { github: gh } = provider({
      [`GET ${API}/repositories/101/pulls/42/commits`]: (call: FakeCall) => {
        const n = Number(new URL(call.url).searchParams.get('page') ?? '1');
        return {
          status: 200,
          body: page((n - 1) * 100),
          headers:
            n < 3 ? { link: `<${API}/repositories/101/pulls/42/commits?per_page=100&page=${n + 1}>; rel="next"` } : {},
        };
      },
      [`GET ${API}/repositories/101/pulls/42`]: { ...prJson(42, '2026-10-20T10:00:00Z'), commits: 312 },
    });
    const { commits, total } = await gh.listPullRequestCommits(MANUAL, REPO, 42);
    expect(commits).toHaveLength(250);
    expect(total).toBe(312);
  });

  test('listBranches', async () => {
    const { github: gh } = provider({
      [`GET ${API}/repositories/101/branches`]: [
        { name: 'main', commit: { sha: 'a'.repeat(40) }, protected: true },
        { name: 'feat/api-7-login', commit: { sha: 'b'.repeat(40) }, protected: false },
      ],
    });
    expect(await gh.listBranches(MANUAL, REPO, 1)).toEqual([{ name: 'main', head_sha: 'a'.repeat(40) }]);
  });

  test('compare returns the commits head has over base', async () => {
    const { github: gh, calls } = provider({
      [`GET ${API}/repositories/101/compare/${'a'.repeat(40)}...feat/api-7-login`]: {
        status: 'ahead',
        commits: [{ sha: '1'.repeat(40) }, { sha: '2'.repeat(40) }],
      },
    });
    expect(await gh.compare(MANUAL, REPO, 'a'.repeat(40), 'feat/api-7-login')).toEqual([
      '1'.repeat(40),
      '2'.repeat(40),
    ]);
    expect(calls).toHaveLength(1);
  });

  test('rate limits surface with the reset time', async () => {
    const { github: gh } = provider({
      [`GET ${API}/repositories/101`]: {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792497600' },
      },
    });
    const error = await failure(gh.getRepository(MANUAL, REPO));
    expect(error.reason).toBe('rate_limited');
    expect(error.resetAt).toEqual(new Date(1792497600 * 1000));
  });
});

describe('webhooks and redelivery', () => {
  test('GitHub hooks are not registered by us', async () => {
    const target = { url: 'https://api.example/hooks', secret: SECRET };
    expect((await failure(github.registerWebhook(MANUAL, REPO, target))).reason).toBe('invalid');
    expect((await failure(github.updateWebhook(MANUAL, REPO, '1', target))).reason).toBe('invalid');
    expect((await failure(github.removeWebhook(MANUAL, REPO, '1'))).reason).toBe('invalid');
    expect(await github.webhookExists(MANUAL, REPO, '1')).toBe(true);
  });

  test('redelivery pages', () => {
    expect(github.redeliveryUrl({ base_url: 'https://github.com', auth_kind: 'app_installation' }, REPO, null)).toBe(
      'https://github.com/settings/apps/nothingleft-acme/advanced',
    );
    expect(github.redeliveryUrl({ base_url: 'https://ghe.example.com/', auth_kind: 'manual' }, REPO, '7')).toBe(
      'https://ghe.example.com/acme-inc/web/settings/hooks',
    );
    expect(github.redeliveryUrl({ base_url: 'https://github.com', auth_kind: 'manual' }, null, null)).toBeNull();
  });
});

describe('app install', () => {
  test('install URL and webhook secret', () => {
    expect(github.app?.configured).toBe(true);
    expect(github.app?.webhookSecret).toBe('app-secret');
    expect(github.app?.installUrl('s t/ate')).toBe(
      'https://github.com/apps/nothingleft-acme/installations/new?state=s%20t%2Fate',
    );
  });

  test('without a configured app nothing can be installed', async () => {
    const { github: gh } = provider({}, { now: NOW }, null);
    expect(gh.app?.configured).toBe(false);
    expect(() => gh.app?.installUrl('s')).toThrow(GitProviderError);
    expect((await failure(gh.app!.confirmInstallation('code', '5001'))).reason).toBe('invalid');
  });

  function installRoutes(installations: number[][]) {
    return {
      'POST https://github.com/login/oauth/access_token': (call: { body: unknown }) =>
        (call.body as { code: string }).code === 'good'
          ? { status: 200, body: { access_token: 'ghu_user', token_type: 'bearer' } }
          : { status: 200, body: { error: 'bad_verification_code' } },
      [`GET ${API}/user/installations`]: (call: { url: string }) => {
        const n = Number(new URL(call.url).searchParams.get('page') ?? '1');
        return {
          status: 200,
          body: {
            total_count: installations.flat().length,
            installations: installations[n - 1]!.map(id => ({
              id,
              account: { login: 'acme-inc', id: 77, type: 'Organization' },
            })),
          },
          headers:
            n < installations.length
              ? { link: `<${API}/user/installations?per_page=100&page=${n + 1}>; rel="next"` }
              : {},
        };
      },
    };
  }

  const membership = (role: string) => ({ [`GET ${API}/user/memberships/orgs/acme-inc`]: { state: 'active', role } });

  test('confirmInstallation finds the installation and needs its account administrator', async () => {
    const { github: gh, calls } = provider({ ...installRoutes([[4000], [5001]]), ...membership('admin') });
    await gh.app!.confirmInstallation('good', '5001');
    expect(calls[0]!.body).toEqual({ client_id: 'Iv1.client', client_secret: 'client-secret', code: 'good' });
    expect(calls[0]!.headers.accept).toBe('application/json');
    expect(calls[1]!.headers.authorization).toBe('Bearer ghu_user');
    expect(calls).toHaveLength(4);
  });

  test('confirmInstallation refuses someone who can only see the installation', async () => {
    const { github: gh } = provider({ ...installRoutes([[5001]]), ...membership('member') });
    expect((await failure(gh.app!.confirmInstallation('good', '5001'))).reason).toBe('forbidden');
    const { github: noMembership } = provider(installRoutes([[5001]]));
    expect((await failure(noMembership.app!.confirmInstallation('good', '5001'))).reason).toBe('forbidden');
  });

  test('confirmInstallation is forbidden for an installation the user cannot see, or a bad code', async () => {
    const { github: gh } = provider(installRoutes([[4000]]));
    expect((await failure(gh.app!.confirmInstallation('good', '5001'))).reason).toBe('forbidden');
    expect((await failure(gh.app!.confirmInstallation('bad', '5001'))).reason).toBe('forbidden');
  });
});
