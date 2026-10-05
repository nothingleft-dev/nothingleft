import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { isolatedRateLimit, testApp, testEnv } from './helpers.ts';
import { mailbox, origin, signUp, uniqueStamp, verify, type Person } from './people.ts';

// Each test walks a whole flow over HTTP against the hosted database; 30s is too tight.
setDefaultTimeout(120_000);

const box = mailbox();
let app: Awaited<ReturnType<typeof testApp>>;
let admin: Person;
let projectAdmin: Person;
let projectAdminName: string;
const slug = `inv-${uniqueStamp()}`;

const call = (who: Person | null, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: object) =>
  app.inject({ method, url, headers: who?.headers ?? origin, ...(body ? { body } : {}) });
const tokenOf = (url: string) => /\/invite\/(.+)$/.exec(url)![1]!;

async function link(body: object = {}, scope = `/v1/organizations/${slug}`, who = admin) {
  const res = await call(who, 'POST', `${scope}/invitations/links`, body);
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().data as { id: number; url: string; use_count: number; status: string };
}

beforeAll(async () => {
  app = await testApp({ mailer: box.mailer });
  [admin, projectAdmin] = await Promise.all([signUp(app, box, 'Admin'), signUp(app, box, 'Lead')]);
  await call(admin, 'POST', '/v1/organizations', { name: 'Invites Inc', slug });
  await call(admin, 'POST', '/v1/projects', { name: 'Partner Portal' });
  await call(projectAdmin, 'POST', '/v1/invitations/accept', { token: tokenOf((await link()).url) });
  projectAdminName = (await call(projectAdmin, 'GET', `/v1/organizations/${slug}`)).json().data.membership.username;
  await call(admin, 'POST', '/v1/projects/PP/members', { username: projectAdminName, role: 'project_admin' });
});

afterAll(async () => {
  await app.close();
});

describe('share links', () => {
  test('preview states what is being joined, to anyone holding the link', async () => {
    const created = await link({ project_role: 'observer' }, '/v1/projects/PP');
    expect(created).toMatchObject({ status: 'active', use_count: 0 });
    const res = await call(null, 'POST', '/v1/invitations/preview', { token: tokenOf(created.url) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      kind: 'link',
      organization: { slug, name: 'Invites Inc' },
      project: { key: 'PP', name: 'Partner Portal' },
      invited_by: { name: 'Admin' },
      org_role: 'member',
      project_role: 'observer',
      already_member: null,
    });
    expect((await call(null, 'POST', '/v1/invitations/preview', { token: 'nope' })).json().error.code).toBe(
      'invitation.not_found',
    );
  });

  test('path A by password: the account must verify before the membership is granted', async () => {
    const invite = await link({}, '/v1/projects/PP');
    const token = tokenOf(invite.url);
    const newcomer = await signUp(app, box, 'Newcomer', { verify: false, invitation_token: token });
    expect(String(box.last(newcomer.email)?.params?.['url'])).toContain(
      `next=${encodeURIComponent(`/invite/${token}`)}`,
    );

    const blocked = await call(newcomer, 'POST', '/v1/invitations/accept', { token });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('auth.email_unverified');

    await verify(app, box, newcomer.email);
    const accepted = await call(newcomer, 'POST', '/v1/invitations/accept', { token });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().data).toMatchObject({
      project_key: 'PP',
      already_member: false,
      organization: { slug, membership: { org_role: 'member', is_owner: false } },
    });
    expect((await call(newcomer, 'GET', '/v1/projects/PP')).json().data.my_role).toBe('contributor');

    const again = await call(newcomer, 'POST', '/v1/invitations/accept', { token });
    expect(again.json().data.already_member).toBe(true);
    expect((await call(newcomer, 'POST', '/v1/invitations/preview', { token })).json().data.already_member).toBe(true);

    const uses = (await call(admin, 'GET', `/v1/organizations/${slug}/invitations/${invite.id}/uses`)).json().data;
    expect(uses.map((u: { name: string }) => u.name)).toEqual(['Newcomer']);
    expect((await call(admin, 'GET', `/v1/organizations/${slug}/invitations/${invite.id}`)).json().data.use_count).toBe(
      1,
    );
  });

  test('max_uses, expiry, revocation and the email domain are all enforced at accept', async () => {
    const once = await link({ max_uses: 1 });
    const [a, b] = await Promise.all([signUp(app, box, 'Aa'), signUp(app, box, 'Bb')]);
    expect((await call(a, 'POST', '/v1/invitations/accept', { token: tokenOf(once.url) })).statusCode).toBe(200);
    const late = await call(b, 'POST', '/v1/invitations/accept', { token: tokenOf(once.url) });
    expect(late.statusCode).toBe(410);
    expect(late.json().error.code).toBe('invitation.exhausted');

    const expired = await link({ expires_at: new Date(Date.now() - 60_000).toISOString() });
    expect((await call(b, 'POST', '/v1/invitations/accept', { token: tokenOf(expired.url) })).json().error.code).toBe(
      'invitation.expired',
    );

    const domain = await link({ allowed_email_domain: 'nothingleft.dev' });
    expect((await call(b, 'POST', '/v1/invitations/accept', { token: tokenOf(domain.url) })).json().error.code).toBe(
      'invitation.domain_not_allowed',
    );

    const revoked = await link();
    const res = await call(admin, 'DELETE', `/v1/organizations/${slug}/invitations/${revoked.id}`);
    expect(res.json().data.status).toBe('revoked');
    expect((await call(b, 'POST', '/v1/invitations/accept', { token: tokenOf(revoked.url) })).json().error.code).toBe(
      'invitation.revoked',
    );
  });

  test('rotate issues a new URL with the same settings and kills the old one', async () => {
    const original = await link({ max_uses: 5 });
    const rotated = (await call(admin, 'POST', `/v1/organizations/${slug}/invitations/${original.id}/rotate`)).json()
      .data;
    expect(rotated.url).not.toBe(original.url);
    expect(rotated.max_uses).toBe(5);
    expect((await call(null, 'POST', '/v1/invitations/preview', { token: tokenOf(original.url) })).statusCode).toBe(
      404,
    );
    expect((await call(null, 'POST', '/v1/invitations/preview', { token: tokenOf(rotated.url) })).statusCode).toBe(200);

    const kinds = (await call(admin, 'GET', `/v1/organizations/${slug}/activity?kind=invite_rotated`)).json().data;
    expect(kinds[0].target_id).toBe(String(original.id));
  });

  test('a link keeps its URL, so the Invites tab can show it again', async () => {
    const created = await link();
    const listed = (await call(admin, 'GET', `/v1/organizations/${slug}/invitations`)).json().data;
    expect(listed.find((i: { id: number }) => i.id === created.id).url).toBe(created.url);
  });
});

describe('who may create invitations', () => {
  test('a project admin invites to their project, but cannot make org admins or invite to the organisation', async () => {
    const own = await call(projectAdmin, 'POST', '/v1/projects/PP/invitations/links', {});
    expect(own.statusCode).toBe(201);
    expect(
      (await call(projectAdmin, 'POST', '/v1/projects/PP/invitations/links', { org_role: 'org_admin' })).statusCode,
    ).toBe(403);
    expect((await call(projectAdmin, 'POST', `/v1/organizations/${slug}/invitations/links`, {})).statusCode).toBe(403);
    expect((await call(projectAdmin, 'GET', '/v1/projects/PP/invitations')).json().data.length).toBeGreaterThan(0);
    expect(
      (await call(projectAdmin, 'GET', `/v1/organizations/${slug}/invitations/${own.json().data.id}`)).statusCode,
    ).toBe(200);
  });

  test('an organisation invite grants no project role', async () => {
    const res = await call(admin, 'POST', `/v1/organizations/${slug}/invitations/links`, { project_role: 'observer' });
    expect(res.json().error.code).toBe('invitation.project_role_needs_project');
  });

  test('an outsider sees nothing', async () => {
    const outsider = await signUp(app, box, 'Outsider');
    expect((await call(outsider, 'GET', `/v1/organizations/${slug}/invitations`)).statusCode).toBe(404);
  });
});

describe('email invitations', () => {
  test('path A by email: sign-up with the token is verified at once and joins without a detour', async () => {
    const email = `invitee-${uniqueStamp()}@test.local`;
    const sent = await call(admin, 'POST', `/v1/organizations/${slug}/invitations/emails`, { emails: [email] });
    expect(sent.statusCode).toBe(201);
    expect(sent.json().data[0]).toMatchObject({ kind: 'email', email, url: null, max_uses: 1, status: 'active' });
    expect(sent.json().data[0].expires_at).not.toBeNull();

    const mail = box.last(email)!;
    expect(mail.subject).toBe('email.invitation.subject');
    expect(mail.params).toMatchObject({ inviter: 'Admin', org: 'Invites Inc', role: 'a member' });
    const token = box.tokenFor(email, 'email.invitation.subject');

    const invitee = await signUp(app, box, 'Invitee', { email, verify: false, invitation_token: token });
    expect((await call(invitee, 'GET', '/v1/me')).json().data.email_verified_at).not.toBeNull();
    expect(box.sent.some(m => m.to === email && m.subject === 'email.verify.subject')).toBe(false);

    const res = await call(invitee, 'POST', '/v1/invitations/accept', { token });
    expect(res.json().data).toMatchObject({ project_key: null, already_member: false });
    expect(box.sent.filter(m => m.to === email).length).toBe(1);
  });

  test('an email invitation is for its address only, and re-inviting supersedes the pending one', async () => {
    const email = `target-${uniqueStamp()}@test.local`;
    await call(admin, 'POST', `/v1/organizations/${slug}/invitations/emails`, { emails: [email] });
    const first = box.tokenFor(email, 'email.invitation.subject');
    await call(admin, 'POST', `/v1/organizations/${slug}/invitations/emails`, { emails: [email] });
    const second = box.tokenFor(email, 'email.invitation.subject');

    expect((await call(null, 'POST', '/v1/invitations/preview', { token: first })).json().error.code).toBe(
      'invitation.revoked',
    );
    const stranger = await signUp(app, box, 'Stranger');
    const res = await call(stranger, 'POST', '/v1/invitations/accept', { token: second });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: 'invitation.email_mismatch' });
  });

  test('path B: an existing account accepts a project invitation, or declines it for good', async () => {
    const existing = await signUp(app, box, 'Existing');
    const sent = await call(projectAdmin, 'POST', '/v1/projects/PP/invitations/emails', {
      emails: [existing.email],
      project_role: 'observer',
    });
    expect(sent.statusCode).toBe(201);
    expect(box.last(existing.email)?.body).toBe('email.invitation_project.body');
    const token = box.tokenFor(existing.email, 'email.invitation.subject');

    expect((await call(existing, 'POST', '/v1/invitations/preview', { token })).json().data).toMatchObject({
      already_member: false,
      email: existing.email,
    });
    const declined = await call(existing, 'POST', '/v1/invitations/decline', { token });
    expect(declined.json().data).toEqual({ ok: true });
    expect((await call(existing, 'POST', '/v1/invitations/accept', { token })).json().error.code).toBe(
      'invitation.revoked',
    );

    await call(projectAdmin, 'POST', '/v1/projects/PP/invitations/emails', { emails: [existing.email] });
    const again = box.tokenFor(existing.email, 'email.invitation.subject');
    expect((await call(existing, 'POST', '/v1/invitations/accept', { token: again })).json().data.project_key).toBe(
      'PP',
    );
  });

  test('inviting someone who already has the access is refused', async () => {
    const res = await call(admin, 'POST', `/v1/organizations/${slug}/invitations/emails`, {
      emails: [projectAdmin.email],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('invitation.already_member');
    const project = await call(admin, 'POST', '/v1/projects/PP/invitations/emails', { emails: [projectAdmin.email] });
    expect(project.json().error.code).toBe('member.already_in_project');
  });

  test('every step is in the audit log', async () => {
    const kinds = (await call(admin, 'GET', `/v1/organizations/${slug}/activity?limit=200`))
      .json()
      .data.map((r: { kind: string }) => r.kind) as string[];
    for (const kind of ['member_invited', 'invite_created', 'invite_revoked', 'invite_rotated', 'member_joined']) {
      expect(kinds).toContain(kind);
    }
  });
});

describe('seats', () => {
  test('joining past the free allowance still succeeds, and the organisation reports the overage', async () => {
    const small = await buildApp({ ...testEnv, FREE_SEAT_LIMIT: 2 }, { mailer: box.mailer, ...isolatedRateLimit() });
    await small.ready();
    try {
      const before = (
        await small.inject({ method: 'GET', url: `/v1/organizations/${slug}`, headers: admin.headers })
      ).json();
      expect(before.data.seats.free).toBe(2);
      expect(before.data.seats.over).toBe(before.data.seats.used - 2);

      const late = await signUp(app, box, 'Late');
      const token = tokenOf((await link()).url);
      const res = await small.inject({
        method: 'POST',
        url: '/v1/invitations/accept',
        headers: late.headers,
        body: { token },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.organization.seats).toMatchObject({
        used: before.data.seats.used + 1,
        over: before.data.seats.over + 1,
      });
    } finally {
      await small.close();
    }
  });
});
