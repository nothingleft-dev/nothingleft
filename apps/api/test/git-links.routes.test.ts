import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { organizationsRepository, systemContext, tenantContext, type TenantContext } from '@nothingleft/db';
import type { IssueDevelopment } from '@nothingleft/types';
import { gitFixture } from './git-fixtures.ts';
import { githubRepo, gitWorld, type GitWorld } from './git-world.ts';

const KEY = 'API';
const GITHUB_API = 'https://api.github.com';
let w: GitWorld;
let other: { slug: string; ctx: TenantContext };

const apiCommit = (sha: string, message: string) => ({
  sha,
  html_url: `https://github.com/acme-inc/web/commit/${sha}`,
  commit: {
    message,
    author: { name: 'Alex Lee', email: 'alex@acme.example', date: '2026-10-20T10:00:00Z' },
    committer: { name: 'Alex Lee', email: 'alex@acme.example', date: '2026-10-20T10:00:00Z' },
  },
  author: { login: 'alex-lee', id: 9001 },
});

type Loose = Record<string, unknown>;
type FixtureBody = Loose & { pull_request: Loose & { head: Loose }; check_run: Loose };
const fixtureBody = (name: string) => structuredClone(gitFixture('github', name).body) as FixtureBody;

async function development(key = `${KEY}-7`, who = w.admin): Promise<IssueDevelopment> {
  const res = await w.call(who, 'GET', `/v1/issues/${key}/development`);
  if (res.statusCode !== 200) throw new Error(`development ${key}: ${res.statusCode} ${res.body}`);
  return res.json().data;
}

const history = async (key: string, kinds = 'git_linked,git_unlinked,git_pr_changed') =>
  (
    await w.call(
      w.admin,
      'GET',
      `/v1/issues/${key}/activity?${kinds
        .split(',')
        .map(k => `kind=${k}`)
        .join('&')}&limit=100`,
    )
  ).json().data as {
    kind: string;
    actor: { name: string; system?: boolean };
    old_value: Record<string, unknown> | null;
    new_value: Record<string, unknown> | null;
  }[];

async function deliver(name: string, delivery: string, body?: Record<string, unknown>) {
  const res = await w.deliver('github', name, { delivery, ...(body ? { body } : {}) });
  expect(res.statusCode).toBe(202);
  await w.drain();
}

beforeAll(async () => {
  w = await gitWorld(KEY);
  // Visible to the installation, never linked to a project.
  w.installations.get(w.inst('5001'))!.repos.push(githubRepo(103, 'acme-inc/secret'));
  for (let i = 1; i <= 8; i++) await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: `Issue ${i}` });

  // Another organisation: the same project key, the same issue numbers, a repository with the same provider id.
  other = { slug: `${w.slug}-x`, ctx: tenantContext(1) };
  other.ctx = tenantContext((await organizationsRepository(w.db).findBySlug(systemContext('t'), other.slug))!.id);
  const headers = { 'x-organization': other.slug };
  await w.call(w.outsider, 'POST', '/v1/projects', { name: 'Other API', key: KEY }, headers);
  for (let i = 1; i <= 8; i++)
    await w.call(w.outsider, 'POST', '/v1/issues', { project: KEY, title: `Theirs ${i}` }, headers);
  w.installations.set(w.inst('5002'), { login: 'other-inc', repos: [githubRepo(101, 'other-inc/web')] });

  expect((await w.connectGitHub(w.admin, w.slug, w.inst('5001'))).statusCode).toBe(200);
  expect((await w.connectGitHub(w.outsider, other.slug, w.inst('5002'))).statusCode).toBe(200);
  expect(
    (await w.call(w.admin, 'PUT', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`, { backfill: false })).statusCode,
  ).toBe(201);
  expect(
    (await w.call(w.outsider, 'PUT', `/v1/projects/${KEY}/repositories/other-inc%2Fweb`, { backfill: false }, headers))
      .statusCode,
  ).toBe(201);

  w.provider.routes[`GET ${GITHUB_API}/repositories/101/pulls/42/commits`] = [
    apiCommit('0202020202020202020202020202020202020202', 'API-7: Keep the return path on login'),
    apiCommit('0303030303030303030303030303030303030303', 'Cover the redirect with a test, see API-6'),
  ];
});

afterAll(async () => {
  await w.close();
});

describe('tenant isolation', () => {
  test("org A's pull request mentioning API-7 links org A's API-7 and never org B's", async () => {
    await deliver('pull_request.opened', 'pr-opened');
    const mine = await development();
    expect(mine.summary.pull_requests).toBe(1);
    const theirs = await w.call(w.outsider, 'GET', `/v1/issues/${KEY}-7/development`, undefined, {
      'x-organization': other.slug,
    });
    expect(theirs.json().data.summary).toMatchObject({ pull_requests: 0, commits: 0 });
    expect(theirs.json().data.repositories).toEqual([]);
  });
});

describe('a pull request through its life', () => {
  test('opened: linked from its title, body, branch and commits, with history from the system', async () => {
    const dev = await development();
    expect(dev.git_enabled).toBe(true);
    const [repo] = dev.repositories;
    expect(repo!.repository).toMatchObject({ full_name: 'acme-inc/web', provider: 'github' });
    const [pr] = repo!.pull_requests;
    expect(pr).toMatchObject({ ref: 'acme-inc/web#42', state: 'open', head_ref: 'feat/api-7-login', base_ref: 'main' });
    expect(pr!.link!.intent).toBe('closes');
    expect(pr!.link!.sources.sort()).toEqual(['branch_name', 'pr_body', 'pr_commits', 'pr_title']);
    expect(pr!.commits.map(c => c.short_sha)).toEqual(['0202020', '0303030']);
    expect(pr!.html_url).toBe('https://github.com/acme-inc/web/pull/42');

    // A commit inside the pull request references API-6, so API-6 gets the pull request too.
    const six = await development(`${KEY}-6`);
    expect(six.repositories[0]!.pull_requests[0]!.link!.sources).toEqual(['pr_commits']);

    const entry = (await history(`${KEY}-7`, 'git_linked')).find(e => e.new_value?.['kind'] === 'pull_request');
    expect(entry!.actor).toMatchObject({ name: 'Nothing Left Bot', system: true });
    expect(entry!.new_value).toMatchObject({
      kind: 'pull_request',
      repo: 'acme-inc/web',
      number: 42,
      intent: 'closes',
    });

    const issue = (await w.call(w.admin, 'GET', `/v1/issues/${KEY}-7`)).json().data;
    expect(issue.project.git_enabled).toBe(true);
    expect(issue.development).toMatchObject({ rollup: 'in_review', pull_requests: 1, repositories: 1 });
  });

  test('edited to add API-8 links it; a later edit dropping it unlinks it', async () => {
    await deliver('pull_request.edited', 'pr-edited');
    expect((await development(`${KEY}-8`)).summary.pull_requests).toBe(1);
    const dropped = fixtureBody('pull_request.edited');
    dropped['pull_request'].title = 'API-7: Fix login redirect';
    dropped['pull_request'].body = 'Fixes API-7';
    dropped['pull_request'].updated_at = '2026-10-20T11:15:00Z';
    await deliver('pull_request.edited', 'pr-edited-2', dropped);
    expect((await development(`${KEY}-8`)).summary.pull_requests).toBe(0);
    const unlinked = await history(`${KEY}-8`, 'git_unlinked');
    expect(unlinked[0]!.old_value).toMatchObject({ number: 42, sources: expect.arrayContaining(['pr_title']) });
    // The system unlinked it, so naming the issue again links it again.
    const back = fixtureBody('pull_request.edited');
    back['pull_request'].updated_at = '2026-10-20T11:20:00Z';
    await deliver('pull_request.edited', 'pr-edited-back', back);
    expect((await development(`${KEY}-8`)).summary.pull_requests).toBe(1);
    const gone = fixtureBody('pull_request.edited');
    gone['pull_request'].title = 'API-7: Fix login redirect';
    gone['pull_request'].body = 'Fixes API-7';
    gone['pull_request'].updated_at = '2026-10-20T11:25:00Z';
    await deliver('pull_request.edited', 'pr-edited-gone', gone);
  });

  test('an event older than what is stored changes nothing', async () => {
    const stale = fixtureBody('pull_request.edited');
    stale['pull_request'].title = 'API-5: rewritten long ago';
    stale['pull_request'].updated_at = '2026-10-20T10:00:00Z';
    await deliver('pull_request.edited', 'pr-stale', stale);
    expect((await development(`${KEY}-5`)).summary.pull_requests).toBe(0);
    expect((await development()).repositories[0]!.pull_requests[0]!.title).toBe('API-7: Fix login redirect');
  });

  test('a review and checks roll up on the pull request, one coalesced history entry', async () => {
    // A check that arrives before the pull request moves to its commit still counts once it does.
    const early = fixtureBody('check_run.completed.failure');
    early['check_run'].conclusion = 'success';
    early['check_run'].id = 777;
    early['check_run'].name = 'lint';
    early['check_run'].completed_at = '2026-10-20T11:59:00Z';
    await deliver('check_run.completed.failure', 'check-early', early);
    await deliver('pull_request.synchronize', 'pr-sync');
    await deliver('pull_request_review.approved', 'pr-review');
    let pr = (await development()).repositories[0]!.pull_requests[0]!;
    expect(pr.review_state).toBe('approved');
    expect(pr.reviewers[0]).toMatchObject({ state: 'approved', author: { login: 'casey-kim' } });

    await deliver('check_run.completed.failure', 'check-1');
    pr = (await development()).repositories[0]!.pull_requests[0]!;
    expect(pr.ci_state).toBe('failing');
    expect((await development()).summary.rollup).toBe('ci_failing');

    const passed = fixtureBody('check_run.completed.failure');
    passed['check_run'].conclusion = 'success';
    passed['check_run'].completed_at = '2026-10-20T12:30:00Z';
    await deliver('check_run.completed.failure', 'check-2', passed);
    await deliver('status.success', 'status-1');
    pr = (await development()).repositories[0]!.pull_requests[0]!;
    expect(pr.ci_state).toBe('passing');
    expect(pr.ci_summary).toEqual({ success: 3 });

    const changes = await history(`${KEY}-7`, 'git_pr_changed');
    expect(changes.length).toBe(1);
    expect(changes[0]!.old_value).toMatchObject({ review: 'review_requested', ci: 'none' });
    expect(changes[0]!.new_value).toMatchObject({ review: 'approved', ci: 'passing' });
  });

  test('the pull request detail carries its checks, for readers of a linked issue only', async () => {
    const res = await w.call(w.observer, 'GET', '/v1/git/pull-requests/acme-inc%2Fweb/42');
    expect(res.statusCode).toBe(200);
    expect(
      res
        .json()
        .data.checks.map((c: { name: string }) => c.name)
        .sort(),
    ).toEqual(['ci/build', 'lint', 'test']);
    expect(res.json().data.issues).toEqual([`${KEY}-6`, `${KEY}-7`]);
    expect((await w.call(w.outsider, 'GET', '/v1/git/pull-requests/acme-inc%2Fweb/42')).statusCode).toBe(404);
  });

  test('merged: the merge commit is linked to every issue the pull request is, and the badge says merged', async () => {
    const merged = fixtureBody('pull_request.closed.merged');
    merged['pull_request'].head.sha = '0404040404040404040404040404040404040404';
    await deliver('pull_request.closed.merged', 'pr-merged', merged);
    const dev = await development();
    expect(dev.summary.rollup).toBe('merged');
    const commits = dev.repositories[0]!.commits;
    expect(commits.find(c => c.link?.sources.includes('merge_commit'))).toBeDefined();
    expect(
      (await development(`${KEY}-6`)).repositories[0]!.commits.some(c => c.link?.sources.includes('merge_commit')),
    ).toBe(true);
  });
});

describe('pushes', () => {
  test('a commit referencing an issue is linked by its message; a force push supersedes what it dropped', async () => {
    await deliver('push.feature', 'push-1');
    const repo = (await development(`${KEY}-7`)).repositories[0]!;
    const shown = [...repo.commits, ...repo.pull_requests.flatMap(p => p.commits)];
    expect(shown.find(c => c.short_sha === '0202020')!.link!.sources).toEqual(['commit_message']);
    expect(shown.map(c => c.short_sha)).not.toContain('0101010');

    w.provider.routes[
      `GET ${GITHUB_API}/repositories/101/compare/0404040404040404040404040404040404040404...0303030303030303030303030303030303030303`
    ] = { commits: [{ sha: '0303030303030303030303030303030303030303' }] };
    const forced = fixtureBody('push.forced');
    forced['before'] = '0303030303030303030303030303030303030303';
    forced['after'] = '0404040404040404040404040404040404040404';
    await deliver('push.forced', 'push-forced', forced);
    const after = await development(`${KEY}-7`);
    expect(after.repositories[0]!.pull_requests[0]!.commits.map(c => c.short_sha)).not.toContain('0303030');
  });
});

describe('linking by hand', () => {
  test('a contributor links a pull request by its URL; an observer cannot', async () => {
    const url = 'https://github.com/acme-inc/web/pull/42';
    expect((await w.call(w.observer, 'POST', `/v1/issues/${KEY}-3/development/links`, { url })).statusCode).toBe(403);
    const elsewhere = await w.call(w.contributor, 'POST', `/v1/issues/${KEY}-3/development/links`, {
      url: 'https://example.com/acme/web/pull/42',
    });
    expect(elsewhere.json().error).toMatchObject({ code: 'git.url_not_connected', field: 'url' });
    const notPull = await w.call(w.contributor, 'POST', `/v1/issues/${KEY}-3/development/links`, {
      url: 'https://github.com/acme-inc/web/issues/42',
    });
    expect(notPull.json().error.code).toBe('git.url_not_pull_request');

    const unlinkedRepo = await w.call(w.contributor, 'POST', `/v1/issues/${KEY}-3/development/links`, {
      url: 'https://github.com/acme-inc/secret/pull/1',
    });
    expect(unlinkedRepo.json().error.code).toBe('git.url_not_connected');

    const linked = await w.call(w.contributor, 'POST', `/v1/issues/${KEY}-3/development/links`, { url });
    expect(linked.statusCode).toBe(200);
    expect(linked.json().data.repositories[0].pull_requests[0].link.sources).toEqual(['manual']);
    const [entry] = await history(`${KEY}-3`, 'git_linked');
    expect(entry!.actor).toMatchObject({ name: 'Casey' });
    expect(entry!.actor.system).toBeUndefined();
  });

  test('an unlinked reference stays unlinked for the same source and comes back for a new one', async () => {
    const pr = (await development()).repositories[0]!.pull_requests[0]!;
    const res = await w.call(w.contributor, 'DELETE', `/v1/issues/${KEY}-7/development/links/${pr.link!.link_id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.repositories[0].pull_requests).toEqual([]);

    const again = fixtureBody('pull_request.edited');
    again['pull_request'].title = 'API-7: Fix login redirect';
    again['pull_request'].body = 'Fixes API-7';
    again['pull_request'].updated_at = '2026-10-22T09:00:00Z';
    again['pull_request'].merged = true;
    again['pull_request'].state = 'closed';
    again['pull_request'].head.sha = '0404040404040404040404040404040404040404';
    await deliver('pull_request.edited', 'pr-edited-3', again);
    expect((await development()).repositories[0]?.pull_requests ?? []).toEqual([]);

    w.provider.routes[`GET ${GITHUB_API}/repositories/101/pulls/42/commits`] = [
      apiCommit('0505050505050505050505050505050505050505', 'Follow-up for API-7'),
    ];
    const reopened = fixtureBody('pull_request.synchronize');
    reopened['pull_request'].head.sha = '0505050505050505050505050505050505050505';
    reopened['pull_request'].updated_at = '2026-10-22T10:00:00Z';
    await deliver('pull_request.synchronize', 'pr-sync-2', reopened);
    expect((await development()).repositories[0]!.pull_requests[0]!.link!.sources).toContain('pr_commits');
  });

  test('unlinking someone else’s link needs a contributor, and an unknown link is not found', async () => {
    expect((await w.call(w.observer, 'DELETE', `/v1/issues/${KEY}-3/development/links/1`)).statusCode).toBe(403);
    expect(
      (await w.call(w.contributor, 'DELETE', `/v1/issues/${KEY}-3/development/links/999999999`)).json().error.code,
    ).toBe('git.link_not_found');
  });
});

describe('backfill and upkeep', () => {
  test('linking with a backfill reads in recent pull requests and branches, and records progress', async () => {
    await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`);
    const pr = structuredClone(fixtureBody('pull_request.opened')['pull_request']);
    pr.number = 77;
    pr.title = 'API-4: Backfilled';
    pr.body = '';
    pr.head.ref = 'feat/old-work';
    w.provider.routes[`GET ${GITHUB_API}/repositories/101/pulls`] = [pr];
    w.provider.routes[`GET ${GITHUB_API}/repositories/101/pulls/77/commits`] = [];
    w.provider.routes[`GET ${GITHUB_API}/repositories/101/branches`] = [
      { name: 'api-2-cleanup', commit: { sha: '0909090909090909090909090909090909090909' } },
      { name: 'main', commit: { sha: '0808080808080808080808080808080808080808' } },
    ];
    const linked = await w.call(w.admin, 'PUT', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`, {});
    expect(linked.json().data.backfill.state).toBe('queued');
    await w.drain();
    const listed = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/repositories`)).json().data[0];
    expect(listed.backfill).toMatchObject({ state: 'done', pull_requests: 1, branches: 1 });
    expect((await development(`${KEY}-4`)).summary.pull_requests).toBe(1);
    expect((await development(`${KEY}-2`)).repositories[0]!.branches.map(b => b.name)).toEqual(['api-2-cleanup']);
    expect((await development(`${KEY}-2`)).summary.rollup).toBe('branch_active');
  });

  test('the nightly reconcile re-reads open pull requests', async () => {
    const pr = structuredClone(fixtureBody('pull_request.opened')['pull_request']);
    pr.number = 77;
    pr.title = 'API-4: Backfilled, renamed';
    pr.body = '';
    pr.updated_at = '2026-11-01T00:00:00Z';
    w.provider.routes[`GET ${GITHUB_API}/repositories/101/pulls/77`] = pr;
    await w.deliver('github', 'pull_request.opened', { delivery: 'touch-1' });
    await w.drain();
    expect(await w.app.jobHandlers['git.reconcile']()).toBeGreaterThan(0);
    const four = await development(`${KEY}-4`);
    expect(four.repositories[0]!.pull_requests[0]!.title).toBe('API-4: Backfilled, renamed');
  });

  test('git.purge keeps what is linked', async () => {
    await w.app.jobHandlers['git.purge'](new Date(Date.now() + 200 * 24 * 60 * 60 * 1000));
    expect((await development(`${KEY}-4`)).summary.pull_requests).toBe(1);
  });
});
