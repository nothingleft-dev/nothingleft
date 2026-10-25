import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { gitWorld, type GitWorld } from './git-world.ts';

const KEY = 'API';
let w: GitWorld;

const org = async (who = w.observer) =>
  (
    (await w.call(who, 'GET', '/v1/organizations')).json().data as {
      slug: string;
      git_connected: boolean;
      git_enabled: boolean;
    }[]
  ).find(o => o.slug === w.slug)!;
const project = async (key: string, who = w.observer) =>
  (await w.call(who, 'GET', `/v1/projects/${key}`)).json().data as { git_enabled: boolean };

beforeAll(async () => {
  w = await gitWorld(KEY);
  await w.call(w.admin, 'POST', '/v1/projects', { name: 'Elsewhere', key: 'ELS' });
});

afterAll(async () => {
  await w.close();
});

describe('git visibility flags', () => {
  test('off until a connection exists, then a repository is linked', async () => {
    expect(await org()).toMatchObject({ git_connected: false, git_enabled: false });
    expect((await project(KEY)).git_enabled).toBe(false);

    expect((await w.connectGitHub(w.admin, w.slug, w.inst('5001'))).statusCode).toBe(200);
    expect(await org()).toMatchObject({ git_connected: true, git_enabled: false });

    await w.call(w.admin, 'PUT', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`, { backfill: false });
    expect(await org()).toMatchObject({ git_connected: true, git_enabled: true });
    expect((await project(KEY)).git_enabled).toBe(true);
    expect((await project('ELS', w.admin)).git_enabled).toBe(false);
    const listed = (await w.call(w.admin, 'GET', '/v1/projects')).json().data as {
      key: string;
      git_enabled: boolean;
    }[];
    expect(listed.find(p => p.key === KEY)?.git_enabled).toBe(true);
  });

  test('git_enabled counts only projects the caller can read', async () => {
    await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`);
    await w.call(w.admin, 'PUT', `/v1/projects/ELS/repositories/acme-inc%2Fweb`, { backfill: false });
    expect((await org(w.admin)).git_enabled).toBe(true);
    // The observer is a member of API only.
    expect((await org(w.observer)).git_enabled).toBe(false);
  });
});
