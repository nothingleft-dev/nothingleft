import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { Analytics } from '@nothingleft/analytics';
import { t } from '@nothingleft/i18n';
import type { PatScope } from '@nothingleft/types';
import { createDb } from '@nothingleft/db';
import { testApp, testEnv } from './helpers.ts';
import { mailbox, signUp, uniqueStamp, type Person } from './people.ts';
import { TOOL_NAMES, toolDefinitions } from '@nothingleft/mcp-server';
import { callTool, mcpRpc, rpcAnswer, type McpClient } from './mcp-client.ts';

setDefaultTimeout(120_000);

type App = Awaited<ReturnType<typeof testApp>>;
interface ToolReply {
  text: string;
  isError: boolean;
  /** The code in `**Error `code`**`, the error markdown's first line. */
  code: string | null;
  raw: Record<string, unknown>;
  asked: string | null;
}

const ALL_SCOPES: PatScope[] = [
  'issues:read',
  'issues:write',
  'comments:write',
  'time:write',
  'admin:project',
  'admin:org',
];
const KEY = 'MCP';
const OTHER = 'MCO';

let app: App;
const captured: { name: string; props: Record<string, unknown> }[] = [];
const analytics: Analytics = {
  capture: (name, props) => void captured.push({ name, props: props as Record<string, unknown> }),
  captureException: () => {},
  shutdown: async () => {},
};

// The tools' HTTP calls re-enter the same app: the whole REST stack runs, only the socket is skipped.
async function injectFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => (headers[name] = value));
  const res = await app.inject({
    method: request.method as 'GET',
    url: url.pathname + url.search,
    headers,
    ...(request.body ? { payload: await request.text() } : {}),
  });
  return new Response(res.body, { status: res.statusCode, headers: res.headers as Record<string, string> });
}

const call = (who: Person, method: 'GET' | 'POST' | 'PATCH', url: string, body?: object) =>
  app.inject({ method, url, headers: who.headers, ...(body ? { body } : {}) });

async function rpc(token: string | null, method: string, params: object = {}, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    payload: { jsonrpc: '2.0', id: 1, method, params },
  });
}

function parse(body: string) {
  const line = body.split('\n').find(l => l.startsWith('data: '));
  return JSON.parse(line ? line.slice(6) : body);
}

async function tool(token: string, name: string, args: object = {}, client: McpClient = 'legacy'): Promise<ToolReply> {
  const { result, error, asked } = await callTool(app, token, name, args, client);
  if (error) throw new Error(`rpc error: ${JSON.stringify(error)}`);
  const text: string = (result!['content'] as { text: string }[])[0]!.text;
  const code = /^\*\*Error `([^`]+)`\*\*/.exec(text)?.[1] ?? null;
  return { text, isError: result!['isError'] === true, code, raw: result!, asked };
}

async function pat(who: Person, scopes: PatScope[], project_keys?: string[]): Promise<string> {
  const res = await call(who, 'POST', '/v1/me/tokens', { name: `mcp-${scopes.length}`, scopes, project_keys });
  if (res.statusCode !== 201) throw new Error(`token failed: ${res.body}`);
  return res.json().data.token;
}

const w = {} as {
  slugA: string;
  slugB: string;
  alex: Person;
  casey: Person;
  jordan: Person;
  caseyName: string;
  jordanName: string;
  full: string;
  readOnly: string;
  restricted: string;
  observer: string;
  single: string;
};

async function projectRole(username: string): Promise<string | undefined> {
  const res = await call(w.alex, 'GET', `/v1/projects/${KEY}/members`);
  return (res.json().data as { username: string; role: string }[]).find(m => m.username === username)?.role;
}

beforeAll(async () => {
  const box = mailbox();
  app = await testApp({ mailer: box.mailer, analytics, mcpFetch: injectFetch });
  const stamp = uniqueStamp();
  w.slugA = `mcp-a-${stamp}`;
  w.slugB = `mcp-b-${stamp}`;
  [w.alex, w.casey, w.jordan] = await Promise.all([
    signUp(app, box, 'Alex'),
    signUp(app, box, 'Casey'),
    signUp(app, box, 'Jordan'),
  ]);

  await call(w.alex, 'POST', '/v1/organizations', { name: 'Acme', slug: w.slugA });
  await call(w.alex, 'POST', '/v1/projects', {
    name: 'Acme Web',
    key: KEY,
    description_md: '## Scope\n- the storefront',
  });
  await call(w.alex, 'POST', '/v1/projects', { name: 'Acme Ops', key: OTHER });
  const link = (await call(w.alex, 'POST', `/v1/organizations/${w.slugA}/invitations/links`, {})).json().data;
  const token = /\/invite\/(.+)$/.exec(link.url)![1];
  for (const who of [w.casey, w.jordan]) await call(who, 'POST', '/v1/invitations/accept', { token });
  const username = async (who: Person) =>
    (await call(who, 'GET', `/v1/organizations/${w.slugA}`)).json().data.membership.username as string;
  w.caseyName = await username(w.casey);
  w.jordanName = await username(w.jordan);
  await call(w.alex, 'POST', `/v1/projects/${KEY}/members`, { username: w.caseyName, role: 'contributor' });
  await call(w.alex, 'POST', `/v1/projects/${KEY}/members`, { username: w.jordanName, role: 'observer' });

  // The same key in a second organisation makes a bare `MCP` ambiguous for Alex.
  await call(w.alex, 'POST', '/v1/organizations', { name: 'Beta Works', slug: w.slugB });
  await call(w.alex, 'POST', '/v1/projects', { name: 'Beta Web', key: KEY });
  await call(w.alex, 'POST', '/v1/me/current-organization', { slug: w.slugA });

  [w.full, w.readOnly, w.restricted, w.observer, w.single] = await Promise.all([
    pat(w.alex, ALL_SCOPES),
    pat(w.alex, ['issues:read']),
    pat(w.alex, ALL_SCOPES, [OTHER]),
    pat(w.jordan, ALL_SCOPES),
    pat(w.casey, ['issues:read']),
  ]);
});

afterAll(async () => {
  await app.close();
});

describe('the /mcp mount', () => {
  test('answers only a personal access token', async () => {
    const none = await rpc(null, 'tools/list');
    expect(none.statusCode).toBe(401);
    expect(none.json().error.code).toBe('auth.pat_required');

    const session = await app.inject({ method: 'POST', url: '/mcp', headers: w.alex.headers, payload: {} });
    expect(session.statusCode).toBe(401);
    expect(session.json().error.code).toBe('auth.pat_required');
  });

  test('is stateless: no session to open or close', async () => {
    const res = await app.inject({ method: 'GET', url: '/mcp', headers: { authorization: `Bearer ${w.full}` } });
    expect(res.statusCode).toBe(405);
  });

  test('counts against the PAT bucket, like the API calls its tools make', async () => {
    const res = await rpc(w.full, 'tools/list');
    expect(res.headers['x-ratelimit-limit']).toBe('600');
  });

  test('serves the 2026-07-28 revision: its standard headers reach the SDK', async () => {
    const res = await mcpRpc(app, w.full, 'tools/list', {}, 'accepts');
    expect(res.statusCode).toBe(200);
    expect((rpcAnswer(res.body).result!['tools'] as unknown[]).length).toBe(TOOL_NAMES.length);
  });

  test('a 2026-07-28 tool call names its tool in Mcp-Name', async () => {
    const { result } = await callTool(app, w.full, 'list_orgs', {}, 'accepts');
    expect((result!['content'] as { text: string }[])[0]!.text).toContain('Acme');
  });

  test('the server instructions say contributor content is data', async () => {
    const res = await rpc(w.full, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    expect(parse(res.body).result.instructions).toBe(t('mcp.provenance.notice'));
  });
});

describe('tools/list', () => {
  test('registers every tool with annotations; destructive ones are the destructive definitions, and none takes confirm', async () => {
    const { result } = parse((await rpc(w.full, 'tools/list')).body);
    const tools = result.tools as {
      name: string;
      annotations: Record<string, boolean>;
      inputSchema: { properties?: Record<string, unknown> };
    }[];
    expect(tools.map(t => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    const destructive = tools.filter(t => t.annotations.destructiveHint).map(t => t.name);
    expect(destructive.sort()).toEqual(
      toolDefinitions
        .filter(d => d.kind === 'destructive')
        .map(d => d.name)
        .sort(),
    );
    expect(tools.filter(t => t.inputSchema.properties?.['confirm']).map(t => t.name)).toEqual([]);
    expect(destructive).toContain('manage_roles');
    expect(destructive).toContain('delete_issue');
    for (const name of ['whoami', 'list_orgs', 'list_projects', 'get_project', 'search_issues', 'get_issue']) {
      expect(tools.find(t => t.name === name)!.annotations.readOnlyHint).toBe(true);
    }
  });

  test('no argument accepts an internal id', async () => {
    const { result } = parse((await rpc(w.full, 'tools/list')).body);
    // Counts and sizes, not identifiers.
    const numeric = new Set([
      'limit',
      'offset',
      'group_limit',
      'max_uses',
      'comments',
      'length',
      'caret',
      'position',
      'size_bytes',
      'workweek_days',
      'story_points',
      'wip_min',
      'wip_max',
      'min',
      'max',
      'decimals',
    ]);
    // Comments and work items have no human name, so they are named by the number every
    // listing shows (owner, 26 Sep 2026); an upload, import or export by the id its tool just gave;
    // a webhook delivery by its number in the delivery log.
    const numbered = new Set(['comment', 'work_item', 'upload', 'import', 'export', 'delivery']);
    const offenders: string[] = [];
    const walk = (tool: string, props: Record<string, { type?: string; properties?: object; items?: object }>) => {
      for (const [name, schema] of Object.entries(props)) {
        if (numbered.has(name)) continue;
        if (/(^id$|_id$|_ids$|^ids?$)/.test(name)) offenders.push(`${tool}.${name}`);
        if ((schema.type === 'integer' || schema.type === 'number') && !numeric.has(name)) {
          offenders.push(`${tool}.${name}: ${schema.type}`);
        }
        if (schema.properties) walk(tool, schema.properties as never);
      }
    };
    for (const t of result.tools) walk(t.name, t.inputSchema.properties ?? {});
    expect(offenders).toEqual([]);
  });
});

describe('responses', () => {
  test('are markdown only: no structuredContent, which a client would show the model instead', async () => {
    const ok = await tool(w.full, 'list_orgs');
    const failed = await tool(w.full, 'get_project', { project: KEY });
    expect(ok.raw).toEqual({ content: [{ type: 'text', text: ok.text }] });
    expect(failed.raw).toEqual({ content: [{ type: 'text', text: failed.text }], isError: true });
  });
});

describe('discovery', () => {
  test('whoami names the token, its scopes and every organisation with its projects', async () => {
    const r = await tool(w.readOnly, 'whoami');
    expect(r.isError).toBe(false);
    expect(r.text).toContain('`issues:read`');
    expect(r.text).toContain('all projects');
    expect(r.text).toContain(`\`${w.slugA}\``);
    expect(r.text).toContain(`\`${w.slugB}\``);
    expect(r.text).toContain(`${KEY} (Project Admin)`);
    expect(r.text).not.toMatch(/"id"/);
  });

  test('list_orgs gives the slugs to pass as org', async () => {
    const r = await tool(w.full, 'list_orgs');
    expect(r.text).toContain('| Organisation | Slug | You | Role | Plan | Members |');
    expect(r.text).toContain(`| Acme | \`${w.slugA}\``);
  });

  test('list_projects groups by organisation when there are several', async () => {
    const r = await tool(w.full, 'list_projects');
    expect(r.text).toContain(`### Acme (\`${w.slugA}\`)`);
    expect(r.text).toContain(`### Beta Works (\`${w.slugB}\`)`);
    const one = await tool(w.full, 'list_projects', { org: w.slugB });
    expect(one.text).not.toContain('###');
    expect(one.text).toContain('Beta Web');
  });

  test('get_project with a key two organisations share answers with the candidate slugs', async () => {
    const r = await tool(w.full, 'get_project', { project: KEY });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('**Error `organization_ambiguous`**');
    expect(r.text).toContain(`Valid values for \`org\`: \`${w.slugA}\`, \`${w.slugB}\``);
    expect(r.code).toBe('organization_ambiguous');

    const ok = await tool(w.full, 'get_project', { project: KEY.toLowerCase(), org: w.slugA });
    expect(ok.isError).toBe(false);
    expect(ok.text).toContain(`**${KEY}** — Acme Web`);
    expect(ok.text).toContain('## Scope\n- the storefront');
    expect(ok.text).toContain('| Your role | Project Admin |');
  });

  test('an unknown org lists the ones that exist', async () => {
    const r = await tool(w.full, 'list_members', { org: 'nope' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('`organization.not_found`');
    expect(r.text).toContain(`\`${w.slugA}\`, \`${w.slugB}\``);
  });
});

describe('people', () => {
  test('list_members without org, for someone in two organisations, is ambiguous', async () => {
    const r = await tool(w.full, 'list_members');
    expect(r.code).toBe('organization_ambiguous');
    expect(r.text).toContain(`Valid values for \`org\`: \`${w.slugA}\`, \`${w.slugB}\``);
  });

  test('list_members resolves the sole organisation on its own', async () => {
    const r = await tool(w.single, 'list_members');
    expect(r.isError).toBe(false);
    expect(r.text).toContain('3 members');
    expect(r.text).toContain(`@${w.caseyName}`);
  });

  test('list_members with project shows project roles', async () => {
    const r = await tool(w.full, 'list_members', { project: KEY, org: w.slugA });
    expect(r.text).toContain('| Member | Name | Project role | Org role | Added |');
    expect(r.text).toContain('| Observer |');
  });

  test('get_member takes @username, and me', async () => {
    const r = await tool(w.full, 'get_member', { user: `@${w.caseyName}`, org: w.slugA });
    expect(r.text).toContain(`**@${w.caseyName}** · Casey`);
    expect(r.text).toContain('| Org role | Member |');
    const me = await tool(w.single, 'get_member', { user: 'me' });
    expect(me.text).toContain(`**@${w.caseyName}**`);
  });

  test('invite_member and create_invite_link return what they created', async () => {
    const invited = await tool(w.full, 'invite_member', {
      emails: [`new-${uniqueStamp()}@test.local`],
      org: w.slugA,
      org_role: 'member',
    });
    expect(invited.isError).toBe(false);
    expect(invited.text).toContain('Invited 1 person');

    const link = await tool(w.full, 'create_invite_link', {
      project: KEY,
      org: w.slugA,
      project_role: 'observer',
      max_uses: 3,
      expires_on: '2030-01-31',
    });
    expect(link.isError).toBe(false);
    expect(link.text).toMatch(/\/invite\/\S+/);
    expect(link.text).toContain('| Uses | 0 of 3 |');
    expect(link.text).toContain('| Expires | 31 Jan 2030 |');
    expect(link.text).toContain('| Project role | Observer |');
  });
});

describe('manage_roles', () => {
  test('declined: it said what it would do, and nothing changed', async () => {
    const r = await tool(
      w.full,
      'manage_roles',
      {
        user: `@${w.caseyName}`,
        project: KEY,
        project_role: 'Project Admin',
        org: w.slugA,
      },
      'declines',
    );
    expect(r.isError).toBe(true);
    expect(r.code).toBe('mcp.confirm_declined');
    expect(r.asked).toContain(`make @${w.caseyName} Project Admin in project ${KEY}`);
    expect(await projectRole(w.caseyName)).toBe('contributor');
  });

  test('accepted: changes, removes and re-adds a project role', async () => {
    const base = { user: w.caseyName, project: KEY, org: w.slugA };
    const up = await tool(w.full, 'manage_roles', { ...base, project_role: 'project admin' }, 'accepts');
    expect(up.text).toContain('is now **Project Admin** in project MCP (was Contributor)');
    expect(await projectRole(w.caseyName)).toBe('project_admin');

    const out = await tool(w.full, 'manage_roles', { ...base, project_role: 'None' }, 'accepts');
    expect(out.text).toContain('was removed from project MCP');
    expect(await projectRole(w.caseyName)).toBeUndefined();

    const back = await tool(w.full, 'manage_roles', { ...base, project_role: 'Contributor' }, 'accepts');
    expect(back.text).toContain('was added to project MCP as **Contributor**');
  });

  test('changes an organisation role', async () => {
    const base = { user: `@${w.caseyName}`, org: w.slugA };
    expect((await tool(w.full, 'manage_roles', { ...base, org_role: 'Org Admin' }, 'accepts')).text).toContain(
      'is now **Org Admin** of Acme',
    );
    expect((await tool(w.full, 'manage_roles', { ...base, org_role: 'Member' }, 'accepts')).text).toContain(
      'is now **Member**',
    );
  });

  test('a bad role value comes back with the valid ones', async () => {
    const r = await tool(w.full, 'manage_roles', { user: w.caseyName, project: KEY, project_role: 'Admin' });
    expect(r.code).toBe('mcp.invalid_arguments');
    expect(r.text).toContain('Valid values for `project_role`: `Observer`, `Contributor`, `Project Admin`, `None`');
  });

  test('both kinds of change in one call are refused', async () => {
    const r = await tool(w.full, 'manage_roles', {
      user: w.caseyName,
      org: w.slugA,
      org_role: 'Member',
      project: KEY,
      project_role: 'Observer',
    });
    expect(r.code).toBe('mcp.invalid_arguments');
  });
});

describe('permission propagation', () => {
  test("an Observer's token is refused a manage tool, by the API", async () => {
    const r = await tool(
      w.observer,
      'manage_roles',
      { user: w.caseyName, project: KEY, project_role: 'Observer' },
      'accepts',
    );
    expect(r.isError).toBe(true);
    expect(r.code).toBe('forbidden');
    expect(await projectRole(w.caseyName)).toBe('contributor');
  });

  test('a read-only token is refused a write, even for an Org Owner', async () => {
    const r = await tool(w.readOnly, 'invite_member', { emails: ['x@test.local'], org: w.slugA });
    expect(r.isError).toBe(true);
    expect(r.code).toBe('token.scope_missing');
    expect(r.text).toContain('admin:org');
  });

  test('a project-restricted token sees only its projects', async () => {
    const list = await tool(w.restricted, 'list_projects', { org: w.slugA });
    expect(list.text).toContain(OTHER);
    expect(list.text).not.toContain('Acme Web');

    const hidden = await tool(w.restricted, 'get_project', { project: KEY, org: w.slugA });
    expect(hidden.code).toBe('project.not_found');
    expect(hidden.text).toContain('Field: `project`');

    const whoami = await tool(w.restricted, 'whoami');
    expect(whoami.text).toContain(`projects ${OTHER} only`);
  });
});

// This world already holds the one fixture the case needs: a key in two of Alex's organisations.
describe('POST /v1/me/tokens with a key two organisations share', () => {
  test('answers with the candidate organisation slugs, never their ids', async () => {
    const res = await call(w.alex, 'POST', '/v1/me/tokens', {
      name: 'x',
      scopes: ['issues:read'],
      project_keys: [KEY],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({
      code: 'organization_ambiguous',
      field: 'project_keys',
      valid_values: [w.slugA, w.slugB].sort(),
    });
  });
});

describe('arguments', () => {
  test('unknown and missing arguments are named, with the valid ones', async () => {
    const r = await tool(w.full, 'get_project', { key: KEY });
    expect(r.code).toBe('mcp.invalid_arguments');
    expect(r.text).toContain('Unknown argument `key`. Valid arguments: `project`, `org`.');
    expect(r.text).toContain('Missing required argument `project`.');
  });
});

describe('analytics', () => {
  test('one event per call: tool, outcome, error code and counts — never an argument', async () => {
    captured.length = 0;
    await tool(w.full, 'get_member', { user: `@${w.caseyName}`, org: w.slugA });
    await tool(w.full, 'get_project', { project: KEY });
    const events = captured.filter(e => e.name === 'mcp_tool_called').map(e => e.props);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ tool: 'get_member', ok: true, error_code: null, argument_count: 2 });
    expect(events[1]).toMatchObject({ tool: 'get_project', ok: false, error_code: 'organization_ambiguous' });
    expect(JSON.stringify(events)).not.toContain(w.caseyName);
    expect(JSON.stringify(events)).not.toContain(w.slugA);
  });
});

describe('a token whose projects are gone', () => {
  test('whoami says it reaches no projects, and it lists none', async () => {
    await call(w.alex, 'POST', '/v1/projects', { name: 'Acme Gone', key: 'MCZ' });
    const gone = await pat(w.alex, ['issues:read'], ['MCZ']);
    const conn = createDb(testEnv.DATABASE_URL, { max: 1, allowExitOnIdle: true });
    try {
      await conn.db.execute(
        `delete from projects where key = 'MCZ' and org_id = (select id from organizations where slug = '${w.slugA}')`,
      );
    } finally {
      await conn.pool.end();
    }

    const whoami = await tool(gone, 'whoami');
    expect(whoami.text).toContain('no projects');
    expect(whoami.text).not.toContain('all projects');
    const list = await tool(gone, 'list_projects', { org: w.slugA });
    expect(list.text).not.toContain('Acme Web');
    expect(list.text).not.toContain(OTHER);
  });
});
