import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { issueWorld, type IssueWorld, type Member } from './issue-world.ts';
import { signUp, uniqueStamp, type Person } from './people.ts';

setDefaultTimeout(120_000);

const KEY = 'IDM';
const ALPHA_ONLY = 'IDA';
let w: IssueWorld;
let beta: string;
let adminPat: Person & { tokenId: number };

async function pat(who: Person): Promise<Person & { tokenId: number }> {
  const res = await w.call(who, 'POST', '/v1/me/tokens', {
    name: `idem-${uniqueStamp()}`,
    scopes: ['issues:read', 'issues:write'],
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  const data = res.json().data;
  return { email: who.email, sid: '', headers: { authorization: `Bearer ${data.token}` }, tokenId: data.id };
}

async function enter(who: Person, slug: string): Promise<void> {
  const res = await w.call(who, 'POST', '/v1/me/current-organization', { slug });
  if (res.statusCode !== 200) throw new Error(res.body);
}

const idempotencyKey = () => ({ 'idempotency-key': `k-${uniqueStamp()}` });

beforeAll(async () => {
  w = await issueWorld(KEY);
  beta = `${w.slug}-b`;
  const created = await w.call(w.admin, 'POST', '/v1/organizations', { name: 'Beta', slug: beta });
  if (created.statusCode !== 201) throw new Error(created.body);
  await enter(w.admin, beta);
  const betaProject = await w.call(w.admin, 'POST', '/v1/projects', { name: 'Beta Web', key: KEY });
  if (betaProject.statusCode !== 201) throw new Error(betaProject.body);
  await enter(w.admin, w.slug);
  const alphaOnly = await w.call(w.admin, 'POST', '/v1/projects', { name: 'Alpha Only', key: ALPHA_ONLY });
  if (alphaOnly.statusCode !== 201) throw new Error(alphaOnly.body);
  adminPat = await pat(w.admin);
});

afterAll(async () => {
  await w.close();
});

describe('08: the organisation is part of the idempotency key', () => {
  test('one PAT and one key under two X-Organization values runs both', async () => {
    const key = idempotencyKey();
    const body = { project: KEY, title: 'Filed once per organisation' };
    const alpha = await w.call(adminPat, 'POST', '/v1/issues', body, { ...key, 'x-organization': w.slug });
    const inBeta = await w.call(adminPat, 'POST', '/v1/issues', body, { ...key, 'x-organization': beta });

    expect(alpha.statusCode).toBe(201);
    expect(alpha.json().data.project.name).toBe('Acme Web');
    expect(inBeta.statusCode).toBe(201);
    expect(inBeta.headers['idempotent-replayed']).toBeUndefined();
    expect(inBeta.json().data.project.name).toBe('Beta Web');

    const again = await w.call(adminPat, 'POST', '/v1/issues', body, { ...key, 'x-organization': w.slug });
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.json().data.key).toBe(alpha.json().data.key);
    expect(again.json().data.project.name).toBe('Acme Web');
  });

  test('one session and one key across a switch of current organisation runs both', async () => {
    const key = idempotencyKey();
    const body = { project: KEY, title: 'Filed from the browser' };
    await enter(w.admin, w.slug);
    const alpha = await w.call(w.admin, 'POST', '/v1/issues', body, key);
    await enter(w.admin, beta);
    const inBeta = await w.call(w.admin, 'POST', '/v1/issues', body, key);
    await enter(w.admin, w.slug);
    const again = await w.call(w.admin, 'POST', '/v1/issues', body, key);

    expect(alpha.json().data.project.name).toBe('Acme Web');
    expect(inBeta.statusCode).toBe(201);
    expect(inBeta.headers['idempotent-replayed']).toBeUndefined();
    expect(inBeta.json().data.project.name).toBe('Beta Web');
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.json().data.key).toBe(alpha.json().data.key);
  });
});

async function invite(who: Person): Promise<void> {
  const link = (await w.call(w.admin, 'POST', `/v1/organizations/${w.slug}/invitations/links`, {})).json().data;
  const token = /\/invite\/(.+)$/.exec(link.url)![1];
  const res = await w.call(who, 'POST', '/v1/invitations/accept', { token });
  if (res.statusCode >= 300) throw new Error(res.body);
}

async function contributor(name: string): Promise<Member> {
  const person = await signUp(w.app, w.box, name);
  await invite(person);
  const username = (await w.call(person, 'GET', `/v1/organizations/${w.slug}`)).json().data.membership.username;
  await enter(w.admin, w.slug);
  const added = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/members`, { username, role: 'contributor' });
  if (added.statusCode >= 300) throw new Error(added.body);
  return { ...person, username };
}

async function remove(username: string): Promise<void> {
  const res = await w.call(w.admin, 'DELETE', `/v1/organizations/${w.slug}/members/${username}`);
  if (res.statusCode !== 200) throw new Error(res.body);
}

describe('09: a replay re-checks membership', () => {
  test('a PAT removed from the organisation gets 404, not the stored 201, and the entry survives', async () => {
    const member = await contributor('Leaving');
    const token = await pat(member);
    const headers = { ...idempotencyKey(), 'x-organization': w.slug };
    const body = { project: KEY, title: 'Filed before leaving' };
    const first = await w.call(token, 'POST', '/v1/issues', body, headers);
    expect(first.statusCode).toBe(201);

    await remove(member.username);
    const replay = await w.call(token, 'POST', '/v1/issues', body, headers);
    expect(replay.statusCode).toBe(404);
    expect(replay.json().error.code).toBe('organization.not_found');
    expect(replay.headers['idempotent-replayed']).toBeUndefined();

    const stored = await w.app.redis.get(`idem:t:${token.tokenId}:${w.slug}:${headers['idempotency-key']}`);
    expect(JSON.parse(stored!)).toMatchObject({ state: 'done', status: 201 });
  });

  test('a session acting in another organisation than its current one is refused after removal from it', async () => {
    const member = await contributor('Dropped');
    const raised = await w.call(w.admin, 'PATCH', `/v1/organizations/${w.slug}/members/${member.username}`, {
      org_role: 'org_admin',
    });
    expect(raised.statusCode).toBe(200);
    const side = await w.call(member, 'POST', '/v1/organizations', { name: 'Side', slug: `${w.slug}-s` });
    expect(side.statusCode).toBe(201);

    const headers = idempotencyKey();
    const change = { workday_minutes: 450 };
    const first = await w.call(member, 'PATCH', `/v1/organizations/${w.slug}`, change, headers);
    expect(first.statusCode).toBe(200);

    await remove(member.username);
    const replay = await w.call(member, 'PATCH', `/v1/organizations/${w.slug}`, change, headers);
    expect(replay.statusCode).toBe(404);
    expect(replay.json().error.code).toBe('organization.not_found');
    expect(replay.headers['idempotent-replayed']).toBeUndefined();
  });

  test('a PAT whose organisation came from the project key still replays', async () => {
    const headers = idempotencyKey();
    const body = { project: ALPHA_ONLY, title: 'Resolved by its project key' };
    const first = await w.call(adminPat, 'POST', '/v1/issues', body, headers);
    expect(first.statusCode).toBe(201);
    const again = await w.call(adminPat, 'POST', '/v1/issues', body, headers);
    expect(again.statusCode).toBe(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
  });

  test('a user-level change that acted in no organisation still replays', async () => {
    const headers = idempotencyKey();
    const first = await w.call(adminPat, 'PATCH', '/v1/me', { name: 'Alex Again' }, headers);
    expect(first.statusCode).toBe(200);
    const again = await w.call(adminPat, 'PATCH', '/v1/me', { name: 'Alex Again' }, headers);
    expect(again.statusCode).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
  });
});

describe('10: a replay re-checks project access', () => {
  test('a member removed from the project, not the organisation, gets 404 instead of the stored body', async () => {
    const member = await contributor('Unassigned');
    const token = await pat(member);
    const headers = { ...idempotencyKey(), 'x-organization': w.slug };
    const body = { project: KEY, title: 'Filed before losing the project' };
    const first = await w.call(token, 'POST', '/v1/issues', body, headers);
    expect(first.statusCode).toBe(201);
    const stored = await w.app.redis.get(`idem:t:${token.tokenId}:${w.slug}:${headers['idempotency-key']}`);
    expect(JSON.parse(stored!).projects).toHaveLength(1);

    const removed = await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/members/${member.username}`);
    expect(removed.statusCode).toBeLessThan(300);
    const replay = await w.call(token, 'POST', '/v1/issues', body, headers);
    expect(replay.statusCode).toBe(404);
    expect(replay.json().error.code).toBe('project.not_found');
    expect(replay.headers['idempotent-replayed']).toBeUndefined();
    expect(replay.body).not.toContain(first.json().data.key);
  });

  test('a member who keeps the project still replays', async () => {
    const member = await contributor('Staying');
    const token = await pat(member);
    const headers = { ...idempotencyKey(), 'x-organization': w.slug };
    const body = { project: KEY, title: 'Filed and still visible' };
    const first = await w.call(token, 'POST', '/v1/issues', body, headers);
    const again = await w.call(token, 'POST', '/v1/issues', body, headers);
    expect(again.statusCode).toBe(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.json().data.key).toBe(first.json().data.key);
  });
});
