import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { issueWorld, type IssueWorld, type Member } from './issue-world.ts';

setDefaultTimeout(120_000);

const KEY = 'PJ';
let w: IssueWorld;

beforeAll(async () => {
  w = await issueWorld(KEY);
});

afterAll(async () => {
  await w.close();
});

const bearer = (token: string) => ({ email: '', sid: '', headers: { authorization: `Bearer ${token}` } });
const keysOf = (res: { json: () => { data: { key: string }[] } }) => res.json().data.map(p => p.key);

async function tokenFor(who: Member, project_keys?: string[]) {
  const res = await w.call(who, 'POST', '/v1/me/tokens', {
    name: 'CI',
    scopes: ['issues:read'],
    ...(project_keys ? { project_keys } : {}),
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().data as { id: number; token: string; project_keys: string[] | null };
}

async function deleteProject(key: string) {
  await w.db.execute(`delete from projects where org_id = ${w.repos.ctx.orgId} and key = '${key}'`);
}

describe('project-restricted tokens', () => {
  test('a token restricted to a project that is then deleted reaches no project, never every one', async () => {
    expect((await w.call(w.admin, 'POST', '/v1/projects', { name: 'Doomed', key: 'PJX' })).statusCode).toBe(201);
    const pat = await tokenFor(w.admin, ['PJX']);
    expect(pat.project_keys).toEqual(['PJX']);
    expect(keysOf(await w.call(bearer(pat.token), 'GET', '/v1/projects'))).toEqual(['PJX']);

    await deleteProject('PJX');

    expect((await w.call(bearer(pat.token), 'GET', '/v1/projects')).json().data).toEqual([]);
    expect((await w.call(bearer(pat.token), 'GET', `/v1/projects/${KEY}`)).statusCode).toBe(404);
    expect((await w.call(bearer(pat.token), 'GET', '/v1/me')).json().data.token.project_keys).toEqual([]);
    const listed = (await w.call(w.admin, 'GET', '/v1/me/tokens')).json().data as {
      id: number;
      project_keys: string[] | null;
    }[];
    expect(listed.find(t => t.id === pat.id)?.project_keys).toEqual([]);
  });

  test('an empty project_keys list makes an unrestricted token, as before', async () => {
    const pat = await tokenFor(w.admin, []);
    expect(pat.project_keys).toBeNull();
    expect(keysOf(await w.call(bearer(pat.token), 'GET', '/v1/projects'))).toContain(KEY);
  });

  test('a key named twice restricts the token to that project once', async () => {
    const pat = await tokenFor(w.admin, [KEY, KEY]);
    expect(pat.project_keys).toEqual([KEY]);
    expect(keysOf(await w.call(bearer(pat.token), 'GET', '/v1/projects'))).toEqual([KEY]);
  });

  test('the removal preview counts the tokens that reach the organisation, not an emptied one', async () => {
    expect((await w.call(w.admin, 'POST', '/v1/projects', { name: 'Brief', key: 'PJY' })).statusCode).toBe(201);
    await tokenFor(w.contributor, [KEY]);
    await tokenFor(w.contributor);
    await tokenFor(w.contributor, ['PJY']);
    const preview = () =>
      w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/members/${w.contributor.username}/removal`);
    expect((await preview()).json().data.access_tokens).toBe(3);

    await deleteProject('PJY');

    expect((await preview()).json().data.access_tokens).toBe(2);
  });
});
