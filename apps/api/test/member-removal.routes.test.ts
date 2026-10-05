import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { issueWorld, type IssueWorld, type Member } from './issue-world.ts';
import { signUp } from './people.ts';

setDefaultTimeout(120_000);

const KEY = 'RM';
let w: IssueWorld;
let loner: Member;

const removal = (username: string) => `/v1/organizations/${w.slug}/members/${username}/removal`;
const member = (username: string) => `/v1/organizations/${w.slug}/members/${username}`;
const removeUrl = (username: string, choices: Record<string, string> = {}) =>
  `${member(username)}${Object.keys(choices).length ? `?${new URLSearchParams(choices)}` : ''}`;

async function join(name: string): Promise<Member> {
  const person = await signUp(w.app, w.box, name);
  const link = (await w.call(w.admin, 'POST', `/v1/organizations/${w.slug}/invitations/links`, {})).json().data;
  const token = /\/invite\/(.+)$/.exec(link.url)![1];
  await w.call(person, 'POST', '/v1/invitations/accept', { token });
  const username = (await w.call(person, 'GET', `/v1/organizations/${w.slug}`)).json().data.membership.username;
  return { ...person, username };
}

async function issue(assignees: string[], extra: object = {}): Promise<string> {
  const res = await w.call(w.admin, 'POST', '/v1/issues', {
    project: KEY,
    title: 'Checkout times out',
    assignees,
    ...extra,
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().data.key;
}

const assigneesOf = async (key: string) =>
  ((await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data.assignees as { username: string }[])
    .map(a => a.username)
    .sort();

beforeAll(async () => {
  w = await issueWorld(KEY);
  loner = await join('Loner');
});

afterAll(async () => {
  await w.close();
});

describe('GET /v1/organizations/:slug/members/:username/removal', () => {
  test('is for org admins: members get 403, outsiders 404, the owner is not removable', async () => {
    const c = w.contributor.username;
    expect((await w.call(w.contributor, 'GET', removal(w.observer.username))).statusCode).toBe(403);
    expect((await w.call(w.observer, 'GET', removal(c))).statusCode).toBe(403);
    expect((await w.call(w.projectAdmin, 'GET', removal(c))).statusCode).toBe(403);
    expect((await w.call(w.outsider, 'GET', removal(c))).statusCode).toBe(404);
    expect((await w.call(w.admin, 'GET', removal('nobody-here'))).statusCode).toBe(404);
    expect((await w.call(w.admin, 'GET', removal(w.admin.username))).json().error.code).toBe(
      'member.owner_not_removable',
    );
  });
});

describe('removing a member with work', () => {
  let victim: Member;
  let soloOpen: string;
  let sharedOpen: string;
  let resolved: string;
  let createdByVictim: string;

  beforeAll(async () => {
    victim = await join('Victim');
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/members`, { username: victim.username, role: 'contributor' });
    soloOpen = await issue([victim.username]);
    sharedOpen = await issue([victim.username, w.projectAdmin.username]);
    resolved = await issue([victim.username], { status: 'Fixed' });
    await issue([], {});
    const own = await w.call(victim, 'POST', '/v1/issues', { project: KEY, title: 'Filed by the victim' });
    createdByVictim = own.json().data.key;
    await w.call(victim, 'POST', `/v1/issues/${soloOpen}/comments`, { body_md: 'On it.' });
    await w.call(victim, 'POST', `/v1/issues/${soloOpen}/work-items`, {
      records: [{ work_date: '2026-09-21', duration: '1h 30m' }],
    });
    await w.call(victim, 'POST', '/v1/saved-views', { name: 'Mine', query: '#Unresolved' });
    await w.call(victim, 'POST', '/v1/saved-views', { name: 'Team board', query: '#Unresolved', visibility: 'org' });
    await w.call(w.admin, 'POST', '/v1/saved-views', { name: 'Mine', query: 'assignee: me' });
  });

  test('the preview counts everything the dialog names', async () => {
    const res = await w.call(w.admin, 'GET', removal(victim.username));
    expect(res.statusCode).toBe(200);
    const preview = res.json().data;
    expect(preview).toMatchObject({
      member: { username: victim.username, former_member: false },
      open_assigned: 2,
      resolved_assigned: 1,
      created: 1,
      comments: 1,
      time_logged_minutes: 90,
      saved_views: 2,
      access_tokens: 0,
    });
    expect(preview.sessions).toBeGreaterThanOrEqual(1);
    const candidates = preview.reassign_candidates.map((m: { username: string }) => m.username);
    expect(candidates).toContain(w.projectAdmin.username);
    expect(candidates).toContain(w.admin.username);
    expect(candidates).not.toContain(victim.username);
    expect(candidates).not.toContain(loner.username);
  });

  test('each target must be an active member other than them', async () => {
    expect((await w.call(w.admin, 'DELETE', removeUrl(victim.username, { reassign_to: '' }))).statusCode).toBe(400);
    const self = await w.call(w.admin, 'DELETE', removeUrl(victim.username, { reassign_to: victim.username }));
    expect(self.json().error).toMatchObject({ code: 'member.handover_invalid', field: 'reassign_to' });
    const stranger = await w.call(w.admin, 'DELETE', removeUrl(victim.username, { transfer_views_to: 'nobody-here' }));
    expect(stranger.json().error).toMatchObject({ code: 'member.handover_invalid', field: 'transfer_views_to' });
    const outsideProject = await w.call(w.admin, 'DELETE', removeUrl(victim.username, { reassign_to: loner.username }));
    expect(outsideProject.json().error).toMatchObject({ code: 'member.reassign_not_assignable', field: 'reassign_to' });
    expect((await w.call(w.admin, 'GET', member(victim.username))).statusCode).toBe(200);
  });

  test('reassigns open issues only, transfers views with a free name, keeps authorship', async () => {
    const before = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}`)).json().data.seats.used;
    const res = await w.call(
      w.admin,
      'DELETE',
      removeUrl(victim.username, { reassign_to: `@${w.projectAdmin.username}`, transfer_views_to: w.admin.username }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().data.former_member).toBe(true);

    expect(await assigneesOf(soloOpen)).toEqual([w.projectAdmin.username]);
    expect(await assigneesOf(sharedOpen)).toEqual([w.projectAdmin.username]);
    expect(await assigneesOf(resolved)).toEqual([victim.username]);
    const own = (await w.call(w.admin, 'GET', `/v1/issues/${createdByVictim}`)).json().data;
    expect(own.created_by.username).toBe(victim.username);

    const history = (await w.call(w.admin, 'GET', `/v1/issues/${soloOpen}/activity?kind=field_changed`)).json().data;
    const row = history.find((r: { field: string }) => r.field === 'assignees');
    expect(row).toMatchObject({
      actor: { username: w.admin.username },
      old_value: [victim.username],
      new_value: [w.projectAdmin.username],
    });
    const named = Object.fromEntries(
      (row.people as { username: string; former_member: boolean }[]).map(p => [p.username, p.former_member]),
    );
    expect(named).toEqual({ [victim.username]: true, [w.projectAdmin.username]: false });

    const views = (await w.call(w.admin, 'GET', '/v1/saved-views')).json().data as {
      name: string;
      can_edit: boolean;
    }[];
    const names = views.filter(v => v.can_edit).map(v => v.name);
    expect(names).toEqual(expect.arrayContaining(['Mine', 'Mine 2', 'Team board']));

    const after = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}`)).json().data.seats.used;
    expect(after).toBe(before - 1);
    expect((await w.call(victim, 'GET', `/v1/organizations/${w.slug}`)).statusCode).toBe(404);
  });
});

describe('removing a member and keeping nothing', () => {
  test('leaves open issues unassigned and deletes their views', async () => {
    const victim = await join('Leaver');
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/members`, { username: victim.username, role: 'contributor' });
    const shared = await issue([victim.username, w.contributor.username]);
    const solo = await issue([victim.username]);
    await w.call(victim, 'POST', '/v1/saved-views', { name: 'Leaver view', query: '#Unresolved', visibility: 'org' });

    const res = await w.call(w.admin, 'DELETE', member(victim.username));
    expect(res.statusCode).toBe(200);
    expect(await assigneesOf(shared)).toEqual([w.contributor.username]);
    expect(await assigneesOf(solo)).toEqual([]);
    const views = (await w.call(w.admin, 'GET', '/v1/saved-views')).json().data as { name: string }[];
    expect(views.map(v => v.name)).not.toContain('Leaver view');
  });
});
