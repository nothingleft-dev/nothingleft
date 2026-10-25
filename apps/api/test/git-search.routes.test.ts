import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { gitFixture } from './git-fixtures.ts';
import { gitWorld, type GitWorld } from './git-world.ts';

const KEY = 'API';
let w: GitWorld;

type Loose = Record<string, unknown>;

async function deliver(name: string, delivery: string, body?: Loose) {
  const res = await w.deliver('github', name, { delivery, ...(body ? { body } : {}) });
  expect(res.statusCode).toBe(202);
  await w.drain();
}

async function keys(q: string): Promise<string[]> {
  const res = await w.call(w.observer, 'GET', `/v1/issues?q=${encodeURIComponent(`project: ${KEY} ${q}`)}&limit=50`);
  if (res.statusCode !== 200) throw new Error(`${q}: ${res.statusCode} ${res.body}`);
  return (res.json().data as { key: string }[]).map(i => i.key).sort();
}

beforeAll(async () => {
  w = await gitWorld(KEY);
  for (let i = 1; i <= 8; i++) await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: `Issue ${i}` });
  expect((await w.connectGitHub(w.admin, w.slug, w.inst('5001'))).statusCode).toBe(200);
  await w.call(w.admin, 'PUT', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`, { backfill: false });
  w.provider.routes['GET https://api.github.com/repositories/101/pulls/42/commits'] = [];
  // API-7 gets a pull request; API-8 only a branch.
  await deliver('pull_request.opened', 'pr-open');
  const branch = structuredClone(gitFixture('github', 'create.branch').body) as Loose;
  branch['ref'] = 'feat/api-8-logout';
  await deliver('create.branch', 'branch-8', branch);
});

afterAll(async () => {
  await w.close();
});

describe('git attributes in the query language', () => {
  test('pull request, development, repository, branch and has', async () => {
    expect(await keys('pull request: Open')).toEqual([`${KEY}-7`]);
    expect(await keys('pull request: Merged')).toEqual([]);
    expect(await keys('pull request: {No pull request}')).not.toContain(`${KEY}-7`);
    expect(await keys('development: {In review}')).toEqual([`${KEY}-7`]);
    expect(await keys('development: {Branch active}')).toEqual([`${KEY}-8`]);
    expect(await keys('development: None')).not.toContain(`${KEY}-7`);
    expect(await keys('repository: acme-inc/web')).toEqual([`${KEY}-7`, `${KEY}-8`]);
    expect(await keys('repository: web')).toEqual([`${KEY}-7`, `${KEY}-8`]);
    expect(await keys('branch: logout')).toEqual([`${KEY}-8`]);
    expect(await keys('has: branch')).toEqual([`${KEY}-8`]);
    expect(await keys('has: {pull request}')).toEqual([`${KEY}-7`]);
    expect(await keys('has: -development')).toHaveLength(6);
  });

  test('the badge follows the pull request to merged', async () => {
    await deliver('pull_request.closed.merged', 'pr-merged');
    expect(await keys('development: Merged')).toEqual([`${KEY}-7`]);
    expect(await keys('pull request: Merged')).toEqual([`${KEY}-7`]);
  });

  test('a value that is no state is refused with the valid ones', async () => {
    const res = await w.call(w.observer, 'GET', `/v1/issues?q=${encodeURIComponent('pull request: Shipped')}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.valid_values).toEqual(['Open', 'Draft', 'Merged', 'Closed']);
  });

  test('suggestions offer the states and the linked repositories', async () => {
    const states = await w.call(
      w.observer,
      'GET',
      `/v1/search/suggest?q=${encodeURIComponent('development: ')}&caret=13`,
    );
    expect(states.statusCode).toBe(200);
    expect(JSON.stringify(states.json().data)).toContain('CI failing');
    const repos = await w.call(
      w.observer,
      'GET',
      `/v1/search/suggest?q=${encodeURIComponent('repository: we')}&caret=14`,
    );
    expect(JSON.stringify(repos.json().data)).toContain('acme-inc/web');
  });
});

describe('a project whose repositories were unlinked', () => {
  test('shows nothing from git in search, as on the issue', async () => {
    await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`);
    expect(await keys('development: Merged')).toEqual([]);
    expect(await keys('has: {pull request}')).toEqual([]);
    expect(await keys('development: None')).toHaveLength(8);
  });
});
