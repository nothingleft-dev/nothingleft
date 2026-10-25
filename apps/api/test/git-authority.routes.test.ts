import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { RecordingQueue } from '@lib/jobs';
import { gitFixture } from './git-fixtures.ts';
import { gitWorld, type GitWorld } from './git-world.ts';

const KEY = 'API';
let w: GitWorld;
type Loose = Record<string, unknown>;

const status = async (key: string) => (await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data.status.name;
const repoPath = (key: string) => `/v1/projects/${key}/repositories/acme-inc%2Fweb`;
const branch = (ref: string) => {
  const body = structuredClone(gitFixture('github', 'create.branch').body) as Loose;
  body['ref'] = ref;
  return body;
};
async function deliver(name: string, delivery: string, body?: Loose) {
  const res = await w.deliver('github', name, { delivery, ...(body ? { body } : {}) });
  expect(res.statusCode).toBe(202);
  await w.drain();
}
const eventOf = async (delivery: string) =>
  (
    (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/git/events?limit=100`)).json().data as {
      delivery_id: string;
      status: string;
      error: string | null;
    }[]
  ).find(e => e.delivery_id === delivery);

beforeAll(async () => {
  w = await gitWorld(KEY);
  for (let i = 1; i <= 8; i++) await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: `Issue ${i}` });
  await w.call(w.admin, 'POST', '/v1/projects', { name: 'Security', key: 'SEC' });
  await w.call(w.admin, 'POST', '/v1/issues', { project: 'SEC', title: 'Private' });
  expect((await w.connectGitHub(w.admin, w.slug, w.inst('5001'))).statusCode).toBe(200);
  expect((await w.call(w.admin, 'PUT', repoPath(KEY), { backfill: false })).statusCode).toBe(201);
  w.provider.routes['GET https://api.github.com/repositories/101/pulls/42/commits'] = [];
  await w.call(w.admin, 'POST', `/v1/projects/${KEY}/automations`, {
    name: 'Start work',
    trigger: 'git.branch_created',
    action: 'issue.set_status',
    action_params: { status: 'In Progress' },
  });
});

afterAll(async () => {
  await w.close();
});

describe("a repository's shared settings", () => {
  test('a Project Admin of one project cannot make the repository match every project', async () => {
    const res = await w.call(w.projectAdmin, 'PATCH', repoPath(KEY), { match_all_projects: true });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: 'git.repository_shared', field: 'match_all_projects' });
  });

  test("its branches are the Project Admin's while only their project uses it, an Org Admin's after", async () => {
    expect(
      (await w.call(w.projectAdmin, 'PATCH', repoPath(KEY), { merge_base_branches: ['main', 'release/*'] })).statusCode,
    ).toBe(200);
    expect((await w.call(w.admin, 'PUT', repoPath('SEC'), { backfill: false })).statusCode).toBe(201);
    const shared = await w.call(w.projectAdmin, 'PATCH', repoPath(KEY), { merge_base_branches: ['*'] });
    expect(shared.json().error).toMatchObject({ code: 'git.repository_shared', field: 'merge_base_branches' });
    expect((await w.call(w.admin, 'PATCH', repoPath(KEY), { merge_base_branches: ['main'] })).statusCode).toBe(200);
    await w.call(w.admin, 'DELETE', repoPath('SEC'));
  });
});

describe('authority that has gone stops automations', () => {
  test('a link kept after the repository left its project changes nothing there', async () => {
    await deliver('pull_request.opened', 'open-42');
    const linked = await w.call(w.contributor, 'POST', `/v1/issues/${KEY}-4/development/links`, {
      url: 'https://github.com/acme-inc/web/pull/42',
    });
    expect(linked.statusCode).toBe(200);
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/automations`, {
      name: 'Close on merge',
      trigger: 'git.pull_request_merged',
      conditions: { intent: ['closes', 'mention'] },
      action: 'issue.set_status',
      action_params: { status: 'Fixed' },
    });
    await w.call(w.admin, 'PUT', repoPath('SEC'), { backfill: false });
    await w.call(w.admin, 'DELETE', repoPath(KEY));
    await deliver('pull_request.closed.merged', 'merged-after-unlink');
    expect(await status(`${KEY}-4`)).toBe('Open');
    // History stays: the issue still shows the pull request it was linked to.
    const dev = (await w.call(w.admin, 'GET', `/v1/issues/${KEY}-4/development`)).json().data;
    expect(dev.git_enabled).toBe(false);
    await w.call(w.admin, 'DELETE', repoPath('SEC'));
    await w.call(w.admin, 'PUT', repoPath(KEY), { backfill: false });
  });

  test('a repository the installation no longer covers feeds nothing', async () => {
    const removed = structuredClone(gitFixture('github', 'installation_repositories.removed').body) as Loose & {
      repositories_removed: Loose[];
    };
    removed.repositories_removed = removed.repositories_removed.map(r => ({
      ...r,
      id: 101,
      full_name: 'acme-inc/web',
    }));
    await deliver('installation_repositories.removed', 'repo-removed', removed);
    await deliver('create.branch', 'after-removal', branch('feat/api-2-x'));
    expect(await status(`${KEY}-2`)).toBe('Open');
    expect(await eventOf('after-removal')).toMatchObject({ status: 'ignored', error: 'repository_removed' });
  });

  test('a suspended installation feeds nothing', async () => {
    await deliver('installation.suspend', 'suspended');
    await deliver('create.branch', 'after-suspend', branch('feat/api-3-x'));
    expect(await status(`${KEY}-3`)).toBe('Open');
    expect(await eventOf('after-suspend')).toMatchObject({ status: 'ignored', error: 'connection_suspended' });
  });
});

describe('a delivery whose queueing failed', () => {
  test("the provider's retry schedules it, and the hourly sweep finds one nobody retried", async () => {
    const queue = w.app.jobQueue as RecordingQueue;
    const send = queue.send;
    queue.send = async () => {
      throw new Error('queue down');
    };
    const first = await w.deliver('github', 'create.branch', { delivery: 'lost-1', body: branch('feat/api-5-x') });
    expect(first.statusCode).toBe(500);
    queue.send = send;
    expect((await eventOf('lost-1'))?.status).toBe('pending');
    const retry = await w.deliver('github', 'create.branch', { delivery: 'lost-1', body: branch('feat/api-5-x') });
    expect(retry.statusCode).toBe(202);
    expect(queue.pending.some(j => j.name === 'git.process_events')).toBe(true);

    queue.pending.splice(0);
    const later = new Date(Date.now() + 20 * 60_000);
    expect(await w.app.jobHandlers['git.recover'](later)).toBeGreaterThan(0);
    expect(queue.pending.some(j => j.name === 'git.process_events')).toBe(true);
  });
});
