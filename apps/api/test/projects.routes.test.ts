import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { testApp } from './helpers.ts';
import { mailbox, signUp, uniqueStamp, type Person } from './people.ts';

// Each test walks a whole flow over HTTP against the hosted database; 30s is too tight.
setDefaultTimeout(120_000);

const box = mailbox();
let app: Awaited<ReturnType<typeof testApp>>;
let admin: Person;
let member: Person;
let other: Person;
const slug = `proj-${uniqueStamp()}`;
let memberName: string;

const call = (who: Person, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: object) =>
  app.inject({ method, url, headers: who.headers, ...(body ? { body } : {}) });

beforeAll(async () => {
  app = await testApp({ mailer: box.mailer });
  [admin, member, other] = await Promise.all([
    signUp(app, box, 'Admin'),
    signUp(app, box, 'Member'),
    signUp(app, box, 'Other'),
  ]);
  await call(admin, 'POST', '/v1/organizations', { name: 'Projects Co', slug });
  await call(other, 'POST', '/v1/organizations', { name: 'Elsewhere', slug: `${slug}-x` });
  const link = (await call(admin, 'POST', `/v1/organizations/${slug}/invitations/links`, {})).json().data;
  await call(member, 'POST', '/v1/invitations/accept', { token: /\/invite\/(.+)$/.exec(link.url)![1] });
  memberName = (await call(member, 'GET', `/v1/organizations/${slug}`)).json().data.membership.username;
});

afterAll(async () => {
  await app.close();
});

describe('POST /v1/projects', () => {
  test('generates the key from the name, and a digit on collision', async () => {
    const first = await call(admin, 'POST', '/v1/projects', { name: 'Partner Portal' });
    expect(first.statusCode).toBe(201);
    expect(first.json().data).toMatchObject({
      key: 'PP',
      slug: 'partner-portal',
      avatar_initials: 'PP',
      avatar_url: expect.stringMatching(/\/avatars\/project\?seed=PP$/),
      is_archived: false,
      my_role: 'project_admin',
      lead: null,
    });
    expect(first.json().data.avatar_color).not.toBe('gray');

    const second = await call(admin, 'POST', '/v1/projects', { name: 'Partner Portal' });
    expect(second.json().data).toMatchObject({ key: 'PP2', slug: 'partner-portal-2' });
  });

  test('a supplied key is validated, and a taken one answers with a suggestion', async () => {
    expect((await call(admin, 'POST', '/v1/projects', { name: 'X', key: 'a' })).json().error.code).toBe(
      'project.key_invalid',
    );
    const taken = await call(admin, 'POST', '/v1/projects', { name: 'Partner Portal', key: 'pp' });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toMatchObject({ code: 'project.key_taken', field: 'key', valid_values: ['PP3'] });
    expect((await call(admin, 'POST', '/v1/projects', { name: 'X' })).json().error.code).toBe('project.key_required');
  });

  test('only an org admin creates projects', async () => {
    expect((await call(member, 'POST', '/v1/projects', { name: 'Mine' })).statusCode).toBe(403);
  });

  test('a session with no current organisation is told to pick one', async () => {
    const fresh = await signUp(app, box, 'Fresh');
    const res = await call(fresh, 'POST', '/v1/projects', { name: 'Nowhere' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('organization_ambiguous');
  });
});

describe('reading projects', () => {
  test('a plain member sees only projects they belong to; others are a 404', async () => {
    expect((await call(member, 'GET', '/v1/projects')).json().data).toEqual([]);
    expect((await call(member, 'GET', '/v1/projects/PP')).statusCode).toBe(404);
    expect((await call(admin, 'GET', '/v1/projects')).json().meta.pagination.total).toBe(2);
  });

  test("a project-restricted token's list counts only its projects", async () => {
    const created = await call(admin, 'POST', '/v1/me/tokens', {
      name: 'restricted',
      scopes: ['issues:read'],
      project_keys: ['PP2'],
    });
    const pat = { email: admin.email, sid: '', headers: { authorization: `Bearer ${created.json().data.token}` } };
    const res = await call(pat, 'GET', `/v1/projects?limit=1`);
    expect(res.json().data.map((p: { key: string }) => p.key)).toEqual(['PP2']);
    expect(res.json().meta.pagination).toMatchObject({ total: 1, has_more: false });
  });

  test('a project in another organisation is a 404 whatever its key', async () => {
    await call(other, 'POST', '/v1/projects', { name: 'Secret', key: 'SEC' });
    expect((await call(admin, 'GET', '/v1/projects/SEC')).statusCode).toBe(404);
  });
});

describe('project members', () => {
  test('a project admin adds an org member, whose role then governs what they may do', async () => {
    const added = await call(admin, 'POST', '/v1/projects/PP/members', { username: memberName, role: 'observer' });
    expect(added.statusCode).toBe(201);
    expect(added.json().data).toMatchObject({ username: memberName, role: 'observer', org_role: 'member' });
    expect(
      (await call(admin, 'POST', '/v1/projects/PP/members', { username: memberName, role: 'observer' })).json().error
        .code,
    ).toBe('member.already_in_project');

    const seen = (await call(member, 'GET', '/v1/projects')).json().data;
    expect(seen.map((p: { key: string; my_role: string }) => [p.key, p.my_role])).toEqual([['PP', 'observer']]);
    expect((await call(member, 'PATCH', '/v1/projects/PP', { name: 'Nope' })).statusCode).toBe(403);
    expect((await call(member, 'POST', '/v1/projects/PP/archive')).statusCode).toBe(403);
    expect((await call(member, 'GET', '/v1/projects/PP/members')).json().data.length).toBe(2);
  });

  test('raising to project admin emails them and grants project settings', async () => {
    const raised = await call(admin, 'PATCH', `/v1/projects/PP/members/${memberName}`, { role: 'project_admin' });
    expect(raised.json().data.role).toBe('project_admin');
    expect(box.last(member.email)?.subject).toBe('email.project_role_raised.subject');
    expect(
      (await call(member, 'PATCH', '/v1/projects/PP', { description_md: '# Hi' })).json().data.description_md,
    ).toBe('# Hi');
  });

  test('removing someone from the project takes it away from them', async () => {
    const res = await call(admin, 'DELETE', `/v1/projects/PP/members/${memberName}`);
    expect(res.json().data.username).toBe(memberName);
    expect((await call(member, 'GET', '/v1/projects/PP')).statusCode).toBe(404);
    expect((await call(admin, 'DELETE', `/v1/projects/PP/members/${memberName}`)).json().error.code).toBe(
      'member.not_in_project',
    );
    expect(
      (await call(admin, 'POST', '/v1/projects/PP/members', { username: 'nobody', role: 'observer' })).statusCode,
    ).toBe(404);
  });
});

describe('updating and archiving', () => {
  test('update changes key, lead and colour, and records the old and new values', async () => {
    const adminName = (await call(admin, 'GET', `/v1/organizations/${slug}`)).json().data.membership.username;
    const res = await call(admin, 'PATCH', '/v1/projects/PP2', {
      key: 'pp9',
      lead: `@${adminName}`,
      avatar_color: 'gray',
    });
    expect(res.json().data).toMatchObject({ key: 'PP9', avatar_initials: 'PP', avatar_color: 'gray' });
    expect(res.json().data.lead.username).toBe(adminName);
    expect((await call(admin, 'PATCH', '/v1/projects/PP9', { key: 'PP' })).statusCode).toBe(409);
    expect((await call(admin, 'PATCH', '/v1/projects/PP9', { lead: 'ghost' })).json().error.code).toBe(
      'project.lead_not_member',
    );
    expect((await call(admin, 'PATCH', '/v1/projects/PP9', { lead: null })).json().data.lead).toBeNull();

    const log = (await call(admin, 'GET', `/v1/organizations/${slug}/activity?kind=project_updated`)).json().data;
    const rekeyed = log.find((r: { new_value: { key?: string } }) => r.new_value.key === 'PP9');
    expect(rekeyed.old_value).toMatchObject({ key: 'PP2', lead: null });
    expect(rekeyed.new_value).toEqual({ key: 'PP9', lead: adminName, avatar_color: 'gray' });
  });

  test('archive and unarchive are idempotent and each recorded once', async () => {
    expect((await call(admin, 'POST', '/v1/projects/PP9/archive')).json().data.is_archived).toBe(true);
    expect((await call(admin, 'POST', '/v1/projects/PP9/archive')).json().data.is_archived).toBe(true);
    expect(
      (await call(admin, 'GET', '/v1/projects?archived=false')).json().data.map((p: { key: string }) => p.key),
    ).toEqual(['PP']);
    expect((await call(admin, 'POST', '/v1/projects/PP9/unarchive')).json().data.is_archived).toBe(false);

    const log = (
      await call(admin, 'GET', `/v1/organizations/${slug}/activity?kind=project_archived&kind=project_unarchived`)
    ).json().data;
    expect(log.map((r: { kind: string }) => r.kind)).toEqual(['project_unarchived', 'project_archived']);
  });
});
