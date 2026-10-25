import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { gitWorld, type GitWorld } from './git-world.ts';

const KEY = 'API';
let w: GitWorld;
let hook: { url: string; secret: string };

const deliver = async (name: string, delivery: string) => {
  const res = await w.deliver('gitlab', name, { hookUrl: hook.url, secret: hook.secret, delivery });
  expect(res.statusCode).toBe(202);
  await w.drain();
};

beforeAll(async () => {
  w = await gitWorld(KEY);
  for (let i = 1; i <= 8; i++) await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: `Issue ${i}` });
  const created = (await w.connectGitLab(w.admin, w.slug)).json().data;
  hook = { url: created.webhook_url, secret: created.webhook_secret };
  await w.call(w.admin, 'PUT', `/v1/projects/${KEY}/repositories/acme%2Fapi`, { backfill: false });
  w.provider.routes['GET https://gitlab.com/api/v4/projects/202/merge_requests/12/commits'] = [
    {
      id: 'b2c3d4e5b2c3d4e5b2c3d4e5b2c3d4e5b2c3d4e5',
      message: 'API-7: Fix login',
      author_name: 'Alex Lee',
      author_email: 'alex@acme.example',
      committed_date: '2026-10-25T09:00:00Z',
      authored_date: '2026-10-25T09:00:00Z',
      web_url: 'https://gitlab.com/acme/api/-/commit/b2c3d4e5b2c3d4e5b2c3d4e5b2c3d4e5b2c3d4e5',
    },
  ];
});

afterAll(async () => {
  await w.close();
});

describe('a GitLab merge request', () => {
  test('opened, piped, approved and merged, in the same shapes as GitHub', async () => {
    await deliver('merge_request.open', 'mr-open');
    let dev = (await w.call(w.observer, 'GET', `/v1/issues/${KEY}-7/development`)).json().data;
    const [mr] = dev.repositories[0].pull_requests;
    expect(mr).toMatchObject({ ref: 'acme/api#12', state: 'open', repository: { provider: 'gitlab' } });
    expect(mr.link.intent).toBe('closes');

    await deliver('pipeline.failed', 'pipe-1');
    dev = (await w.call(w.observer, 'GET', `/v1/issues/${KEY}-7/development`)).json().data;
    expect(dev.repositories[0].pull_requests[0].ci_state).toBe('failing');
    expect(dev.summary.rollup).toBe('ci_failing');

    await deliver('merge_request.approved', 'mr-approved');
    await deliver('merge_request.merge', 'mr-merge');
    dev = (await w.call(w.observer, 'GET', `/v1/issues/${KEY}-7/development`)).json().data;
    expect(dev.repositories[0].pull_requests[0].state).toBe('merged');
    expect(dev.summary.rollup).toBe('merged');

    const list = (await w.call(w.admin, 'GET', `/v1/issues?project=${KEY}&limit=20`)).json().data;
    expect(list.find((i: { key: string }) => i.key === `${KEY}-7`).development.rollup).toBe('merged');
    expect(list.find((i: { key: string }) => i.key === `${KEY}-1`).development.rollup).toBe('none');
  });

  test('GitLab does not say a push was forced, so a push to a stored branch is compared', async () => {
    w.provider.routes['GET https://gitlab.com/api/v4/projects/202/repository/compare'] = { commits: [] };
    await deliver('push.branch_created', 'push-created');
    const before = w.provider.calls.filter(c => c.url.includes('/repository/compare')).length;
    await deliver('push.feature', 'push-again');
    expect(w.provider.calls.filter(c => c.url.includes('/repository/compare')).length).toBe(before + 1);
  });

  test('a project with no linked repository shows nothing git-related', async () => {
    await w.call(w.admin, 'POST', '/v1/projects', { name: 'Plain', key: 'PLN' });
    await w.call(w.admin, 'POST', '/v1/issues', { project: 'PLN', title: 'Nothing here' });
    const issue = (await w.call(w.admin, 'GET', '/v1/issues/PLN-1')).json().data;
    expect(issue.project.git_enabled).toBe(false);
    expect(issue.development).toBeNull();
    const dev = (await w.call(w.admin, 'GET', '/v1/issues/PLN-1/development')).json().data;
    expect(dev).toMatchObject({ git_enabled: false, repositories: [] });
  });
});
