import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { gitFixture } from './git-fixtures.ts';
import { gitWorld, type GitWorld } from './git-world.ts';

const KEY = 'API';
let w: GitWorld;
type Loose = Record<string, unknown>;

const status = async (key: string) => (await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data.status.name;
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
  for (let i = 1; i <= 2; i++) await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: `Issue ${i}` });
  expect((await w.connectGitHub(w.admin, w.slug, w.inst('5001'))).statusCode).toBe(200);
  await w.call(w.admin, 'PUT', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`, { backfill: false });
});

afterAll(async () => {
  await w.close();
});

describe('a disconnect while a delivery waits on the provider', () => {
  test('wins: nothing the delivery would have changed is written after it', async () => {
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/automations`, {
      name: 'Start on PR',
      trigger: 'git.pull_request_opened',
      action: 'issue.set_status',
      action_params: { status: 'In Progress' },
    });
    const body = structuredClone(gitFixture('github', 'pull_request.opened').body) as Loose & {
      pull_request: Loose;
    };
    body.pull_request = { ...body.pull_request, number: 77, title: 'API-1: Late arrival', body: 'Fixes API-1' };
    w.provider.routes['GET https://api.github.com/repositories/101/pulls/77/commits'] = [];
    let disconnected = false;
    w.hooks.beforeFetch = async url => {
      if (disconnected || !url.includes('/pulls/77/commits')) return;
      disconnected = true;
      const res = await w.call(w.admin, 'DELETE', `/v1/organizations/${w.slug}/git/connections/github:acme-inc`);
      expect(res.statusCode).toBe(200);
    };
    await deliver('pull_request.opened', 'in-flight', body);
    w.hooks.beforeFetch = null;
    expect(disconnected).toBe(true);
    expect(await status(`${KEY}-1`)).toBe('Open');
    expect(await eventOf('in-flight')).toMatchObject({ status: 'ignored', error: 'connection_revoked' });
  });
});
