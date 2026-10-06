import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { testApp } from './helpers.ts';
import { SESSION_COOKIE_NAME } from '@nothingleft/types';
import { mailbox, origin, password, signUp, uniqueStamp, type Person } from './people.ts';

// Each test walks a whole flow over HTTP against the hosted database; 30s is too tight.
setDefaultTimeout(120_000);

const box = mailbox();
let app: Awaited<ReturnType<typeof testApp>>;
let owner: Person;
let admin: Person;
let member: Person;
let outsider: Person;
const slug = `acme-${uniqueStamp()}`;

const call = (who: Person, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: object) =>
  app.inject({ method, url, headers: who.headers, ...(body ? { body } : {}) });

async function joinByLink(who: Person, orgRole: 'member' | 'org_admin' = 'member') {
  const link = await call(owner, 'POST', `/v1/organizations/${slug}/invitations/links`, { org_role: orgRole });
  const token = /\/invite\/(.+)$/.exec(link.json().data.url)![1];
  const res = await call(who, 'POST', '/v1/invitations/accept', { token });
  if (res.statusCode !== 200) throw new Error(res.body);
}

beforeAll(async () => {
  app = await testApp({ mailer: box.mailer });
  [owner, admin, member, outsider] = await Promise.all([
    signUp(app, box, 'Owner'),
    signUp(app, box, 'Admin'),
    signUp(app, box, 'Member'),
    signUp(app, box, 'Outsider'),
  ]);
});

afterAll(async () => {
  await app.close();
});

describe('POST /v1/organizations', () => {
  test('an unverified account cannot create an organisation', async () => {
    const unverified = await signUp(app, box, 'Pending', { verify: false });
    expect((await call(unverified, 'GET', '/v1/me')).json().data.current_organization_slug).toBeNull();
    const res = await call(unverified, 'POST', '/v1/organizations', { name: 'Nope' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('auth.email_unverified');
  });

  test('refuses a malformed slug, and a name that cannot make one', async () => {
    expect(
      (await call(owner, 'POST', '/v1/organizations', { name: 'Acme', slug: '-bad-' })).json().error,
    ).toMatchObject({
      code: 'organization.slug_invalid',
      field: 'slug',
    });
    expect((await call(owner, 'POST', '/v1/organizations', { name: '!' })).json().error.code).toBe(
      'organization.slug_required',
    );
  });

  test('creates the organisation with the caller as owner, and switches the session into it', async () => {
    const res = await call(owner, 'POST', '/v1/organizations', { name: 'Acme Labs', slug });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      slug,
      name: 'Acme Labs',
      plan: 'free',
      workday_minutes: 480,
      workweek_days: 5,
      week_starts_on: 1,
      seats: { used: 1, free: 20, over: 0 },
      membership: { org_role: 'org_admin', is_owner: true },
    });
    expect(res.json().data.owner.username).toBe(res.json().data.membership.username);
    expect(res.json().data.avatar_url).toContain('/avatars/organization?seed=');

    const sessions = await call(owner, 'GET', '/v1/me/sessions');
    expect(sessions.json().data.find((s: { current: boolean }) => s.current).current_organization_slug).toBe(slug);
    expect((await call(owner, 'GET', '/v1/me')).json().data.current_organization_slug).toBe(slug);
  });

  test('a taken slug is a 409, and a derived one is suffixed instead', async () => {
    expect((await call(owner, 'POST', '/v1/organizations', { name: 'x', slug })).statusCode).toBe(409);
    const derived = await call(admin, 'POST', '/v1/organizations', { name: slug });
    expect(derived.json().data.slug).toBe(`${slug}-2`);
  });

  test('GET /v1/organizations lists only the caller’s memberships', async () => {
    const mine = (await call(owner, 'GET', '/v1/organizations')).json();
    expect(mine.data.map((o: { slug: string }) => o.slug)).toEqual([slug]);
    expect(mine.meta.pagination.total).toBe(1);
    expect((await call(outsider, 'GET', '/v1/organizations')).json().data).toEqual([]);
  });
});

describe('reading and settings', () => {
  beforeAll(async () => {
    await joinByLink(admin, 'org_admin');
    await joinByLink(member);
  });

  test('an organisation the caller does not belong to is a 404, never a 403', async () => {
    const res = await call(outsider, 'GET', `/v1/organizations/${slug}`);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('organization.not_found');
  });

  test('a plain member reads the organisation but cannot change settings', async () => {
    expect((await call(member, 'GET', `/v1/organizations/${slug}`)).json().data.seats.used).toBe(3);
    expect((await call(member, 'PATCH', `/v1/organizations/${slug}`, { name: 'Hijack' })).statusCode).toBe(403);
  });

  test('an org admin changes settings; only changed fields are recorded', async () => {
    const res = await call(admin, 'PATCH', `/v1/organizations/${slug}`, {
      name: 'Acme Labs',
      workday_minutes: 450,
      week_starts_on: 0,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ workday_minutes: 450, week_starts_on: 0, name: 'Acme Labs' });

    const log = (await call(owner, 'GET', `/v1/organizations/${slug}/activity?kind=org_settings_changed`)).json();
    expect(log.data[0]).toMatchObject({
      kind: 'org_settings_changed',
      old_value: { workday_minutes: 480, week_starts_on: 1 },
      new_value: { workday_minutes: 450, week_starts_on: 0 },
    });
  });

  test('settings are range-checked by the schema', async () => {
    expect((await call(admin, 'PATCH', `/v1/organizations/${slug}`, { workweek_days: 8 })).statusCode).toBe(400);
  });
});

describe('members', () => {
  test('lists members with search and paging; email is shown to admins and to oneself only', async () => {
    const asAdmin = (await call(admin, 'GET', `/v1/organizations/${slug}/members?limit=2`)).json();
    expect(asAdmin.meta.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, has_more: true });
    expect(asAdmin.data.every((m: { email: string | null }) => m.email !== null)).toBe(true);

    const asMember = (await call(member, 'GET', `/v1/organizations/${slug}/members`)).json().data as {
      email: string | null;
      name: string;
    }[];
    expect(asMember.filter(m => m.email !== null).map(m => m.name)).toEqual(['Member']);

    const found = (await call(member, 'GET', `/v1/organizations/${slug}/members?q=admin`)).json();
    expect(found.data.map((m: { name: string }) => m.name)).toEqual(['Admin']);
  });

  test('a member changes their own username, not anyone else’s', async () => {
    const me = (await call(member, 'GET', `/v1/organizations/${slug}`)).json().data.membership.username;
    const adminName = (await call(admin, 'GET', `/v1/organizations/${slug}`)).json().data.membership.username;

    const renamed = await call(member, 'PATCH', `/v1/organizations/${slug}/members/${me}`, { username: '@Mem.ber' });
    expect(renamed.json().data.username).toBe('Mem.ber');
    expect(
      (await call(member, 'PATCH', `/v1/organizations/${slug}/members/${adminName}`, { username: 'x' })).json().error
        .code,
    ).toBe('member.username_not_own');
    expect(
      (await call(member, 'PATCH', `/v1/organizations/${slug}/members/mem.ber`, { username: 'bad name' })).statusCode,
    ).toBe(400);
    expect(
      (
        await call(member, 'PATCH', `/v1/organizations/${slug}/members/mem.ber`, { username: adminName.toUpperCase() })
      ).json().error.code,
    ).toBe('member.username_taken');
  });

  test('role changes need an org admin, email the promoted member, and never touch the owner', async () => {
    expect(
      (await call(member, 'PATCH', `/v1/organizations/${slug}/members/mem.ber`, { org_role: 'org_admin' })).statusCode,
    ).toBe(403);

    const raised = await call(admin, 'PATCH', `/v1/organizations/${slug}/members/mem.ber`, { org_role: 'org_admin' });
    expect(raised.json().data.org_role).toBe('org_admin');
    expect(box.last(member.email)?.subject).toBe('email.role_raised.subject');
    await call(admin, 'PATCH', `/v1/organizations/${slug}/members/mem.ber`, { org_role: 'member' });

    const ownerName = (await call(owner, 'GET', `/v1/organizations/${slug}`)).json().data.membership.username;
    const res = await call(admin, 'PATCH', `/v1/organizations/${slug}/members/${ownerName}`, { org_role: 'member' });
    expect(res.json().error.code).toBe('member.owner_role_fixed');

    const roles = (await call(owner, 'GET', `/v1/organizations/${slug}/activity?kind=role_changed`)).json().data;
    expect(roles.map((r: { new_value: { org_role: string } }) => r.new_value.org_role)).toEqual([
      'member',
      'org_admin',
    ]);
  });

  test('removal is a soft delete: access goes, the session forgets the org, the username stays reserved', async () => {
    expect((await call(member, 'DELETE', `/v1/organizations/${slug}/members/mem.ber`)).statusCode).toBe(403);
    const ownerName = (await call(owner, 'GET', `/v1/organizations/${slug}`)).json().data.membership.username;
    expect((await call(admin, 'DELETE', `/v1/organizations/${slug}/members/${ownerName}`)).json().error.code).toBe(
      'member.owner_not_removable',
    );

    await call(member, 'POST', '/v1/me/current-organization', { slug });
    const removed = await call(admin, 'DELETE', `/v1/organizations/${slug}/members/mem.ber`);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data.username).toBe('Mem.ber');
    expect(box.last(member.email)?.subject).toBe('email.member_removed.subject');

    expect((await call(member, 'GET', `/v1/organizations/${slug}`)).statusCode).toBe(404);
    expect((await call(member, 'GET', '/v1/me')).json().data.current_organization_slug).toBeNull();
    const sessions = (await call(member, 'GET', '/v1/me/sessions')).json().data;
    expect(
      sessions.every((s: { current_organization_slug: string | null }) => s.current_organization_slug === null),
    ).toBe(true);
    expect((await call(admin, 'GET', `/v1/organizations/${slug}/members/mem.ber`)).statusCode).toBe(404);

    await joinByLink(member);
    const back = (await call(member, 'GET', `/v1/organizations/${slug}`)).json().data.membership;
    expect(back.username).toBe('Mem.ber');
  });
});

describe('GET /v1/organizations/:slug/activity', () => {
  test('is for org admins only, and a 404 to outsiders', async () => {
    expect((await call(member, 'GET', `/v1/organizations/${slug}/activity`)).statusCode).toBe(403);
    expect((await call(outsider, 'GET', `/v1/organizations/${slug}/activity`)).statusCode).toBe(404);
  });

  test('pages by cursor, newest first, and filters by actor, kind and date', async () => {
    const first = (await call(owner, 'GET', `/v1/organizations/${slug}/activity?limit=2`)).json();
    expect(first.data.length).toBe(2);
    expect(first.meta.pagination.has_more).toBe(true);
    const next = (
      await call(owner, 'GET', `/v1/organizations/${slug}/activity?limit=2&cursor=${first.meta.pagination.next_cursor}`)
    ).json();
    expect(next.data[0].id).toBeLessThan(first.data[1].id);

    const ownerName = (await call(owner, 'GET', `/v1/organizations/${slug}`)).json().data.membership.username;
    const byOwner = (await call(owner, 'GET', `/v1/organizations/${slug}/activity?actor=@${ownerName}`)).json().data;
    expect(byOwner.every((r: { actor: { username: string } }) => r.actor.username === ownerName)).toBe(true);

    const kinds = (
      await call(owner, 'GET', `/v1/organizations/${slug}/activity?kind=member_joined&kind=member_removed`)
    ).json().data as { kind: string }[];
    expect(new Set(kinds.map(k => k.kind))).toEqual(new Set(['member_joined', 'member_removed']));

    expect((await call(owner, 'GET', `/v1/organizations/${slug}/activity?from=2999-01-01`)).json().data).toEqual([]);
    expect((await call(owner, 'GET', `/v1/organizations/${slug}/activity?cursor=junk`)).json().error.code).toBe(
      'activity.invalid_cursor',
    );
  });

  test('exports CSV and records that it was asked for', async () => {
    const res = await call(owner, 'GET', `/v1/organizations/${slug}/activity/export.csv?kind=member_joined`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`${slug}-activity-`);
    const lines = res.body.trim().split('\r\n');
    expect(lines[0]).toBe('id,created_at,kind,actor,target_type,target_id,old_value,new_value,ip');
    expect(lines.slice(1).every(l => l.includes(',member_joined,'))).toBe(true);

    const exported = (await call(owner, 'GET', `/v1/organizations/${slug}/activity?kind=export_requested`)).json().data;
    expect(exported[0].new_value).toMatchObject({ export: 'org_activity' });
    expect((await call(member, 'GET', `/v1/organizations/${slug}/activity/export.csv`)).statusCode).toBe(403);
  });
});

describe('signing in', () => {
  const signIn = (who: Person) =>
    app.inject({ method: 'POST', url: '/v1/auth/sign-in', headers: origin, body: { email: who.email, password } });

  test('a returning member starts in their organisation; an account with none starts in none', async () => {
    const res = await signIn(owner);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.current_organization_slug).toBe(slug);
    const sid = res.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie: `${SESSION_COOKIE_NAME}=${sid}` } });
    expect(me.json().data.current_organization_slug).toBe(slug);

    const projects = await app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sid}` },
    });
    expect(projects.statusCode).toBe(200);

    const none = await signIn(outsider);
    const outsiderSid = none.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;
    const outsiderMe = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${outsiderSid}` },
    });
    expect(outsiderMe.json().data.current_organization_slug).toBeNull();
  });
});
