import { describe, expect, test } from 'bun:test';
import type { NormalizedEvent } from '@git/events';
import { GitProviderError } from '@git/http';
import type { ConnectionAuth } from '@git/provider';
import { gitlabEventName, gitlabProvider } from '@git/providers/gitlab';
import { fakeFetch, type FakeCall, type FakeReply } from './git-fake-fetch.ts';
import { gitFixture, signedDelivery } from './git-fixtures.ts';

const NOW = new Date('2026-10-25T12:00:00Z');
const SECRET = 'hook-secret-0123456789';
const API = 'https://gitlab.com/api/v4';
const SELF_MANAGED = 'https://git.acme.example/api/v4';
const PROJECT = `${API}/projects/202`;
const auth: ConnectionAuth = {
  base_url: 'https://gitlab.com',
  auth_kind: 'token',
  installation_id: null,
  token: 'glpat-test',
};
const repo = { provider_repo_id: '202', full_name: 'acme/api' };

function setup(routes: Record<string, FakeReply> = {}) {
  const fake = fakeFetch(routes);
  return { ...fake, provider: gitlabProvider({ fetch: fake.fetch, now: () => NOW }) };
}

function deliver(name: string, body?: Record<string, unknown>) {
  const { provider } = setup();
  const fixture = gitFixture('gitlab', name);
  const { headers, payload } = signedDelivery('gitlab', fixture, SECRET, body ? { body } : {});
  const verified = provider.verifyWebhook(headers, Buffer.from(payload), SECRET);
  if (!verified) throw new Error(`fixture ${name} did not verify`);
  return { verified, events: provider.normalize(verified.event_name, JSON.parse(payload)), fixture };
}

const types = (events: NormalizedEvent[]) => events.map(e => e.type);

type EventOf<T> = NormalizedEvent extends infer E
  ? E extends { type: infer K }
    ? T extends K
      ? E
      : never
    : never
  : never;

function only<T extends NormalizedEvent['type']>(events: NormalizedEvent[], type: T) {
  const found = events.filter((e): e is EventOf<T> => e.type === type);
  expect(found).toHaveLength(1);
  return found[0]!;
}

function mergeRequestBody(name: string, over: { attrs?: Record<string, unknown>; changes?: Record<string, unknown> }) {
  const body = structuredClone(gitFixture('gitlab', name).body);
  Object.assign(body.object_attributes as Record<string, unknown>, over.attrs ?? {});
  if (over.changes) body.changes = over.changes;
  return body;
}

describe('verifyWebhook', () => {
  const fixture = gitFixture('gitlab', 'push.feature');

  test('accepts the shared token and reads the delivery id and event', () => {
    const { headers, payload } = signedDelivery('gitlab', fixture, SECRET);
    expect(setup().provider.verifyWebhook(headers, Buffer.from(payload), SECRET)).toEqual({
      delivery_id: '3b1f9e2a-6c4d-4e8f-9a1b-2c3d4e5f6071',
      event_name: 'push',
    });
  });

  test('prefers the retry-stable idempotency key', () => {
    const { headers, payload } = signedDelivery('gitlab', fixture, SECRET);
    const verified = setup().provider.verifyWebhook(
      { ...headers, 'idempotency-key': 'retry-key-1' },
      Buffer.from(payload),
      SECRET,
    );
    expect(verified?.delivery_id).toBe('retry-key-1');
  });

  test('rejects a wrong token, including one of a different length', () => {
    const { provider } = setup();
    const { headers, payload } = signedDelivery('gitlab', fixture, 'hook-secret-0123456788');
    expect(provider.verifyWebhook(headers, Buffer.from(payload), SECRET)).toBeNull();
    const short = signedDelivery('gitlab', fixture, 'short');
    expect(provider.verifyWebhook(short.headers, Buffer.from(short.payload), SECRET)).toBeNull();
  });

  test('rejects a delivery missing the token, event or delivery id', () => {
    const { provider } = setup();
    const { headers, payload } = signedDelivery('gitlab', fixture, SECRET);
    for (const missing of ['x-gitlab-token', 'x-gitlab-event', 'x-gitlab-event-uuid']) {
      const partial: Record<string, string> = { ...headers };
      delete partial[missing];
      expect(provider.verifyWebhook(partial, Buffer.from(payload), SECRET)).toBeNull();
    }
  });

  test('never accepts an empty secret', () => {
    const { headers, payload } = signedDelivery('gitlab', fixture, '');
    expect(setup().provider.verifyWebhook({ ...headers, 'x-gitlab-token': '' }, Buffer.from(payload), '')).toBeNull();
  });

  test('takes the first value of a repeated header', () => {
    const { headers, payload } = signedDelivery('gitlab', fixture, SECRET);
    const verified = setup().provider.verifyWebhook(
      { ...headers, 'x-gitlab-event': ['Merge Request Hook', 'Push Hook'] },
      Buffer.from(payload),
      SECRET,
    );
    expect(verified?.event_name).toBe('merge_request');
  });
});

describe('gitlabEventName', () => {
  test('derives the object kind from the hook header', () => {
    expect(gitlabEventName('Push Hook')).toBe('push');
    expect(gitlabEventName('Merge Request Hook')).toBe('merge_request');
    expect(gitlabEventName('Pipeline Hook')).toBe('pipeline');
    expect(gitlabEventName('Job Hook')).toBe('job');
    expect(gitlabEventName('Tag Push Hook')).toBe('tag_push');
    expect(gitlabEventName('Note Hook')).toBe('note');
    expect(gitlabEventName('Deployment Hook')).toBe('deployment');
    expect(gitlabEventName('System Hook')).toBe('system');
  });
});

describe('route', () => {
  const { provider } = setup();

  test('reads the project id from every hook kind', () => {
    for (const name of ['push.feature', 'merge_request.open', 'pipeline.failed', 'job.success', 'note']) {
      expect(provider.route('x', gitFixture('gitlab', name).body)).toEqual({
        installation_id: null,
        provider_repo_id: '202',
      });
    }
  });

  test('falls back to project_id and is null without either', () => {
    expect(provider.route('push', { project_id: 303 }).provider_repo_id).toBe('303');
    expect(provider.route('push', {}).provider_repo_id).toBeNull();
    expect(provider.route('push', null).provider_repo_id).toBeNull();
  });
});

describe('normalize: push', () => {
  test('a feature push carries every listed commit as distinct', () => {
    const push = only(deliver('push.feature').events, 'push');
    expect(push).toMatchObject({
      repo,
      ref: 'feat/api-7-login',
      before: '5f2c1e9a7d3b4c6e8f0a1b2c3d4e5f6a7b8c9d0e',
      after: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890',
      forced: false,
      created: false,
      deleted: false,
      commits_truncated: false,
      pusher: { login: 'alex-lee', provider_user_id: '9001', name: 'Alex Lee', email: null },
    });
    expect(push.commits).toHaveLength(2);
    expect(push.commits[0]).toEqual({
      sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      message: 'API-7: Validate the login form\n\nTrims whitespace before checking.\n',
      author_name: 'Alex Lee',
      author_email: 'alex@acme.example',
      author_login: null,
      author_provider_id: null,
      committed_at: '2026-10-25T10:10:00.000Z',
      url: 'https://gitlab.com/acme/api/-/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      distinct: true,
    });
  });

  test('marks the commit list truncated when the push carried more than GitLab lists', () => {
    const body = structuredClone(gitFixture('gitlab', 'push.feature').body);
    body.total_commits_count = 25;
    expect(only(deliver('push.feature', body).events, 'push').commits_truncated).toBe(true);
  });

  test('caps provider strings', () => {
    const body = structuredClone(gitFixture('gitlab', 'push.feature').body);
    (body.commits as Record<string, unknown>[])[0]!.message = 'x'.repeat(70_000);
    body.ref = `refs/heads/${'b'.repeat(400)}`;
    const push = only(deliver('push.feature', body).events, 'push');
    expect(push.commits[0]!.message).toHaveLength(65_536);
    expect(push.ref).toHaveLength(255);
  });

  test('a new branch emits branch.created before the push', () => {
    const { events } = deliver('push.branch_created');
    expect(types(events)).toEqual(['branch.created', 'push']);
    expect(events[0]).toMatchObject({
      ref: 'feat/api-7-login',
      head_sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      actor: { login: 'alex-lee' },
    });
    expect(events[1]).toMatchObject({ created: true, commits: [{ distinct: true }] });
  });

  test('a deleted branch emits only branch.deleted', () => {
    const { events } = deliver('push.branch_deleted');
    expect(events).toEqual([
      {
        type: 'branch.deleted',
        repo,
        ref: 'feat/api-7-login',
        head_sha: null,
        actor: {
          login: 'alex-lee',
          provider_user_id: '9001',
          name: 'Alex Lee',
          email: null,
          avatar_url: 'https://gitlab.com/uploads/-/system/user/avatar/9001/avatar.png',
        },
      },
    ]);
  });

  test('tag pushes normalize to nothing', () => {
    const { verified, events } = deliver('tag_push');
    expect(verified.event_name).toBe('tag_push');
    expect(events).toEqual([]);
    expect(setup().provider.normalize('push', gitFixture('gitlab', 'tag_push').body)).toEqual([]);
  });
});

describe('normalize: merge_request', () => {
  test('open maps the merge request', () => {
    const { events } = deliver('merge_request.open');
    const opened = only(events, 'pull_request.opened');
    expect(opened.repo).toEqual(repo);
    expect(opened.actor).toMatchObject({ login: 'alex-lee', provider_user_id: '9001', email: null });
    expect(opened.pull_request).toEqual({
      number: 12,
      title: 'API-7: Fix login',
      body: 'Implements API-7',
      state: 'open',
      draft: false,
      author: {
        login: 'alex-lee',
        provider_user_id: '9001',
        name: 'Alex Lee',
        email: null,
        avatar_url: 'https://gitlab.com/uploads/-/system/user/avatar/9001/avatar.png',
      },
      head: {
        repo_full_name: 'acme/api',
        ref: 'feat/api-7-login',
        sha: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890',
      },
      base: { ref: 'main' },
      merge_commit_sha: null,
      merged_by: null,
      html_url: 'https://gitlab.com/acme/api/-/merge_requests/12',
      requested_reviewers: [
        {
          login: 'casey-kim',
          provider_user_id: '9002',
          name: 'Casey Kim',
          email: null,
          avatar_url: 'https://gitlab.com/uploads/-/system/user/avatar/9002/avatar.png',
        },
      ],
      additions: null,
      deletions: null,
      changed_files: null,
      commits_count: null,
      provider_updated_at: '2026-10-25T10:00:00.000Z',
      opened_at: '2026-10-25T10:00:00.000Z',
      merged_at: null,
      closed_at: null,
    });
  });

  test('an author other than the actor is known only by id', () => {
    const body = mergeRequestBody('merge_request.open', { attrs: { author_id: 9002 } });
    const pr = only(deliver('merge_request.open', body).events, 'pull_request.opened').pull_request;
    expect(pr.author).toEqual({ login: null, provider_user_id: '9002', name: null, email: null, avatar_url: null });
  });

  test('a draft opens in the draft state', () => {
    const body = mergeRequestBody('merge_request.open', { attrs: { draft: true, title: 'Draft: API-7: Fix login' } });
    const pr = only(deliver('merge_request.open', body).events, 'pull_request.opened').pull_request;
    expect(pr).toMatchObject({ draft: true, state: 'draft' });
  });

  test('reopen', () => {
    const body = mergeRequestBody('merge_request.open', { attrs: { action: 'reopen' } });
    expect(types(deliver('merge_request.open', body).events)).toEqual(['pull_request.reopened']);
  });

  test('a title change is an edit', () => {
    expect(types(deliver('merge_request.update.title').events)).toEqual(['pull_request.edited']);
  });

  test('new commits synchronize', () => {
    expect(types(deliver('merge_request.update.commits').events)).toEqual(['pull_request.synchronized']);
  });

  test('draft to ready is ready_for_review, not an edit of the title prefix', () => {
    const { events } = deliver('merge_request.update.ready');
    expect(types(events)).toEqual(['pull_request.ready_for_review']);
  });

  test('a draft title prefix alone signals the transition both ways', () => {
    const ready = mergeRequestBody('merge_request.update.ready', {
      changes: { work_in_progress: { previous: true, current: false } },
    });
    expect(types(deliver('merge_request.update.ready', ready).events)).toEqual(['pull_request.ready_for_review']);
    const toDraft = mergeRequestBody('merge_request.update.ready', {
      changes: { title: { previous: 'API-7: Fix login', current: '[Draft] API-7: Fix login' } },
    });
    expect(types(deliver('merge_request.update.ready', toDraft).events)).toEqual(['pull_request.converted_to_draft']);
  });

  test('a new target branch retargets', () => {
    const retargeted = only(deliver('merge_request.update.target_branch').events, 'pull_request.retargeted');
    expect(retargeted.pull_request.base.ref).toBe('main');
  });

  test('a multi-change update emits in a fixed order', () => {
    const body = mergeRequestBody('merge_request.update.commits', {
      attrs: { draft: true },
      changes: {
        description: { previous: '', current: 'Implements API-7' },
        draft: { previous: false, current: true },
        target_branch: { previous: 'develop', current: 'main' },
      },
    });
    expect(types(deliver('merge_request.update.commits', body).events)).toEqual([
      'pull_request.retargeted',
      'pull_request.synchronized',
      'pull_request.converted_to_draft',
      'pull_request.edited',
    ]);
  });

  test('an update of nothing tracked is ignored; reviewers are an edit', () => {
    const labels = mergeRequestBody('merge_request.update.title', {
      changes: { labels: { previous: [], current: [] } },
    });
    expect(deliver('merge_request.update.title', labels).events).toEqual([]);
    const reviewers = mergeRequestBody('merge_request.update.title', {
      changes: { reviewers: { previous: [], current: [{ id: 9002 }] } },
    });
    expect(types(deliver('merge_request.update.title', reviewers).events)).toEqual(['pull_request.edited']);
  });

  test('merge closes as merged, by the hook user', () => {
    const closed = only(deliver('merge_request.merge').events, 'pull_request.closed');
    expect(closed.pull_request).toMatchObject({
      state: 'merged',
      merge_commit_sha: 'd4e5f60718293a4b5c6d7e8f9012345678901234',
      merged_by: { login: 'casey-kim', provider_user_id: '9002' },
      merged_at: '2026-10-25T11:00:00.000Z',
      closed_at: '2026-10-25T11:00:00.000Z',
      author: { login: null, provider_user_id: '9001' },
    });
    expect(closed.actor.login).toBe('casey-kim');
  });

  test('close closes without merging', () => {
    const closed = only(deliver('merge_request.close').events, 'pull_request.closed');
    expect(closed.pull_request).toMatchObject({
      state: 'closed',
      merge_commit_sha: null,
      merged_by: null,
      merged_at: null,
      closed_at: '2026-10-25T11:00:00.000Z',
    });
  });

  test('approval and its withdrawal are reviews', () => {
    expect(deliver('merge_request.approved').events).toEqual([
      {
        type: 'pull_request.review',
        repo,
        number: 12,
        reviewer: {
          login: 'casey-kim',
          provider_user_id: '9002',
          name: 'Casey Kim',
          email: null,
          avatar_url: 'https://gitlab.com/uploads/-/system/user/avatar/9002/avatar.png',
        },
        state: 'approved',
        submitted_at: '2026-10-25T10:45:00.000Z',
      },
    ]);
    const body = mergeRequestBody('merge_request.approved', { attrs: { action: 'unapproved' } });
    expect(only(deliver('merge_request.approved', body).events, 'pull_request.review').state).toBe('dismissed');
  });

  test('caps the title and body', () => {
    const body = mergeRequestBody('merge_request.open', {
      attrs: { title: 't'.repeat(2_000), description: 'd'.repeat(70_000) },
    });
    const pr = only(deliver('merge_request.open', body).events, 'pull_request.opened').pull_request;
    expect(pr.title).toHaveLength(1_000);
    expect(pr.body).toHaveLength(65_536);
  });
});

describe('normalize: pipeline and job', () => {
  test('a pipeline with builds is one check per job', () => {
    const { events } = deliver('pipeline.failed');
    expect(events).toEqual([
      {
        type: 'check.updated',
        repo,
        sha: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890',
        check: {
          external_id: 'job:7701',
          name: 'compile',
          status: 'completed',
          conclusion: 'success',
          details_url: 'https://gitlab.com/acme/api/-/jobs/7701',
          started_at: '2026-10-25T10:21:05.000Z',
          completed_at: '2026-10-25T10:23:05.000Z',
        },
      },
      {
        type: 'check.updated',
        repo,
        sha: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890',
        check: {
          external_id: 'job:7702',
          name: 'unit tests',
          status: 'completed',
          conclusion: 'failure',
          details_url: 'https://gitlab.com/acme/api/-/jobs/7702',
          started_at: '2026-10-25T10:23:10.000Z',
          completed_at: '2026-10-25T10:25:00.000Z',
        },
      },
    ]);
  });

  test('a pipeline without builds is one pipeline check', () => {
    const event = only(deliver('pipeline.running').events, 'check.updated');
    expect(event.check).toEqual({
      external_id: 'pipeline:3102',
      name: 'pipeline',
      status: 'in_progress',
      conclusion: null,
      details_url: 'https://gitlab.com/acme/api/-/pipelines/3102',
      started_at: '2026-10-25T10:21:00.000Z',
      completed_at: null,
    });
  });

  test('maps every status', () => {
    const { provider } = setup();
    const body = structuredClone(gitFixture('gitlab', 'pipeline.running').body);
    const cases: [string, string, string | null][] = [
      ['created', 'queued', null],
      ['pending', 'queued', null],
      ['waiting_for_resource', 'queued', null],
      ['preparing', 'queued', null],
      ['scheduled', 'queued', null],
      ['manual', 'queued', null],
      ['running', 'in_progress', null],
      ['success', 'completed', 'success'],
      ['failed', 'completed', 'failure'],
      ['canceled', 'completed', 'cancelled'],
      ['skipped', 'completed', 'skipped'],
    ];
    for (const [raw, status, conclusion] of cases) {
      (body.object_attributes as Record<string, unknown>).status = raw;
      const event = only(provider.normalize('pipeline', body), 'check.updated');
      expect([raw, event.check.status, event.check.conclusion]).toEqual([raw, status, conclusion]);
    }
  });

  test('a job hook is one job check', () => {
    const { verified, events } = deliver('job.success');
    expect(verified.event_name).toBe('job');
    expect(events).toEqual([
      {
        type: 'check.updated',
        repo,
        sha: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890',
        check: {
          external_id: 'job:7701',
          name: 'compile',
          status: 'completed',
          conclusion: 'success',
          details_url: 'https://gitlab.com/acme/api/-/jobs/7701',
          started_at: '2026-10-25T10:21:05.000Z',
          completed_at: '2026-10-25T10:23:05.000Z',
        },
      },
    ]);
  });
});

describe('normalize: ignored and malformed', () => {
  test('notes and other hooks normalize to nothing', () => {
    expect(deliver('note').events).toEqual([]);
    const { provider } = setup();
    for (const name of ['issue', 'wiki_page', 'deployment', 'release', 'tag_push']) {
      expect(provider.normalize(name, gitFixture('gitlab', 'merge_request.open').body)).toEqual([]);
    }
  });

  test('malformed payloads never throw', () => {
    const { provider } = setup();
    const odd: unknown[] = [null, 'text', 42, [], {}, { project: 'x', ref: 7 }, { object_attributes: [] }];
    for (const name of ['push', 'merge_request', 'pipeline', 'job']) {
      for (const payload of odd) expect(provider.normalize(name, payload)).toEqual([]);
    }
  });
});

describe('trim', () => {
  test('drops file lists and keeps at most 100 commits of a push', () => {
    const { provider } = setup();
    const body = structuredClone(gitFixture('gitlab', 'push.feature').body);
    const commit = (body.commits as Record<string, unknown>[])[0]!;
    body.commits = Array.from({ length: 150 }, (_, i) => ({ ...commit, id: `sha-${i}` }));
    const trimmed = provider.trim('push', body) as { commits: Record<string, unknown>[]; project: unknown };
    expect(trimmed.commits).toHaveLength(100);
    expect(trimmed.commits[0]).not.toHaveProperty('added');
    expect(trimmed.commits[0]).not.toHaveProperty('modified');
    expect(trimmed.commits[0]).not.toHaveProperty('removed');
    expect(trimmed.commits[0]).toHaveProperty('message');
    expect(trimmed.project).toEqual(body.project);
  });

  test('leaves other events as they are', () => {
    const body = gitFixture('gitlab', 'merge_request.open').body;
    expect(setup().provider.trim('merge_request', body)).toBe(body);
  });
});

function project(id: number, path: string, over: Record<string, unknown> = {}) {
  return {
    id,
    path_with_namespace: path,
    web_url: `https://gitlab.com/${path}`,
    default_branch: 'main',
    visibility: 'private',
    archived: false,
    ...over,
  };
}

function restMergeRequest(iid: number, updated: string, over: Record<string, unknown> = {}) {
  return {
    iid,
    title: `API-${iid}: Change`,
    description: `Implements API-${iid}`,
    state: 'opened',
    draft: false,
    author: { id: 9001, username: 'alex-lee', name: 'Alex Lee', avatar_url: null },
    source_branch: `feat/api-${iid}`,
    target_branch: 'main',
    source_project_id: 202,
    target_project_id: 202,
    sha: `sha-${iid}`,
    merge_commit_sha: null,
    squash_commit_sha: null,
    merge_user: null,
    web_url: `https://gitlab.com/acme/api/-/merge_requests/${iid}`,
    reviewers: [{ id: 9002, username: 'casey-kim', name: 'Casey Kim', avatar_url: null }],
    created_at: '2026-10-20T09:00:00.000Z',
    updated_at: updated,
    merged_at: null,
    closed_at: null,
    ...over,
  };
}

const pageOf = (url: string) => Number(new URL(url).searchParams.get('page') ?? '1');

describe('API', () => {
  test('sends the token as PRIVATE-TOKEN to the v4 API', async () => {
    const { provider, calls } = setup({ [`GET ${PROJECT}`]: project(202, 'acme/api') });
    expect(await provider.getRepository({ ...auth, base_url: 'https://gitlab.com/' }, repo)).toEqual({
      provider_repo_id: '202',
      full_name: 'acme/api',
      html_url: 'https://gitlab.com/acme/api',
      default_branch: 'main',
      is_private: true,
      is_archived: false,
    });
    expect(calls[0]!.url).toBe(PROJECT);
    expect(calls[0]!.headers['private-token']).toBe('glpat-test');
  });

  test('no token, or a rejected one, is token_invalid', async () => {
    const { provider, calls } = setup({ [`GET ${PROJECT}`]: { status: 401 } });
    const missing = await provider.getRepository({ ...auth, token: null }, repo).catch(e => e);
    expect(missing).toBeInstanceOf(GitProviderError);
    expect(missing.reason).toBe('token_invalid');
    expect(calls).toHaveLength(0);
    const rejected = await provider.getRepository(auth, repo).catch(e => e);
    expect(rejected).toBeInstanceOf(GitProviderError);
    expect(rejected.reason).toBe('token_invalid');
  });

  test('a missing project or merge request is null', async () => {
    const { provider } = setup({
      [`GET ${PROJECT}`]: { status: 404 },
      [`GET ${PROJECT}/merge_requests/12`]: { status: 404 },
    });
    expect(await provider.getRepository(auth, repo)).toBeNull();
    expect(await provider.getPullRequest(auth, repo, 12)).toBeNull();
  });

  test('listRepositories pages by Link and includes archived projects', async () => {
    const { provider, calls } = setup({
      [`GET ${API}/projects`]: (call: FakeCall) =>
        pageOf(call.url) === 1
          ? {
              status: 200,
              body: [
                project(202, 'acme/api'),
                project(203, 'acme/web', { default_branch: null, visibility: 'public' }),
              ],
              headers: { link: `<${API}/projects?page=2&per_page=100>; rel="next"` },
            }
          : { status: 200, body: [project(204, 'acme/old', { archived: true })] },
    });
    const { repos } = await provider.listRepositories(auth);
    expect(repos.map(r => r.full_name)).toEqual(['acme/api', 'acme/web', 'acme/old']);
    expect(repos[1]).toMatchObject({ default_branch: '', is_private: false });
    expect(repos[2]!.is_archived).toBe(true);
    const query = new URL(calls[0]!.url).searchParams;
    expect(query.get('membership')).toBe('true');
    expect(query.get('min_access_level')).toBe('20');
    expect(query.get('per_page')).toBe('100');
    expect(query.has('archived')).toBe(false);
    expect(calls).toHaveLength(2);
  });

  test('getPullRequest maps the REST shape', async () => {
    const { provider, calls } = setup({
      [`GET ${PROJECT}/merge_requests/12`]: restMergeRequest(12, '2026-10-25T11:00:00.000Z', {
        state: 'merged',
        squash_commit_sha: 'squash-sha',
        merge_user: { id: 9002, username: 'casey-kim', name: 'Casey Kim', avatar_url: null },
        merged_at: '2026-10-25T11:00:00.000Z',
      }),
    });
    const pr = await provider.getPullRequest(auth, repo, 12);
    expect(calls[0]!.url).toBe(`${PROJECT}/merge_requests/12`);
    expect(pr).toMatchObject({
      number: 12,
      state: 'merged',
      author: { login: 'alex-lee', provider_user_id: '9001' },
      head: { repo_full_name: 'acme/api', ref: 'feat/api-12', sha: 'sha-12' },
      base: { ref: 'main' },
      merge_commit_sha: 'squash-sha',
      merged_by: { login: 'casey-kim' },
      requested_reviewers: [{ login: 'casey-kim' }],
      merged_at: '2026-10-25T11:00:00.000Z',
      closed_at: '2026-10-25T11:00:00.000Z',
    });
  });

  test('getPullRequest: a draft from a fork has no head repository name', async () => {
    const { provider } = setup({
      [`GET ${PROJECT}/merge_requests/12`]: restMergeRequest(12, '2026-10-25T11:00:00.000Z', {
        draft: true,
        source_project_id: 999,
      }),
    });
    expect(await provider.getPullRequest(auth, repo, 12)).toMatchObject({
      state: 'draft',
      draft: true,
      head: { repo_full_name: null },
    });
  });

  test('listPullRequests merges open and recently updated, de-duplicated, newest first', async () => {
    const since = new Date('2026-10-24T00:00:00Z');
    const { provider, calls } = setup({
      [`GET ${PROJECT}/merge_requests`]: (call: FakeCall) =>
        new URL(call.url).searchParams.get('state') === 'opened'
          ? {
              status: 200,
              body: [
                restMergeRequest(12, '2026-10-25T10:30:00.000Z'),
                restMergeRequest(14, '2026-10-01T09:00:00.000Z'),
              ],
            }
          : {
              status: 200,
              body: [
                restMergeRequest(13, '2026-10-25T11:00:00.000Z', { state: 'merged' }),
                restMergeRequest(12, '2026-10-25T10:30:00.000Z'),
              ],
            },
    });
    const prs = await provider.listPullRequests(auth, repo, since, 50);
    expect(prs.map(p => p.number)).toEqual([13, 12, 14]);
    const recent = calls.map(c => new URL(c.url).searchParams).find(q => q.has('updated_after'))!;
    expect(recent.get('updated_after')).toBe('2026-10-24T00:00:00.000Z');
    expect(recent.get('order_by')).toBe('updated_at');
    expect(recent.has('state')).toBe(false);
    expect((await provider.listPullRequests(auth, repo, since, 2)).map(p => p.number)).toEqual([13, 12]);
  });

  test('listPullRequestCommits returns oldest first', async () => {
    const commit = (i: number) => ({
      id: `sha-${i}`,
      message: `API-7: step ${i}\n`,
      author_name: 'Alex Lee',
      author_email: 'alex@acme.example',
      committed_date: `2026-10-25T10:0${i}:00.000+00:00`,
      web_url: `https://gitlab.com/acme/api/-/commit/sha-${i}`,
    });
    const { provider, calls } = setup({
      [`GET ${PROJECT}/merge_requests/12/commits`]: [commit(3), commit(2), commit(1)],
    });
    const { commits, total } = await provider.listPullRequestCommits(auth, repo, 12);
    expect(commits.map(c => c.sha)).toEqual(['sha-1', 'sha-2', 'sha-3']);
    expect(commits[0]).toEqual({
      sha: 'sha-1',
      message: 'API-7: step 1\n',
      author_name: 'Alex Lee',
      author_email: 'alex@acme.example',
      author_login: null,
      author_provider_id: null,
      committed_at: '2026-10-25T10:01:00.000Z',
      url: 'https://gitlab.com/acme/api/-/commit/sha-1',
      distinct: true,
    });
    expect(total).toBe(3);
    expect(new URL(calls[0]!.url).searchParams.get('per_page')).toBe('100');
    expect(calls[0]!.headers['private-token']).toBe('glpat-test');
  });

  test('listPullRequestCommits caps at 250 and reports the provider total', async () => {
    const url = `${PROJECT}/merge_requests/12/commits`;
    const { provider, calls } = setup({
      [`GET ${url}`]: (call: FakeCall) => {
        const page = pageOf(call.url);
        return {
          status: 200,
          body: Array.from({ length: 100 }, (_, i) => ({ id: `sha-${(page - 1) * 100 + i}`, message: 'm' })),
          headers: { 'x-total': '400', link: `<${url}?page=${page + 1}&per_page=100>; rel="next"` },
        };
      },
    });
    const { commits, total } = await provider.listPullRequestCommits(auth, repo, 12);
    expect(calls).toHaveLength(3);
    expect(commits).toHaveLength(250);
    expect(commits[0]!.sha).toBe('sha-249');
    expect(commits[249]!.sha).toBe('sha-0');
    expect(total).toBe(400);
  });

  test('listBranches maps name and head and honours the limit', async () => {
    const { provider, calls } = setup({
      [`GET ${PROJECT}/repository/branches`]: [
        { name: 'main', commit: { id: 'sha-main' } },
        { name: 'feat/api-7-login', commit: { id: 'sha-feat' } },
      ],
    });
    expect(await provider.listBranches(auth, repo, 10)).toEqual([
      { name: 'main', head_sha: 'sha-main' },
      { name: 'feat/api-7-login', head_sha: 'sha-feat' },
    ]);
    expect(await provider.listBranches(auth, repo, 1)).toEqual([{ name: 'main', head_sha: 'sha-main' }]);
    expect(new URL(calls[0]!.url).searchParams.get('per_page')).toBe('100');
  });

  test('compare lists the commits between two refs', async () => {
    const { provider, calls } = setup({
      [`GET ${PROJECT}/repository/compare`]: { commits: [{ id: 'sha-1' }, { id: 'sha-2' }], diffs: [] },
    });
    expect(await provider.compare(auth, repo, 'main', 'feat/api-7-login')).toEqual(['sha-1', 'sha-2']);
    const query = new URL(calls[0]!.url).searchParams;
    expect([query.get('from'), query.get('to'), query.get('straight')]).toEqual(['main', 'feat/api-7-login', 'true']);
  });
});

describe('describeConnection', () => {
  const user = { id: 9001, username: 'alex-lee', avatar_url: 'https://gitlab.com/avatar/alex.png' };

  test('names the group every project shares, with its avatar and the token expiry', async () => {
    const { provider, calls } = setup({
      [`GET ${API}/personal_access_tokens/self`]: { id: 1, expires_at: '2026-12-31', scopes: ['read_api'] },
      [`GET ${API}/user`]: user,
      [`GET ${API}/projects`]: [project(202, 'acme/api'), project(203, 'acme/platform/web')],
      [`GET ${API}/namespaces/acme`]: { id: 50, full_path: 'acme', avatar_url: 'https://gitlab.com/avatar/acme.png' },
    });
    expect(await provider.describeConnection(auth)).toEqual({
      account: { login: 'acme', avatar_url: 'https://gitlab.com/avatar/acme.png', url: 'https://gitlab.com/acme' },
      token_expires_at: new Date('2026-12-31T00:00:00Z'),
      // `read_api` reads but cannot add the webhooks the server registers.
      can_manage_webhooks: false,
    });
    expect(calls.every(c => c.headers['private-token'] === 'glpat-test')).toBe(true);
  });

  test("falls back to the token user's name when projects span namespaces, and to no expiry", async () => {
    const { provider, calls } = setup({
      [`GET ${SELF_MANAGED}/personal_access_tokens/self`]: { id: 1, expires_at: null },
      [`GET ${SELF_MANAGED}/user`]: user,
      [`GET ${SELF_MANAGED}/projects`]: [project(202, 'acme/api'), project(303, 'alex-lee/dotfiles')],
    });
    expect(await provider.describeConnection({ ...auth, base_url: 'https://git.acme.example/' })).toEqual({
      account: {
        login: 'alex-lee',
        avatar_url: 'https://gitlab.com/avatar/alex.png',
        url: 'https://git.acme.example/alex-lee',
      },
      token_expires_at: null,
      // This instance does not describe the token's scopes.
      can_manage_webhooks: null,
    });
    expect(calls.some(c => c.url.includes('/namespaces/'))).toBe(false);
    expect(calls[0]!.url.startsWith('https://git.acme.example/api/v4/')).toBe(true);
  });

  test("uses the user's avatar when the namespace cannot be read", async () => {
    const { provider } = setup({
      [`GET ${API}/personal_access_tokens/self`]: { id: 1, expires_at: '2027-01-15' },
      [`GET ${API}/user`]: user,
      [`GET ${API}/projects`]: [project(202, 'acme/api')],
      [`GET ${API}/namespaces/acme`]: { status: 404 },
    });
    const described = await provider.describeConnection(auth);
    expect(described.account).toEqual({
      login: 'acme',
      avatar_url: 'https://gitlab.com/avatar/alex.png',
      url: 'https://gitlab.com/acme',
    });
    expect(described.token_expires_at?.toISOString()).toBe('2027-01-15T00:00:00.000Z');
  });

  test('a rejected token fails the description', async () => {
    const { provider } = setup({
      [`GET ${API}/personal_access_tokens/self`]: { status: 401 },
      [`GET ${API}/user`]: { status: 401 },
      [`GET ${API}/projects`]: { status: 401 },
    });
    const err = await provider.describeConnection(auth).catch(e => e);
    expect(err).toBeInstanceOf(GitProviderError);
    expect(err.reason).toBe('token_invalid');
  });
});

describe('webhooks', () => {
  const target = { url: 'https://api.nothingleft.dev/v1/git/webhooks/gitlab/abc', secret: SECRET };
  const body = {
    url: target.url,
    token: SECRET,
    push_events: true,
    merge_requests_events: true,
    pipeline_events: true,
    job_events: true,
    tag_push_events: false,
    enable_ssl_verification: true,
  };

  test('register posts the hook and returns its id', async () => {
    const { provider, calls } = setup({
      [`POST ${PROJECT}/hooks`]: { status: 201, body: { id: 77, url: target.url } },
    });
    expect(await provider.registerWebhook(auth, repo, target)).toEqual({ provider_webhook_id: '77' });
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${PROJECT}/hooks`, body });
    expect(calls[0]!.headers['private-token']).toBe('glpat-test');
  });

  test('update puts the same body', async () => {
    const { provider, calls } = setup({ [`PUT ${PROJECT}/hooks/77`]: { id: 77 } });
    await provider.updateWebhook(auth, repo, '77', target);
    expect(calls[0]).toMatchObject({ method: 'PUT', url: `${PROJECT}/hooks/77`, body });
  });

  test('remove deletes, and a hook already gone is fine', async () => {
    const { provider, calls } = setup({ [`DELETE ${PROJECT}/hooks/77`]: { status: 204 } });
    await provider.removeWebhook(auth, repo, '77');
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: `${PROJECT}/hooks/77` });
    const gone = setup({ [`DELETE ${PROJECT}/hooks/77`]: { status: 404 } });
    expect(await gone.provider.removeWebhook(auth, repo, '77')).toBeUndefined();
  });

  test('webhookExists is false once the hook is gone', async () => {
    const { provider } = setup({
      [`GET ${PROJECT}/hooks/77`]: { id: 77 },
      [`GET ${PROJECT}/hooks/78`]: { status: 404 },
    });
    expect(await provider.webhookExists(auth, repo, '77')).toBe(true);
    expect(await provider.webhookExists(auth, repo, '78')).toBe(false);
  });

  test('redeliveryUrl links the hook settings page when both are known', () => {
    const { provider } = setup();
    const connection = { base_url: 'https://gitlab.com', auth_kind: 'token' as const };
    expect(provider.redeliveryUrl(connection, repo, '77')).toBe('https://gitlab.com/acme/api/-/hooks/77/edit');
    expect(provider.redeliveryUrl(connection, null, '77')).toBeNull();
    expect(provider.redeliveryUrl(connection, repo, null)).toBeNull();
  });
});

test('declares its capabilities', () => {
  const { provider } = setup();
  expect(provider.kind).toBe('gitlab');
  expect(provider.defaultBaseUrl).toBe('https://gitlab.com');
  expect(provider.supports).toEqual({
    checks: true,
    reviews: true,
    compare: true,
    webhook_registration: true,
    reports_forced_push: false,
  });
  expect(provider.app).toBeUndefined();
});
