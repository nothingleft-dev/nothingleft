import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { gitConnectionsRepository } from '@nothingleft/db';
import { runQueued, type RecordingQueue } from '@lib/jobs';
import { gitFixture } from './git-fixtures.ts';
import { gitWorld, type GitWorld } from './git-world.ts';

const KEY = 'API';
let w: GitWorld;
// Provider logins and emails are global; unique per run so the test database can outlive a run.
const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const login = `casey-${stamp}`;
const email = `casey-${stamp}@commits.example`;

type Loose = Record<string, unknown>;

async function drain() {
  const queue = w.app.jobQueue as RecordingQueue;
  for (let i = 0; i < 5 && queue.pending.length; i++) {
    for (const job of queue.pending.splice(0)) await runQueued(w.app.queuedHandlers, job);
  }
}

const author = async () =>
  (await w.call(w.admin, 'GET', `/v1/issues/${KEY}-7/development`)).json().data.repositories[0].pull_requests[0]
    .author as { member: { username: string } | null; login: string };

beforeAll(async () => {
  w = await gitWorld(KEY);
  for (let i = 1; i <= 8; i++) await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: `Issue ${i}` });
  expect((await w.connectGitHub(w.admin, w.slug, w.inst('5001'))).statusCode).toBe(200);
  await w.call(w.admin, 'PUT', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`, { backfill: false });
  w.provider.routes['GET https://api.github.com/repositories/101/pulls/42/commits'] = [];
  // A pull request by someone the server cannot place: no provider id it knows, a login nobody claimed.
  const body = structuredClone(gitFixture('github', 'pull_request.opened').body) as Loose & {
    pull_request: Loose & { user: Loose };
  };
  body.pull_request.user = { ...body.pull_request.user, login, id: 777_000_001 };
  const res = await w.deliver('github', 'pull_request.opened', { delivery: `id-${stamp}`, body });
  expect(res.statusCode).toBe(202);
  await w.drain();
});

afterAll(async () => {
  await w.close();
});

describe('git identities', () => {
  test('a login claim counts at once and attributes what that login already wrote', async () => {
    expect((await author()).member).toBeNull();
    const claimed = await w.call(w.contributor, 'POST', '/v1/me/git-identities', { provider: 'github', login });
    expect(claimed.statusCode).toBe(201);
    expect(claimed.json().data).toEqual([
      expect.objectContaining({ provider: 'github', base_url: 'https://github.com', login, pending: false }),
    ]);
    await drain();
    expect((await author()).member?.username).toBe(w.contributor.username);

    const taken = await w.call(w.observer, 'POST', '/v1/me/git-identities', { provider: 'github', login });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('git.identity_taken');
  });

  test('an email claim waits for its link; the link verifies it once', async () => {
    const res = await w.call(w.contributor, 'POST', '/v1/me/git-identities', { provider: 'github', email });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.find((i: { email: string | null }) => i.email === email)).toMatchObject({ pending: true });
    const token = w.box.tokenFor(email, 'email.git_identity_verify.subject');
    expect(token).not.toBe('');
    const confirmed = await w.app.inject({ method: 'POST', url: '/v1/git/identities/confirm', payload: { token } });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().data).toMatchObject({ email, pending: false, verified_by: 'email' });
    const again = await w.app.inject({ method: 'POST', url: '/v1/git/identities/confirm', payload: { token } });
    expect(again.statusCode).toBe(400);
  });

  test("the account's own verified address needs no link", async () => {
    const before = w.box.sent.length;
    const res = await w.call(w.observer, 'POST', '/v1/me/git-identities', {
      provider: 'gitlab',
      email: w.observer.email,
    });
    expect(res.json().data[0]).toMatchObject({ pending: false, base_url: 'https://gitlab.com' });
    expect(w.box.sent.length).toBe(before);
  });

  test('login or email, never both or neither', async () => {
    expect((await w.call(w.observer, 'POST', '/v1/me/git-identities', { provider: 'github' })).statusCode).toBe(400);
    expect(
      (
        await w.call(w.observer, 'POST', '/v1/me/git-identities', {
          provider: 'github',
          login: 'x',
          email: 'x@y.example',
        })
      ).statusCode,
    ).toBe(400);
  });

  test('an Org Admin sees members’ identities and removes a wrong one; what it attributed goes back', async () => {
    expect((await w.call(w.contributor, 'GET', `/v1/organizations/${w.slug}/git/identities`)).statusCode).toBe(403);
    const listed = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/git/identities`)).json().data as {
      id: number;
      login: string | null;
      member: { username: string };
    }[];
    const claim = listed.find(i => i.login === login)!;
    expect(claim.member.username).toBe(w.contributor.username);
    const removed = await w.call(w.admin, 'DELETE', `/v1/organizations/${w.slug}/git/identities/${claim.id}`);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data.some((i: { login: string | null }) => i.login === login)).toBe(false);
    expect((await author()).member).toBeNull();
  });

  test('an Org Admin cannot remove a verified email, and pending ones are not shown', async () => {
    const listed = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/git/identities`)).json().data as {
      id: number;
      email: string | null;
      pending: boolean;
    }[];
    expect(listed.every(i => !i.pending)).toBe(true);
    const verified = listed.find(i => i.email === email)!;
    expect(
      (await w.call(w.admin, 'DELETE', `/v1/organizations/${w.slug}/git/identities/${verified.id}`)).statusCode,
    ).toBe(404);
  });

  test('asking again within ten minutes sends no second link', async () => {
    const other = `again-${stamp}@commits.example`;
    const sent = () => w.box.sent.filter(m => m.to === other).length;
    await w.call(w.contributor, 'POST', '/v1/me/git-identities', { provider: 'github', email: other });
    await w.call(w.contributor, 'POST', '/v1/me/git-identities', { provider: 'github', email: other });
    expect(sent()).toBe(1);
  });

  test('a person removes their own, and only their own', async () => {
    const mine = (await w.call(w.contributor, 'GET', '/v1/me/git-identities')).json().data as { id: number }[];
    expect((await w.call(w.observer, 'DELETE', `/v1/me/git-identities/${mine[0]!.id}`)).statusCode).toBe(404);
    const left = await w.call(w.contributor, 'DELETE', `/v1/me/git-identities/${mine[0]!.id}`);
    expect(left.json().data).toHaveLength(mine.length - 1);
  });
});

describe('token expiry', () => {
  test('Org Admins are warned once a week ahead, then told when it expires', async () => {
    expect((await w.connectGitLab(w.admin, w.slug)).statusCode).toBe(201);
    const repo = gitConnectionsRepository(w.db);
    const gitlab = (await repo.list(w.orgCtx)).find(c => c.provider === 'gitlab')!;
    const now = new Date();
    await repo.update(w.orgCtx, gitlab.id, { token_expires_at: new Date(now.getTime() + 3 * 86_400_000) }, now);
    const warnings = () => w.box.sent.filter(m => m.subject === 'email.git_token_expiring.subject').length;

    await w.app.jobHandlers['git.token_expiry'](now);
    const first = warnings();
    expect(first).toBeGreaterThan(0);
    await w.app.jobHandlers['git.token_expiry'](now);
    expect(warnings()).toBe(first);
    let listed = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/git/connections`)).json().data;
    expect(listed.find((c: { provider: string }) => c.provider === 'gitlab').health).toBe('expiring');

    await w.app.jobHandlers['git.token_expiry'](new Date(now.getTime() + 4 * 86_400_000));
    listed = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/git/connections`)).json().data;
    expect(listed.find((c: { provider: string }) => c.provider === 'gitlab').health).toBe('token_expired');
    expect(w.box.sent.some(m => m.subject === 'email.git_connection_attention.subject')).toBe(true);
  });
});
