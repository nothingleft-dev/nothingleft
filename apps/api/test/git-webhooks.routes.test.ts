import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { organizationsRepository, systemContext, tenantContext, type TenantContext } from '@nothingleft/db';
import { gitFixture } from './git-fixtures.ts';
import { githubRepo, gitWorld, type GitWorld } from './git-world.ts';

const KEY = 'API';
let w: GitWorld;
let elsewhere: { slug: string; ctx: TenantContext };

const eventsOf = async (ctx: TenantContext) => (await w.repos.events.list(ctx, {}, { limit: 100, offset: 0 })).rows;

beforeAll(async () => {
  w = await gitWorld(KEY);
  // The outsider's own organisation also has a project API, an issue API-7 and a GitHub
  // installation whose repository carries the same provider id as Acme's.
  elsewhere = { slug: `${w.slug}-x`, ctx: tenantContext(1) };
  const org = await organizationsRepository(w.db).findBySlug(systemContext('test lookup'), elsewhere.slug);
  elsewhere.ctx = tenantContext(org!.id);
  w.installations.set(w.inst('5002'), { login: 'other-inc', repos: [githubRepo(101, 'other-inc/web')] });
  const headers = { 'x-organization': elsewhere.slug };
  await w.call(w.outsider, 'POST', '/v1/projects', { name: 'Other API', key: KEY }, headers);
  await w.call(w.outsider, 'POST', '/v1/issues', { project: KEY, title: 'Elsewhere one' }, headers);

  expect((await w.connectGitHub(w.admin, w.slug, w.inst('5001'))).statusCode).toBe(200);
  expect((await w.connectGitHub(w.outsider, elsewhere.slug, w.inst('5002'))).statusCode).toBe(200);
  expect((await w.call(w.admin, 'PUT', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`, {})).statusCode).toBe(201);
  const linked = await w.call(w.outsider, 'PUT', `/v1/projects/${KEY}/repositories/other-inc%2Fweb`, {}, headers);
  expect(linked.statusCode).toBe(201);
});

afterAll(async () => {
  await w.close();
});

describe('tenant isolation', () => {
  test("org A's delivery carrying API-7 is stored and applied in org A only", async () => {
    const before = (await eventsOf(elsewhere.ctx)).length;
    const res = await w.deliver('github', 'push.feature', { delivery: 'iso-1' });
    expect(res.statusCode).toBe(202);
    expect(res.json().data).toEqual({ accepted: true });
    await w.drain();

    const mine = await eventsOf(w.orgCtx);
    const pushed = mine.find(e => e.delivery_id === 'iso-1')!;
    expect(pushed.status).toBe('done');
    const [repo] = await w.repos.repositories.findByFullName(w.orgCtx, 'acme-inc/web', [pushed.connection_id]);
    expect(pushed.repository_id).toBe(repo!.id);

    expect((await eventsOf(elsewhere.ctx)).length).toBe(before);
    const theirs = (await w.repos.repositories.list(elsewhere.ctx, {}, { limit: 10, offset: 0 })).rows;
    expect(theirs.map(r => r.last_event_at)).toEqual([null]);
  });

  test("the other organisation's installation routes to the other organisation", async () => {
    const body = { ...gitFixture('github', 'push.feature').body, installation: { id: 5002 } };
    expect((await w.deliver('github', 'push.feature', { delivery: 'iso-2', body })).statusCode).toBe(202);
    expect((await eventsOf(elsewhere.ctx)).some(e => e.delivery_id === 'iso-2')).toBe(true);
    expect((await eventsOf(w.orgCtx)).some(e => e.delivery_id === 'iso-2')).toBe(false);
  });
});

describe('receiving', () => {
  test('a wrong signature is refused before anything is stored', async () => {
    const before = (await eventsOf(w.orgCtx)).length;
    const res = await w.deliver('github', 'push.feature', { delivery: 'bad-1', secret: 'not-the-secret' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('git.signature_invalid');
    expect((await eventsOf(w.orgCtx)).length).toBe(before);
  });

  test('an empty body is a refused signature, never a server error', async () => {
    const res = await w.app.inject({
      method: 'POST',
      url: '/v1/git/webhooks/github',
      headers: { 'x-github-event': 'push', 'x-github-delivery': 'empty-1', 'x-hub-signature-256': 'sha256=00' },
    });
    expect(res.statusCode).toBe(401);
  });

  test('a repeated delivery is acknowledged and stored once', async () => {
    await w.deliver('github', 'pull_request.opened', { delivery: 'dup-1' });
    const again = await w.deliver('github', 'pull_request.opened', { delivery: 'dup-1' });
    expect(again.statusCode).toBe(202);
    expect((await eventsOf(w.orgCtx)).filter(e => e.delivery_id === 'dup-1').length).toBe(1);
  });

  test('an installation nobody connected is acknowledged and dropped', async () => {
    const body = { ...gitFixture('github', 'push.feature').body, installation: { id: 9999 } };
    const res = await w.deliver('github', 'push.feature', { delivery: 'nobody-1', body });
    expect(res.statusCode).toBe(202);
    expect(res.json().data).toEqual({ accepted: false });
  });

  test('an unknown provider or hook answers 404', async () => {
    expect((await w.app.inject({ method: 'POST', url: '/v1/git/webhooks/svn', payload: '{}' })).statusCode).toBe(404);
    const hook = await w.app.inject({
      method: 'POST',
      url: `/v1/git/webhooks/gitlab/${'A'.repeat(40)}`,
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(hook.statusCode).toBe(404);
  });

  test('a body over the stored cap is kept trimmed and flagged', async () => {
    const fixture = gitFixture('github', 'push.feature').body as { commits: Record<string, unknown>[] };
    const padding = 'x'.repeat(20_000);
    const commits = Array.from({ length: 150 }, (_, i) => ({
      ...fixture.commits[0],
      id: `${i}`.padStart(40, '0'),
      added: [padding],
    }));
    await w.deliver('github', 'push.feature', { delivery: 'big-1', body: { ...fixture, commits } });
    const row = (await eventsOf(w.orgCtx)).find(e => e.delivery_id === 'big-1')!;
    expect(row.truncated).toBe(true);
    expect((row.payload as { commits: unknown[] }).commits.length).toBe(100);
  });
});

describe('applying', () => {
  test('a tag push is used for nothing', async () => {
    await w.deliver('github', 'push.tag', { delivery: 'tag-1' });
    await w.drain();
    expect((await eventsOf(w.orgCtx)).find(e => e.delivery_id === 'tag-1')).toMatchObject({
      status: 'ignored',
      error: 'event_unused',
    });
  });

  test('repositories added to and removed from the installation follow it', async () => {
    await w.deliver('github', 'installation_repositories.added', { delivery: 'inst-add-1' });
    await w.drain();
    const listed = await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/git/repositories`);
    const names = listed.json().data.map((r: { full_name: string }) => r.full_name);
    const added = gitFixture('github', 'installation_repositories.added').body as {
      repositories_added: { full_name: string }[];
    };
    for (const r of added.repositories_added) expect(names).toContain(r.full_name);

    await w.deliver('github', 'installation_repositories.removed', { delivery: 'inst-rm-1' });
    await w.drain();
    const removed = gitFixture('github', 'installation_repositories.removed').body as {
      repositories_removed: { full_name: string }[];
    };
    const after = await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/git/repositories`);
    const left = after.json().data.map((r: { full_name: string }) => r.full_name);
    for (const r of removed.repositories_removed) expect(left).not.toContain(r.full_name);
  });

  test('a rename is followed and a push to an unlinked repository is ignored', async () => {
    const renamed = gitFixture('github', 'repository.renamed').body as { repository: { full_name: string } };
    await w.deliver('github', 'repository.renamed', { delivery: 'rename-1' });
    await w.drain();
    const listed = await w.call(
      w.admin,
      'GET',
      `/v1/organizations/${w.slug}/git/repositories?q=${renamed.repository.full_name.split('/')[1]}`,
    );
    expect(listed.json().data.map((r: { full_name: string }) => r.full_name)).toContain(renamed.repository.full_name);
    await w.call(
      w.admin,
      'DELETE',
      `/v1/projects/${KEY}/repositories/${encodeURIComponent(renamed.repository.full_name)}`,
    );

    await w.deliver('github', 'push.feature', { delivery: 'unlinked-1' });
    await w.drain();
    expect((await eventsOf(w.orgCtx)).find(e => e.delivery_id === 'unlinked-1')).toMatchObject({
      status: 'ignored',
      error: 'repository_not_linked',
    });
    await w.call(
      w.admin,
      'PUT',
      `/v1/projects/${KEY}/repositories/${encodeURIComponent(renamed.repository.full_name)}`,
      {},
    );
  });

  test('a suspended installation flags the connection and emails the admins once', async () => {
    const sent = w.box.sent.length;
    await w.deliver('github', 'installation.suspend', { delivery: 'susp-1' });
    await w.deliver('github', 'installation.suspend', { delivery: 'susp-2' });
    await w.drain();
    const [connection] = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/git/connections`)).json().data;
    expect(connection).toMatchObject({ health: 'suspended', last_error: 'suspended' });
    const mails = w.box.sent.slice(sent).filter(m => m.subject === 'email.git_connection_attention.subject');
    expect(mails.length).toBe(1);
    expect(mails[0]!.to).toBe(w.admin.email);
    await w.repos.connections.transition(
      w.orgCtx,
      (await w.repos.connections.list(w.orgCtx))[0]!.id,
      ['suspended'],
      { status: 'active', last_error: null },
      new Date(),
    );
  });
});

describe('the delivery log', () => {
  test('only Org Admins read it; a replay applies the event again', async () => {
    const url = `/v1/organizations/${w.slug}/git/events`;
    expect((await w.call(w.contributor, 'GET', url)).statusCode).toBe(403);
    expect((await w.call(w.outsider, 'GET', url)).statusCode).toBe(404);
    const reader = await w.token(w.admin, ['admin:project']);
    expect((await w.call(reader, 'GET', url)).json().error.code).toBe('token.scope_missing');

    const listed = await w.call(w.admin, 'GET', `${url}?status=ignored&limit=5`);
    expect(listed.statusCode).toBe(200);
    expect(listed.json().meta.pagination.limit).toBe(5);
    const tag = listed.json().data.find((e: { delivery_id: string }) => e.delivery_id === 'tag-1');
    expect(tag).toMatchObject({ connection: 'github:acme-inc', event: 'push', status: 'ignored' });

    const detail = await w.call(w.admin, 'GET', `${url}/${tag.id}`);
    expect(detail.json().data.payload).toBeDefined();
    const replayed = await w.call(w.admin, 'POST', `${url}/${tag.id}/replay`, { run_automations: true });
    expect(replayed.statusCode).toBe(202);
    expect(replayed.json().data).toMatchObject({ status: 'pending', run_automations: true, attempts: 0 });
    await w.drain();
    expect((await w.call(w.admin, 'GET', `${url}/${tag.id}`)).json().data.status).toBe('ignored');
    expect((await w.call(w.admin, 'GET', `${url}/999999999`)).json().error.code).toBe('git.event_not_found');
  });

  test('git.purge forgets deliveries older than seven days', async () => {
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await w.app.jobHandlers['git.purge'](later)).toBeGreaterThan(0);
    expect(await eventsOf(w.orgCtx)).toEqual([]);
  });
});
