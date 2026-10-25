import { generateKeyPairSync } from 'node:crypto';
import {
  gitConnectionsRepository,
  gitEventsRepository,
  gitRepositoriesRepository,
  organizationsRepository,
  systemContext,
  tenantContext,
  type TenantContext,
} from '@nothingleft/db';
import type { GitProviderKind, PatScope } from '@nothingleft/types';
import { loadEnv } from '@config/env';
import { runQueued, type RecordingQueue } from '@lib/jobs';
import type { BuildOptions } from '../src/app.ts';
import { fakeFetch, type FakeReply } from './git-fake-fetch.ts';
import { gitFixture, signedDelivery } from './git-fixtures.ts';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import type { Person } from './people.ts';

export const APP_WEBHOOK_SECRET = 'app-webhook-secret-for-tests';
const GITHUB_API = 'https://api.github.com';
const GITLAB_API = 'https://gitlab.com/api/v4';

export function gitEnv(withApp = true) {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    LOG_TARGETS: 'json',
    BYO_ALLOW_ANY_ENDPOINT: 'true',
    ...(withApp
      ? {
          GITHUB_APP_ID: '42',
          GITHUB_APP_PRIVATE_KEY: privateKey,
          GITHUB_APP_WEBHOOK_SECRET: APP_WEBHOOK_SECRET,
          GITHUB_APP_SLUG: 'nothing-left-test',
          GITHUB_APP_CLIENT_ID: 'Iv1.test',
          GITHUB_APP_CLIENT_SECRET: 'client-secret',
        }
      : {}),
  });
}

export const githubRepo = (id: number, fullName: string) => ({
  id,
  full_name: fullName,
  html_url: `https://github.com/${fullName}`,
  default_branch: 'main',
  private: true,
  archived: false,
});

export const gitlabProject = (id: number, path: string) => ({
  id,
  path_with_namespace: path,
  web_url: `https://gitlab.com/${path}`,
  default_branch: 'main',
  visibility: 'private',
  archived: false,
});

export interface GitWorld extends IssueWorld {
  provider: ReturnType<typeof fakeFetch>;
  queue: RecordingQueue;
  orgCtx: TenantContext;
  /** This world's id for a fixture's installation id: committed rows outlive a run, so each world has its own. */
  inst: (fixtureId: string) => string;
  /** Installations the faked GitHub knows, and the repositories each covers. */
  installations: Map<string, { login: string; repos: ReturnType<typeof githubRepo>[]; readOnly?: boolean }>;
  gitlabProjects: ReturnType<typeof gitlabProject>[];
  connectGitHub: (who: Person, slug: string, installationId: string) => ReturnType<IssueWorld['call']>;
  connectGitLab: (who: Person, slug: string, token?: string) => ReturnType<IssueWorld['call']>;
  deliver: (
    provider: GitProviderKind,
    fixture: string,
    opts?: { hookUrl?: string; secret?: string; delivery?: string; body?: Record<string, unknown> },
  ) => ReturnType<IssueWorld['call']>;
  /** Runs every queued job (the drains), as pg-boss would once each is due. */
  drain: (now?: Date) => Promise<void>;
  token: (who: Person, scopes: PatScope[]) => Promise<Person>;
  repos: IssueWorld['repos'] & {
    connections: ReturnType<typeof gitConnectionsRepository>;
    repositories: ReturnType<typeof gitRepositoriesRepository>;
    events: ReturnType<typeof gitEventsRepository>;
  };
}

/** A GitHub and a GitLab that answer what the real ones would, for the routes the integration calls. */
export function fakeProviders() {
  const base = 1_000_000 + Math.floor(Math.random() * 1_000_000_000);
  const ids = new Map<string, string>();
  const inst = (fixtureId: string) => {
    if (!ids.has(fixtureId)) ids.set(fixtureId, String(base + ids.size));
    return ids.get(fixtureId)!;
  };
  const installations: GitWorld['installations'] = new Map([
    [inst('5001'), { login: 'acme-inc', repos: [githubRepo(101, 'acme-inc/web')] }],
  ]);
  const gitlabProjects = [gitlabProject(202, 'acme/api')];
  const hooks = new Map<string, { url: string; token: string }>();
  let nextHook = 70;

  const routes: Record<string, FakeReply> = {
    'POST https://github.com/login/oauth/access_token': { access_token: 'user-token' },
    [`GET ${GITHUB_API}/user/installations`]: () => ({
      status: 200,
      body: {
        installations: [...installations].map(([id, i]) => ({
          id: Number(id),
          account: { login: i.login, id: 1, type: 'Organization' },
        })),
      },
    }),
    [`GET ${GITLAB_API}/personal_access_tokens/self`]: { id: 1, expires_at: '2027-01-31', scopes: ['api'] },
    [`GET ${GITLAB_API}/user`]: {
      id: 9001,
      username: 'acme-bot',
      avatar_url: null,
      web_url: 'https://gitlab.com/acme-bot',
    },
    [`GET ${GITLAB_API}/projects`]: () => ({ status: 200, body: gitlabProjects }),
    [`GET ${GITLAB_API}/namespaces/acme`]: {
      path: 'acme',
      avatar_url: 'https://gitlab.com/uploads/acme.png',
      web_url: 'https://gitlab.com/groups/acme',
    },
  };
  const provider = fakeFetch(routes);
  const fetch: typeof provider.fetch = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? 'GET';
    const app = /^\/app\/installations\/(\d+)(\/access_tokens)?$/.exec(url.pathname);
    if (url.origin === GITHUB_API && app) {
      const found = installations.get(app[1]!);
      if (!found) return new Response('{}', { status: 404 });
      if (app[2]) {
        return Response.json({ token: `inst-${app[1]}`, expires_at: new Date(Date.now() + 3_600_000).toISOString() });
      }
      return Response.json({
        id: Number(app[1]),
        account: { login: found.login, avatar_url: null, html_url: `https://github.com/${found.login}` },
      });
    }
    const membership = /^\/user\/memberships\/orgs\/(.+)$/.exec(url.pathname);
    if (url.origin === GITHUB_API && membership) {
      const admin = [...installations.values()].some(
        i => i.login === decodeURIComponent(membership[1]!) && !i.readOnly,
      );
      return Response.json({ state: 'active', role: admin ? 'admin' : 'member' });
    }
    const byId = /^\/repositories\/(\d+)$/.exec(url.pathname);
    if (url.origin === GITHUB_API && byId) {
      return Response.json(githubRepo(Number(byId[1]), `acme-inc/repo-${byId[1]}`));
    }
    if (url.origin === GITHUB_API && url.pathname === '/installation/repositories') {
      const id = /inst-(\d+)/.exec(new Headers(init?.headers).get('authorization') ?? '')?.[1];
      const repos = installations.get(id ?? '')?.repos ?? [];
      return Response.json({ total_count: repos.length, repositories: repos });
    }
    const project = /^\/api\/v4\/projects\/(\d+)$/.exec(url.pathname);
    if (url.origin === 'https://gitlab.com' && project) {
      const found = gitlabProjects.find(p => String(p.id) === project[1]);
      return found ? Response.json(found) : new Response('{}', { status: 404 });
    }
    const hook = /^\/api\/v4\/projects\/(\d+)\/hooks(?:\/(\d+))?$/.exec(url.pathname);
    if (url.origin === 'https://gitlab.com' && hook) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      provider.calls.push({ method, url: input, headers: {}, body });
      if (method === 'POST') {
        const id = String(nextHook++);
        hooks.set(id, { url: body.url, token: body.token });
        return Response.json({ id: Number(id), url: body.url });
      }
      if (method === 'PUT') {
        hooks.set(hook[2]!, { url: body.url, token: body.token });
        return Response.json({ id: Number(hook[2]) });
      }
      if (method === 'DELETE') {
        hooks.delete(hook[2]!);
        return new Response(null, { status: 204 });
      }
      return hooks.has(hook[2]!) ? Response.json({ id: Number(hook[2]) }) : new Response('{}', { status: 404 });
    }
    return provider.fetch(input, init);
  };

  return { fetch, provider, inst, installations, gitlabProjects };
}

/** An issue world whose GitHub and GitLab are fakes: the routes below answer what a real provider would. */
export async function gitWorld(key: string, opts: { withApp?: boolean } & BuildOptions = {}): Promise<GitWorld> {
  const { fetch, provider, inst, installations, gitlabProjects } = fakeProviders();
  const world = await issueWorld(key, { gitFetch: fetch, ...opts }, gitEnv(opts.withApp ?? true));
  const queue = world.app.jobQueue as RecordingQueue;
  const organization = await organizationsRepository(world.db).findBySlug(systemContext('test lookup'), world.slug);
  const orgCtx = tenantContext(organization!.id);

  const connectGitHub: GitWorld['connectGitHub'] = async (who, slug, installationId) => {
    const start = await world.call(who, 'POST', `/v1/organizations/${slug}/git/connect/github/start`);
    if (start.statusCode !== 200) return start;
    const state = start.cookies.find(c => c.name === 'git_connect_state')!.value;
    return world.call(
      who,
      'POST',
      '/v1/git/connect/github/callback',
      { state, code: 'oauth-code', installation_id: installationId },
      { cookie: `${who.headers['cookie']}; git_connect_state=${state}` },
    );
  };

  const connectGitLab: GitWorld['connectGitLab'] = (who, slug, token = 'glpat-test-token') =>
    world.call(who, 'POST', `/v1/organizations/${slug}/git/connections`, { provider: 'gitlab', mode: 'token', token });

  const deliver: GitWorld['deliver'] = (kind, name, o = {}) => {
    const fixture = gitFixture(kind, name);
    const body = { ...(o.body ?? fixture.body) };
    const installation = body['installation'] as { id?: number } | undefined;
    if (installation?.id !== undefined)
      body['installation'] = { ...installation, id: Number(inst(String(installation.id))) };
    const { headers, payload } = signedDelivery(kind, fixture, o.secret ?? APP_WEBHOOK_SECRET, {
      ...(o.delivery ? { delivery: o.delivery } : {}),
      body,
      registeredHook: kind === 'gitlab',
    });
    const url = o.hookUrl ? new URL(o.hookUrl).pathname : `/v1/git/webhooks/${kind}`;
    return world.app.inject({ method: 'POST', url, headers, payload });
  };

  const drain: GitWorld['drain'] = async (now = new Date()) => {
    for (let i = 0; i < 20 && queue.pending.length; i++) {
      const due = queue.pending.filter(j => j.options.startAfter <= now);
      if (due.length === 0) return;
      for (const job of due) {
        queue.pending.splice(queue.pending.indexOf(job), 1);
        await runQueued(world.app.queuedHandlers, job, now);
      }
    }
  };

  const token: GitWorld['token'] = async (who, scopes) => {
    const res = await world.call(who, 'POST', '/v1/me/tokens', {
      name: `t-${scopes.join('-')}-${Math.random()}`,
      scopes,
    });
    return { email: who.email, sid: '', headers: { authorization: `Bearer ${res.json().data.token}` } };
  };

  return {
    ...world,
    provider,
    queue,
    orgCtx,
    inst,
    installations,
    gitlabProjects,
    connectGitHub,
    connectGitLab,
    deliver,
    drain,
    token,
    repos: {
      ...world.repos,
      connections: gitConnectionsRepository(world.db),
      repositories: gitRepositoriesRepository(world.db),
      events: gitEventsRepository(world.db),
    },
  };
}
