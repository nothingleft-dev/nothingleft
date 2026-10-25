import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { gitlabProject, gitWorld, type GitWorld } from './git-world.ts';

const KEY = 'GC';
let w: GitWorld;
const connections = () => `/v1/organizations/${w.slug}/git/connections`;
const repositories = () => `/v1/organizations/${w.slug}/git/repositories`;
const TOKEN = 'glpat-super-secret-token';

beforeAll(async () => {
  w = await gitWorld(KEY, {
    gitResolveHost: async host => (host === 'gitlab.internal' ? ['10.0.0.8'] : ['93.184.216.34']),
  });
});

afterAll(async () => {
  await w.close();
});

describe('the provider catalogue', () => {
  test('any signed-in member reads it, with the wording and the ways to connect', async () => {
    const res = await w.call(w.observer, 'GET', '/v1/git/providers');
    expect(res.statusCode).toBe(200);
    const [github, gitlab] = res.json().data;
    expect(github).toMatchObject({
      kind: 'github',
      label: 'GitHub',
      pull_request_word: 'pull request',
      connect_kinds: ['app', 'manual'],
    });
    expect(gitlab).toMatchObject({
      kind: 'gitlab',
      label: 'GitLab',
      pull_request_word: 'merge request',
      connect_kinds: ['token'],
    });
    expect((await w.app.inject({ method: 'GET', url: '/v1/git/providers' })).statusCode).toBe(401);
  });

  test('without an app configured, GitHub connects in manual mode only', async () => {
    const plain = await gitWorld('GN', { withApp: false });
    const [github] = (await plain.call(plain.admin, 'GET', '/v1/git/providers')).json().data;
    expect(github).toMatchObject({ connect_kind: 'manual', connect_kinds: ['manual'] });
    const start = await plain.call(plain.admin, 'POST', `/v1/organizations/${plain.slug}/git/connect/github/start`);
    expect(start.json().error.code).toBe('git.app_not_configured');
    await plain.close();
  });
});

describe('connecting GitHub through the app', () => {
  test('Org Admins only, from a browser session', async () => {
    const url = `/v1/organizations/${w.slug}/git/connect/github/start`;
    expect((await w.call(w.projectAdmin, 'POST', url)).statusCode).toBe(403);
    expect((await w.call(w.contributor, 'POST', url)).statusCode).toBe(403);
    expect((await w.call(w.outsider, 'POST', url)).statusCode).toBe(404);
    const pat = await w.token(w.admin, ['admin:org']);
    expect((await w.call(pat, 'POST', url)).json().error.code).toBe('auth.session_required');
  });

  test('the install page is the app’s, and the state is bound to the browser', async () => {
    const start = await w.call(w.admin, 'POST', `/v1/organizations/${w.slug}/git/connect/github/start`);
    expect(start.json().data.install_url).toStartWith(
      'https://github.com/apps/nothing-left-test/installations/new?state=',
    );
    const state = start.cookies.find(c => c.name === 'git_connect_state')!.value;
    const forged = await w.call(w.admin, 'POST', '/v1/git/connect/github/callback', {
      state,
      code: 'c',
      installation_id: w.inst('5001'),
    });
    expect(forged.json().error.code).toBe('git.connect_state_invalid');
  });

  test('an installation the person cannot administer is refused', async () => {
    const res = await w.connectGitHub(w.admin, w.slug, '424242');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('git.installation_forbidden');
  });

  test('someone who can only read the installation at GitHub cannot connect it', async () => {
    w.installations.set(w.inst('6001'), { login: 'read-only-inc', repos: [], readOnly: true });
    const res = await w.connectGitHub(w.admin, w.slug, w.inst('6001'));
    expect(res.json().error.code).toBe('git.installation_forbidden');
  });

  test('the callback creates the connection, discovers its repositories and records it', async () => {
    const res = await w.connectGitHub(w.admin, w.slug, w.inst('5001'));
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      name: 'github:acme-inc',
      auth_kind: 'app_installation',
      health: 'active',
      webhook_url: null,
      repositories: { known: 1, linked: 0 },
    });
    const audit = await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity?kind=git_connection_created`);
    expect(audit.json().data[0]).toMatchObject({
      kind: 'git_connection_created',
      new_value: { connection: 'github:acme-inc' },
    });
    // Coming back after changing the installation's repositories updates the same connection.
    expect((await w.connectGitHub(w.admin, w.slug, w.inst('5001'))).json().data.name).toBe('github:acme-inc');
  });

  test('another organisation of the same company connects the same installation, and both get its deliveries', async () => {
    const res = await w.connectGitHub(w.outsider, `${w.slug}-x`, w.inst('5001'));
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ name: 'github:acme-inc', auth_kind: 'app_installation' });
    const delivered = await w.deliver('github', 'repository.renamed', { delivery: 'shared-1' });
    expect(delivered.statusCode).toBe(202);
    const logOf = async (who: typeof w.admin, slug: string) =>
      (await w.call(who, 'GET', `/v1/organizations/${slug}/git/events`, undefined, { 'x-organization': slug })).json()
        .data as { delivery_id: string }[];
    expect((await logOf(w.admin, w.slug)).some(e => e.delivery_id === 'shared-1')).toBe(true);
    expect((await logOf(w.outsider, `${w.slug}-x`)).some(e => e.delivery_id === 'shared-1')).toBe(true);
  });
});

describe('connecting GitLab with a token', () => {
  test('the check describes the account and saves nothing', async () => {
    const res = await w.call(w.admin, 'POST', connections(), {
      provider: 'gitlab',
      mode: 'token',
      token: TOKEN,
      dry_run: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      account: { login: 'acme' },
      repository_count: 1,
      token_expires_at: '2027-01-31T00:00:00.000Z',
    });
    const names = (await w.call(w.admin, 'GET', connections())).json().data.map((c: { name: string }) => c.name);
    expect(names).not.toContain('gitlab:acme');
  });

  test('a private network address, a wrong mode or a missing token is refused by field', async () => {
    const internal = await w.call(w.admin, 'POST', connections(), {
      provider: 'gitlab',
      mode: 'token',
      token: TOKEN,
      base_url: 'https://gitlab.internal',
    });
    expect(internal.json().error).toMatchObject({ code: 'git.base_url_not_allowed', field: 'base_url' });
    const manual = await w.call(w.admin, 'POST', connections(), {
      provider: 'gitlab',
      mode: 'manual',
      account: 'acme',
    });
    expect(manual.json().error).toMatchObject({ code: 'git.mode_unsupported', field: 'mode' });
    const bare = await w.call(w.admin, 'POST', connections(), { provider: 'gitlab', mode: 'token' });
    expect(bare.json().error).toMatchObject({ code: 'git.token_required', field: 'token' });
    const http = await w.call(w.admin, 'POST', connections(), {
      provider: 'gitlab',
      mode: 'token',
      token: TOKEN,
      base_url: 'http://gitlab.example.com',
    });
    expect(http.statusCode).toBe(400);
  });

  test('creating shows the webhook secret once and never the token', async () => {
    const res = await w.connectGitLab(w.admin, w.slug, TOKEN);
    expect(res.statusCode).toBe(201);
    const created = res.json().data;
    expect(created).toMatchObject({
      name: 'gitlab:acme',
      auth_kind: 'token',
      has_token: true,
      repositories: { known: 1 },
    });
    expect(created.webhook_secret).toMatch(/^[A-Za-z0-9]{40}$/);
    expect(created.webhook_url).toMatch(/\/v1\/git\/webhooks\/gitlab\/[A-Za-z0-9]{40}$/);
    expect(res.body).not.toContain(TOKEN);

    const listed = await w.call(w.admin, 'GET', connections());
    expect(listed.body).not.toContain(TOKEN);
    expect(listed.body).not.toContain(created.webhook_secret);
    const again = await w.connectGitLab(w.admin, w.slug, TOKEN);
    expect(again.json().error.code).toBe('git.connection_name_taken');
  });

  test('the free plan connects two accounts', async () => {
    const third = await w.call(w.admin, 'POST', connections(), {
      provider: 'github',
      mode: 'manual',
      account: 'third-inc',
    });
    expect(third.json().error.code).toBe('git.connection_limit_reached');
    // Plans are assigned by the operator; no route changes one.
    await (w.db as unknown as { $client: { query: (q: string, v: unknown[]) => Promise<unknown> } }).$client.query(
      'update organizations set plan = $1 where id = $2',
      ['unlimited', w.orgCtx.orgId],
    );
    const manual = await w.call(w.admin, 'POST', connections(), {
      provider: 'github',
      mode: 'manual',
      account: 'third-inc',
    });
    expect(manual.statusCode).toBe(201);
    expect(manual.json().data).toMatchObject({ name: 'github:third-inc', auth_kind: 'manual', has_token: false });
    expect(manual.json().data.webhook_secret).toBeDefined();
  });
});

describe('repositories', () => {
  test('Org Admins list all; a Project Admin lists for a project they administer; nobody else', async () => {
    const all = await w.call(w.admin, 'GET', repositories());
    expect(
      all
        .json()
        .data.map((r: { full_name: string }) => r.full_name)
        .sort(),
    ).toEqual(['acme-inc/web', 'acme/api']);
    expect(all.json().meta.pagination).toMatchObject({ total: 2, has_more: false });
    expect((await w.call(w.projectAdmin, 'GET', repositories())).json().error.code).toBe('git.project_required');
    expect((await w.call(w.projectAdmin, 'GET', `${repositories()}?project=${KEY}`)).statusCode).toBe(200);
    expect((await w.call(w.contributor, 'GET', `${repositories()}?project=${KEY}`)).statusCode).toBe(403);
    expect((await w.call(w.contributor, 'GET', repositories())).statusCode).toBe(403);
    const byConnection = await w.call(w.admin, 'GET', `${repositories()}?connection=gitlab:acme`);
    expect(byConnection.json().data.map((r: { full_name: string }) => r.full_name)).toEqual(['acme/api']);
  });

  test('linking a GitLab repository registers our hook; a second link is refused', async () => {
    const url = `/v1/projects/${KEY}/repositories/acme%2Fapi`;
    expect((await w.call(w.contributor, 'PUT', url, {})).statusCode).toBe(403);
    const linked = await w.call(w.projectAdmin, 'PUT', url, { merge_base_branches: ['main', 'release/*'] });
    expect(linked.statusCode).toBe(201);
    expect(linked.json().data).toMatchObject({
      full_name: 'acme/api',
      connection: 'gitlab:acme',
      webhook_status: 'active',
      merge_base_branches: ['main', 'release/*'],
      effective_merge_base_branches: ['main', 'release/*'],
      projects: [KEY],
      linked_by: { name: 'Sam' },
    });
    const hook = w.provider.calls.find(c => c.method === 'POST' && c.url.endsWith('/projects/202/hooks'))!;
    expect(hook.body).toMatchObject({ push_events: true, merge_requests_events: true });
    expect((hook.body as { url: string }).url).toContain('/v1/git/webhooks/gitlab/');

    expect((await w.call(w.projectAdmin, 'PUT', url, {})).json().error.code).toBe('git.repository_already_linked');
    const patched = await w.call(w.projectAdmin, 'PATCH', url, { merge_base_branches: null });
    expect(patched.json().data.effective_merge_base_branches).toEqual(['main']);
  });

  test('observers read the linked list; tokens manage with admin:project', async () => {
    const list = await w.call(w.observer, 'GET', `/v1/projects/${KEY}/repositories`);
    expect(list.json().data.map((r: { full_name: string }) => r.full_name)).toEqual(['acme/api']);
    const writer = await w.token(w.projectAdmin, ['issues:read', 'issues:write']);
    const res = await w.call(writer, 'PUT', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`, {});
    expect(res.json().error).toMatchObject({ code: 'token.scope_missing', scope: 'admin:project' });
  });

  test('a name in two connections must say which; a prefixed name links', async () => {
    w.gitlabProjects.push(gitlabProject(203, 'acme-inc/web'));
    await w.call(w.admin, 'POST', `${connections()}/gitlab:acme/refresh`);
    const ambiguous = await w.call(w.projectAdmin, 'PUT', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`, {});
    expect(ambiguous.json().error).toMatchObject({
      code: 'git.repository_ambiguous',
      field: 'connection',
      valid_values: ['github:acme-inc', 'gitlab:acme'],
    });
    const named = await w.call(w.projectAdmin, 'GET', `/v1/projects/${KEY}/repositories`);
    expect(named.statusCode).toBe(200);
    const prefixed = await w.call(
      w.projectAdmin,
      'PUT',
      `/v1/projects/${KEY}/repositories/github%3Aacme-inc%2Fweb`,
      {},
    );
    expect(prefixed.statusCode).toBe(201);
    expect(prefixed.json().data.webhook_status).toBe('not_applicable');
  });

  test('unlinking the last project removes our hook', async () => {
    const res = await w.call(w.projectAdmin, 'DELETE', `/v1/projects/${KEY}/repositories/acme%2Fapi`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((r: { full_name: string }) => r.full_name)).toEqual(['acme-inc/web']);
    expect(w.provider.calls.some(c => c.method === 'DELETE' && /\/projects\/202\/hooks\/\d+$/.test(c.url))).toBe(true);
    const missing = await w.call(w.projectAdmin, 'DELETE', `/v1/projects/${KEY}/repositories/acme%2Fapi`);
    expect(missing.json().error.code).toBe('git.repository_not_linked');
  });

  test('re-registering is for Org Admins; a manual connection cannot be re-registered by us', async () => {
    await w.call(w.projectAdmin, 'PUT', `/v1/projects/${KEY}/repositories/acme%2Fapi`, {});
    expect((await w.call(w.projectAdmin, 'POST', `${repositories()}/acme%2Fapi/rehook`)).statusCode).toBe(403);
    const rehooked = await w.call(w.admin, 'POST', `${repositories()}/gitlab%3Aacme%2Fapi/rehook`);
    expect(rehooked.json().data.webhook_status).toBe('active');
  });
});

describe('connection upkeep', () => {
  test('a refused token marks the connection failing and emails the admins once', async () => {
    const sent = w.box.sent.length;
    w.provider.routes['GET https://gitlab.com/api/v4/personal_access_tokens/self'] = { status: 401, body: {} };
    for (let i = 0; i < 2; i++) await w.call(w.admin, 'POST', `${connections()}/gitlab:acme/refresh`);
    const gitlab = (await w.call(w.admin, 'GET', connections()))
      .json()
      .data.find((c: { name: string }) => c.name === 'gitlab:acme');
    expect(gitlab).toMatchObject({ health: 'failing', last_error: 'token_invalid' });
    expect(w.box.sent.slice(sent).filter(m => m.subject === 'email.git_connection_attention.subject').length).toBe(1);
    w.provider.routes['GET https://gitlab.com/api/v4/personal_access_tokens/self'] = { id: 1, expires_at: null };
    const healed = await w.call(w.admin, 'POST', `${connections()}/gitlab:acme/refresh`);
    expect(healed.json().data.health).toBe('active');
  });

  test('rotating the secret shows the new one once and updates our hooks', async () => {
    const res = await w.call(w.admin, 'POST', `${connections()}/gitlab:acme/rotate-secret`);
    expect(res.statusCode).toBe(200);
    const secret = res.json().data.webhook_secret;
    const put = w.provider.calls.findLast(c => c.method === 'PUT' && /\/projects\/202\/hooks\/\d+$/.test(c.url))!;
    expect((put.body as { token: string }).token).toBe(secret);
    const app = await w.call(w.admin, 'POST', `${connections()}/github:acme-inc/rotate-secret`);
    expect(app.json().error.code).toBe('git.mode_unsupported');
  });

  test('disconnecting keeps the row, forgets the secrets and removes our hooks', async () => {
    expect((await w.call(w.contributor, 'DELETE', `${connections()}/gitlab:acme`)).statusCode).toBe(403);
    const res = await w.call(w.admin, 'DELETE', `${connections()}/gitlab:acme`);
    expect(res.json().data).toMatchObject({ name: 'gitlab:acme', health: 'disconnected', webhook_url: null });
    const [row] = (await w.repos.connections.list(w.orgCtx, { includeRevoked: true })).filter(
      c => c.provider === 'gitlab',
    );
    expect(row).toMatchObject({
      token_ciphertext: null,
      hook_secret_ciphertext: null,
      hook_id_hash: null,
      status: 'revoked',
    });
    expect((await w.call(w.admin, 'DELETE', `${connections()}/gitlab:acme`)).json().error.code).toBe(
      'git.connection_not_found',
    );
    const audit = await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity?kind=git_connection_removed`);
    expect(audit.json().data[0].new_value).toMatchObject({ connection: 'gitlab:acme' });
    // The repository stays linked, read-only.
    const linked = await w.call(w.observer, 'GET', `/v1/projects/${KEY}/repositories`);
    expect(linked.json().data.map((r: { full_name: string }) => r.full_name)).toContain('acme/api');
  });
});

describe('manual mode', () => {
  test('a webhook added by hand teaches us its repository; a wrong secret is counted and refused', async () => {
    const created = await w.call(w.admin, 'POST', connections(), {
      provider: 'github',
      mode: 'manual',
      account: 'hand-inc',
    });
    const { webhook_url, webhook_secret } = created.json().data;
    const bad = await w.deliver('github', 'push.feature', { hookUrl: webhook_url, secret: 'wrong', delivery: 'm-0' });
    expect(bad.statusCode).toBe(401);
    const ok = await w.deliver('github', 'push.feature', {
      hookUrl: webhook_url,
      secret: webhook_secret,
      delivery: 'm-1',
    });
    expect(ok.statusCode).toBe(202);
    await w.drain();
    const listed = await w.call(w.admin, 'GET', `${repositories()}?connection=github:hand-inc`);
    expect(listed.json().data.map((r: { full_name: string }) => r.full_name)).toEqual(['acme-inc/web']);
    const events = await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/git/events?connection=github:hand-inc`);
    expect(events.json().data[0]).toMatchObject({
      delivery_id: 'm-1',
      status: 'ignored',
      error: 'repository_not_linked',
    });
    const rehook = await w.call(w.admin, 'POST', `${repositories()}/acme-inc%2Fweb/rehook`);
    expect(rehook.statusCode).toBe(409);
  });
});
