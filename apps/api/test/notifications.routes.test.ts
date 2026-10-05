import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { t } from '@nothingleft/i18n';
import { addCalendarDays } from '@nothingleft/format';
import type { PatScope } from '@nothingleft/types';
import type { Message } from '@lib/email';
import { runQueued, type RecordingQueue } from '@lib/jobs';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import type { Person } from './people.ts';

const KEY = 'NT';
let w: IssueWorld;

const MINUTE = 60_000;

/** Runs every queued fan-out as pg-boss would once its start time passed. */
async function settle(minutes = 11): Promise<number> {
  const queue = w.app.jobQueue as RecordingQueue;
  const at = new Date(Date.now() + minutes * MINUTE);
  let written = 0;
  // A run that finds rows still inside the window queues itself again; one pass is one tick of the clock.
  for (const job of queue.pending.splice(0)) written += await runQueued(w.app.queuedHandlers, job, at);
  return written;
}

async function newIssue(who: Person = w.admin, body: Record<string, unknown> = {}): Promise<string> {
  const res = await w.call(who, 'POST', '/v1/issues', { project: KEY, title: 'Checkout fails', ...body });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().data.key as string;
}

type Group = {
  subject: { key?: string; slug?: string; type: string };
  count: number;
  unread_count: number;
  kinds: string[];
  notifications: {
    kind: string;
    summary: string;
    actor: { username: string } | null;
    detail: Record<string, unknown>;
  }[];
};
const inbox = async (who: Person, query = ''): Promise<Group[]> =>
  (await w.call(who, 'GET', `/v1/notifications${query}`)).json().data as Group[];
const about = async (who: Person, key: string) => (await inbox(who)).find(g => g.subject.key === key);

const render = (m: Message) =>
  typeof m.body === 'string' ? t(m.body, m.params) : m.body.map(l => t(l.key, l.params)).join('\n');
const mailTo = (who: Person) => w.box.sent.filter(m => m.to === who.email && m.headers?.['List-Unsubscribe']);

async function token(who: Person, scopes: PatScope[]): Promise<Person> {
  const res = await w.call(who, 'POST', '/v1/me/tokens', { name: `t-${scopes.join('-')}`, scopes });
  return { email: who.email, sid: '', headers: { authorization: `Bearer ${res.json().data.token}` } };
}

beforeAll(async () => {
  w = await issueWorld(KEY);
});

afterAll(async () => {
  await w.close();
});

describe('fan-out', () => {
  test('nothing is written before the window settles; assign-then-correct tells only the final assignee', async () => {
    const key = await newIssue(w.contributor);
    await w.call(w.contributor, 'PATCH', `/v1/issues/${key}`, { assignees: [w.projectAdmin.username] });
    await w.call(w.contributor, 'PATCH', `/v1/issues/${key}`, { assignees: [w.admin.username] });
    const queue = w.app.jobQueue as RecordingQueue;
    expect(queue.pending.filter(j => j.options.singletonKey.startsWith('issue:'))).toHaveLength(1);
    const job = queue.pending[0]!;
    expect(job.options.startAfter.getTime() - Date.now()).toBeGreaterThan(9 * MINUTE);
    // Run early: the rows have not settled, so it writes nothing and waits again.
    expect(await runQueued(w.app.queuedHandlers, job, new Date())).toBe(0);
    await settle();
    expect(await about(w.projectAdmin, key)).toBeUndefined();
    const group = await about(w.admin, key);
    expect(group?.kinds).toEqual(['assigned']);
    expect(group?.notifications[0]).toMatchObject({ kind: 'assigned', actor: { username: w.contributor.username } });
    expect(group?.notifications[0]!.summary).toBe(`Casey assigned ${key} to you`);
    // The actor never notifies themselves.
    expect(await about(w.contributor, key)).toBeUndefined();
  });

  test('assigning yourself notifies nobody; a net-zero change leaves nothing', async () => {
    const key = await newIssue(w.admin);
    await w.call(w.contributor, 'PATCH', `/v1/issues/${key}`, { assignees: [w.contributor.username] });
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Major' });
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Normal' });
    await settle();
    expect(await about(w.contributor, key)).toBeUndefined();
    expect(await about(w.admin, key)).toBeUndefined();
  });

  test('watchers hear comments; a mentioned watcher gets one mention, not two rows', async () => {
    const key = await newIssue(w.admin);
    await w.call(w.observer, 'PUT', `/v1/issues/${key}/watch`);
    await w.call(w.projectAdmin, 'PUT', `/v1/issues/${key}/watch`);
    await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, {
      body_md: `@${w.observer.username} can you confirm?`,
    });
    await settle();
    expect((await about(w.observer, key))?.notifications.map(n => n.kind)).toEqual(['mentioned']);
    expect((await about(w.projectAdmin, key))?.kinds).toEqual(['commented']);
    expect((await about(w.admin, key))?.kinds).toEqual(['commented']);
  });

  test('resolution is one resolved row for the creator and watchers, never also status_changed', async () => {
    const key = await newIssue(w.admin);
    await w.call(w.observer, 'PUT', `/v1/issues/${key}/watch`);
    await w.call(w.contributor, 'PATCH', `/v1/issues/${key}`, { status: 'In Progress' });
    await settle();
    expect((await about(w.admin, key))?.kinds).toEqual(['status_changed']);
    const statuses = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/statuses`)).json().data as {
      name: string;
      category: string;
    }[];
    const done = statuses.find(s => s.category === 'done')!.name;
    // Another actor, so the change is its own row rather than coalescing into the first.
    await w.call(w.projectAdmin, 'PATCH', `/v1/issues/${key}`, { status: done });
    await settle();
    const group = await about(w.admin, key);
    expect(group?.notifications.map(n => n.kind)).toEqual(['resolved', 'status_changed']);
    expect((await about(w.observer, key))?.notifications.map(n => n.kind)).toEqual(['resolved', 'status_changed']);
  });

  test('a notification never reaches someone who cannot open the issue', async () => {
    const key = await newIssue(w.admin);
    // A member of the organisation with no access to the project can still be @named.
    const plain = w.projectAdmin;
    await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/members/${plain.username}`);
    await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: `@${plain.username} look` });
    await settle();
    expect(await about(plain, key)).toBeUndefined();
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/members`, { username: plain.username, role: 'project_admin' });
  });

  test('losing access hides what was already delivered, and the stranger sees nothing', async () => {
    const key = await newIssue(w.admin);
    await w.call(w.observer, 'PUT', `/v1/issues/${key}/watch`);
    await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: 'Deployed.' });
    await settle();
    expect(await about(w.observer, key)).toBeDefined();
    await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/members/${w.observer.username}`);
    expect(await about(w.observer, key)).toBeUndefined();
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/members`, { username: w.observer.username, role: 'observer' });
    expect(await about(w.observer, key)).toBeDefined();
    expect(await inbox(w.outsider)).toEqual([]);
    // A trashed issue drops out of the inbox, and comes back with a restore.
    await w.call(w.admin, 'DELETE', `/v1/issues/${key}`);
    expect(await about(w.observer, key)).toBeUndefined();
    await w.call(w.admin, 'POST', `/v1/issues/${key}/restore`);
    expect(await about(w.observer, key)).toBeDefined();
  });

  test('a linked notification names the other issue only to watchers who can open its project', async () => {
    await w.call(w.admin, 'POST', '/v1/projects', { name: 'Restricted Ops', key: 'NTO' });
    await w.call(w.admin, 'POST', '/v1/projects/NTO/members', { username: w.projectAdmin.username, role: 'observer' });
    const key = await newIssue(w.admin);
    const hidden = (await w.call(w.admin, 'POST', '/v1/issues', { project: 'NTO', title: 'Vendor contract' })).json()
      .data.key as string;
    await w.call(w.observer, 'PUT', `/v1/issues/${key}/watch`);
    await w.call(w.projectAdmin, 'PUT', `/v1/issues/${key}/watch`);
    const linked = await w.call(w.admin, 'POST', `/v1/issues/${key}/links`, { link: 'relates to', issues: [hidden] });
    expect(linked.statusCode).toBe(201);
    await settle();
    const linkedFor = async (who: Person) => (await about(who, key))?.notifications.find(n => n.kind === 'linked');
    const outside = await linkedFor(w.observer);
    expect(outside?.detail).toMatchObject({ link: 'relates to', other_issue: null });
    expect(outside?.summary).toBe(`Alex linked ${key}: relates to an issue in another project`);
    const inside = await linkedFor(w.projectAdmin);
    expect(inside?.detail).toMatchObject({ link: 'relates to', other_issue: hidden });
    expect(inside?.summary).toBe(`Alex linked ${key}: relates to ${hidden}`);
    await w.call(w.projectAdmin, 'POST', '/v1/notifications/read', { all: true });
  });

  test('sprint start tells the assignees of its issues; an article publication tells the members', async () => {
    const key = await newIssue(w.admin, { assignees: [w.contributor.username] });
    await settle();
    const sprint = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints`, { name: `Sprint ${Date.now()}` });
    const slug = sprint.json().data.slug as string;
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { sprint: slug });
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints/${slug}/start`, { end_date: '2030-01-01' });
    await settle(0);
    const started = (await inbox(w.contributor, '?kind=sprint_started')).find(g => g.subject.type === 'sprint');
    expect(started?.notifications[0]!.summary).toContain('started');

    const draft = await w.call(w.contributor, 'POST', `/v1/projects/${KEY}/articles`, {
      title: `Runbook ${Date.now()}`,
      body_md: 'Draft',
    });
    await settle();
    expect(await inbox(w.observer, '?kind=article_published')).toEqual([]);
    await w.call(w.contributor, 'PATCH', `/v1/projects/${KEY}/articles/${draft.json().data.slug}`, {
      status: 'published',
    });
    await settle();
    expect((await inbox(w.observer, '?kind=article_published')).length).toBe(1);
    expect(await inbox(w.contributor, '?kind=article_published')).toEqual([]);
  });
});

describe('inbox', () => {
  test('one entry per issue, filters, unread count, mark read', async () => {
    const key = await newIssue(w.admin);
    await w.call(w.observer, 'PUT', `/v1/issues/${key}/watch`);
    await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: 'First' });
    await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: 'Second' });
    await settle();
    const group = await about(w.observer, key);
    expect(group).toMatchObject({ count: 2, unread_count: 2, kinds: ['commented'] });
    expect((await inbox(w.observer, `?project=${KEY}&kind=commented`)).some(g => g.subject.key === key)).toBe(true);
    expect((await inbox(w.observer, '?kind=assigned')).some(g => g.subject.key === key)).toBe(false);
    const bad = await w.call(w.observer, 'GET', '/v1/notifications?kind=nope');
    expect(bad.statusCode).toBe(400);

    const expanded = await w.call(w.observer, 'GET', `/v1/issues/${key}/notifications?limit=1`);
    expect(expanded.json().data).toHaveLength(1);
    expect(expanded.json().meta.pagination).toMatchObject({ total: 2, has_more: true });

    const before = (await w.call(w.observer, 'GET', '/v1/notifications/unread-count')).json().data;
    expect(before.count).toBeGreaterThan(0);
    expect(before.organizations[0].slug).toBe(w.slug);
    const marked = await w.call(w.observer, 'POST', '/v1/notifications/read', { issues: [key] });
    expect(marked.json().data.marked).toBe(2);
    expect(marked.json().data.unread.count).toBe(before.count - 1);
    expect((await about(w.observer, key))?.unread_count).toBe(0);
    expect(await inbox(w.observer, '?unread=true').then(g => g.some(x => x.subject.key === key))).toBe(false);

    const empty = await w.call(w.observer, 'POST', '/v1/notifications/read', {});
    expect(empty.json().error.code).toBe('notification.mark_target_required');
    const all = await w.call(w.observer, 'POST', '/v1/notifications/read', { all: true });
    expect(all.json().data.unread.count).toBe(0);
  });

  test('a token reads with issues:read and needs issues:write to mark read', async () => {
    const reader = await token(w.observer, ['issues:read']);
    expect((await w.call(reader, 'GET', '/v1/notifications')).statusCode).toBe(200);
    const refused = await w.call(reader, 'POST', '/v1/notifications/read', { all: true });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toMatchObject({ code: 'token.scope_missing', scope: 'issues:write' });
    const none = await token(w.observer, ['time:write']);
    expect((await w.call(none, 'GET', '/v1/notifications/unread-count')).json().error.scope).toBe('issues:read');
  });
});

describe('across organisations', () => {
  test('an entry from another organisation expands and marks read with org; facets span both', async () => {
    const other = `${w.slug}-x`;
    const link = (await w.call(w.outsider, 'POST', `/v1/organizations/${other}/invitations/links`, {})).json().data;
    await w.call(w.contributor, 'POST', '/v1/invitations/accept', { token: /\/invite\/(.+)$/.exec(link.url)![1] });
    await w.call(w.contributor, 'POST', '/v1/me/current-organization', { slug: w.slug });
    const theirs = (await w.call(w.outsider, 'GET', `/v1/organizations/${other}/members?limit=50`)).json().data as {
      name: string;
      username: string;
    }[];
    const handle = theirs.find(m => m.name === 'Casey')!.username;
    await w.call(w.outsider, 'POST', '/v1/projects', { name: 'Elsewhere Ops', key: 'XT' });
    await w.call(w.outsider, 'POST', '/v1/projects/XT/members', { username: handle, role: 'contributor' });
    const created = await w.call(w.outsider, 'POST', '/v1/issues', {
      project: 'XT',
      title: 'Rotate keys',
      assignees: [handle],
    });
    const key = created.json().data.key as string;
    await w.call(w.outsider, 'POST', `/v1/issues/${key}/comments`, { body_md: `@${handle} when you can` });
    await settle();

    const entry = (await inbox(w.contributor)).find(g => g.subject.key === key);
    expect(entry).toMatchObject({ count: 2, subject: { organization: { slug: other } } });
    // The session is in the first organisation, so the key alone resolves there and is absent.
    expect((await w.call(w.contributor, 'GET', `/v1/issues/${key}/notifications`)).statusCode).toBe(404);
    const expanded = await w.call(w.contributor, 'GET', `/v1/issues/${key}/notifications?org=${other}`);
    expect(expanded.json().data).toHaveLength(2);
    const stranger = await w.call(w.observer, 'GET', `/v1/issues/${key}/notifications?org=${other}`);
    expect(stranger.json().error).toMatchObject({ code: 'organization.not_found', valid_values: [w.slug] });

    const marked = await w.call(w.contributor, 'POST', '/v1/notifications/read', { issues: [key], org: other });
    expect(marked.json().data.marked).toBe(2);

    const facets = (await w.call(w.contributor, 'GET', '/v1/notifications/facets')).json().data;
    expect(facets.organizations.map((o: { slug: string }) => o.slug).sort()).toEqual([w.slug, other].sort());
    expect(facets.projects).toContainEqual({
      key: 'XT',
      name: 'Elsewhere Ops',
      organization: { slug: other, name: 'Elsewhere' },
    });
    expect(facets.projects.some((p: { key: string }) => p.key === KEY)).toBe(true);
    const reader = await token(w.observer, ['time:write']);
    expect((await w.call(reader, 'GET', '/v1/notifications/facets')).json().error.scope).toBe('issues:read');
  });
});

describe('preferences and email', () => {
  test('every email is off by default; reaction is in-app only; turn everything off', async () => {
    const prefs = (await w.call(w.contributor, 'GET', '/v1/notifications/preferences')).json().data.preferences;
    expect(prefs.every((p: { email: string }) => p.email === 'off')).toBe(true);
    expect(prefs.find((p: { kind: string }) => p.kind === 'mentioned')).toMatchObject({
      area: 'comments',
      most_commonly_enabled: true,
    });
    expect(prefs.find((p: { kind: string }) => p.kind === 'reaction').options).toEqual(['off']);
    const refused = await w.call(w.contributor, 'PATCH', '/v1/notifications/preferences', {
      email: { reaction: 'instant' },
    });
    expect(refused.json().error).toMatchObject({ code: 'notification.email_not_offered', valid_values: ['off'] });
    await w.call(w.contributor, 'PATCH', '/v1/notifications/preferences', { email: { commented: 'weekly_digest' } });
    const off = await w.call(w.contributor, 'PATCH', '/v1/notifications/preferences', { all: 'off' });
    expect(off.json().data.preferences.every((p: { email: string }) => p.email === 'off')).toBe(true);
  });

  test('instant email for a mention, with one-click unsubscribe that turns that kind off', async () => {
    await w.call(w.observer, 'PATCH', '/v1/notifications/preferences', { email: { mentioned: 'instant' } });
    const key = await newIssue(w.admin);
    await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: `@${w.observer.username} ping` });
    await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: 'no mention here' });
    const sent = mailTo(w.observer).length;
    await settle();
    const mails = mailTo(w.observer);
    expect(mails.length).toBe(sent + 1);
    const mail = mails.at(-1)!;
    expect(t(mail.subject, mail.params)).toBe(`Casey mentioned you in a comment on ${key} · Nothing Left`);
    expect(render(mail)).toContain(`/issue/${key}`);
    expect(mail.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const link = /token=([^>&\s]+)/.exec(mail.headers!['List-Unsubscribe']!)![1]!;

    const preview = await w.app.inject({ method: 'GET', url: `/v1/notifications/unsubscribe?token=${link}` });
    expect(preview.json().data).toEqual({ kinds: ['mentioned'], cadence: null, applied: false });
    const click = await w.app.inject({
      method: 'POST',
      url: `/v1/notifications/unsubscribe?token=${link}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    });
    expect(click.json().data.applied).toBe(true);
    const prefs = (await w.call(w.observer, 'GET', '/v1/notifications/preferences')).json().data.preferences;
    expect(prefs.find((p: { kind: string }) => p.kind === 'mentioned').email).toBe('off');
    const forged = await w.app.inject({ method: 'POST', url: `/v1/notifications/unsubscribe?token=${link}x` });
    expect(forged.json().error.code).toBe('notification.unsubscribe_invalid');
  });

  test('the daily digest goes at 9am local, grouped by project, never empty and never twice', async () => {
    await w.call(w.admin, 'PATCH', '/v1/notifications/preferences', { email: { commented: 'daily_digest' } });
    await w.call(w.projectAdmin, 'PATCH', '/v1/notifications/preferences', { email: { linked: 'daily_digest' } });
    const key = await newIssue(w.admin);
    await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: 'Update' });
    await settle();
    const nine = new Date();
    nine.setUTCHours(9, 20, 0, 0);
    if (nine.getTime() < Date.now()) nine.setTime(nine.getTime() + 86_400_000);
    const before = w.box.sent.length;
    expect(await w.app.jobHandlers['email.digest'](new Date(nine.getTime() - 3 * 3_600_000))).toBe(0);
    await w.app.jobHandlers['email.digest'](nine);
    const digests = w.box.sent.slice(before).filter(m => m.subject === 'email.digest.daily.subject');
    expect(digests.map(m => m.to)).toEqual([w.admin.email]);
    const text = render(digests[0]!);
    expect(text).toContain('Acme Web');
    expect(text).toContain('Updates on issues you watch');
    expect(digests[0]!.headers!['List-Unsubscribe']).toContain('/v1/notifications/unsubscribe?token=');
    expect(await w.app.jobHandlers['email.digest'](nine)).toBe(0);
  });

  test('due_soon the day before in the recipient’s timezone, from 9am, once per issue', async () => {
    const ten = new Date();
    ten.setUTCHours(10, 0, 0, 0);
    const tomorrow = addCalendarDays(ten.toISOString().slice(0, 10), 1);
    const key = await newIssue(w.admin, { assignees: [w.contributor.username], due_date: tomorrow });
    await settle();
    const early = new Date(ten.getTime() - 3 * 3_600_000);
    await w.app.jobHandlers['notifications.due'](early);
    expect((await inbox(w.contributor, '?kind=due_soon')).some(g => g.subject.key === key)).toBe(false);
    await w.app.jobHandlers['notifications.due'](ten);
    await w.app.jobHandlers['notifications.due'](ten);
    const group = (await inbox(w.contributor, '?kind=due_soon')).find(g => g.subject.key === key);
    expect(group?.count).toBe(1);
    expect(group?.notifications[0]!.actor).toBeNull();
    expect(await about(w.admin, key)).toBeUndefined();
  });

  test('purge deletes read rows after 30 days and unread after 90', async () => {
    const key = await newIssue(w.admin);
    await w.call(w.observer, 'PUT', `/v1/issues/${key}/watch`);
    await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: 'Old news' });
    await settle();
    await w.call(w.observer, 'POST', '/v1/notifications/read', { issues: [key] });
    await w.app.jobHandlers['notifications.purge'](new Date(Date.now() + 29 * 86_400_000));
    expect(await about(w.observer, key)).toBeDefined();
    expect(await w.app.jobHandlers['notifications.purge'](new Date(Date.now() + 31 * 86_400_000))).toBeGreaterThan(0);
    expect(await about(w.observer, key)).toBeUndefined();
  });
});

describe('article drafts', () => {
  test('a draft’s entry shows to its author while a Contributor, to Project Admins always, to Observers never', async () => {
    const created = await w.call(w.contributor, 'POST', `/v1/projects/${KEY}/articles`, {
      title: `Playbook ${Date.now()}`,
      body_md: 'Steps',
      status: 'published',
    });
    const slug = created.json().data.slug as string;
    await settle();
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/articles/${slug}/comments`, {
      body_md: `@${w.contributor.username} please review`,
    });
    await settle();

    const entry = async (who: Person, query = '') =>
      (await inbox(who, query)).find(g => g.subject.type === 'article' && g.subject.slug === slug);
    const unread = async (who: Person) =>
      (await w.call(who, 'GET', '/v1/notifications/unread-count')).json().data.count as number;
    const expand = (who: Person) =>
      w.call(who, 'GET', `/v1/projects/${KEY}/articles/${slug}/notifications?org=${w.slug}`);

    expect(await entry(w.contributor)).toBeDefined();
    expect(await entry(w.projectAdmin)).toBeDefined();
    expect(await entry(w.observer)).toBeDefined();

    await w.call(w.contributor, 'PATCH', `/v1/projects/${KEY}/articles/${slug}`, { status: 'draft' });
    expect(await entry(w.contributor)).toBeDefined();
    expect(await entry(w.projectAdmin)).toBeDefined();
    expect(await entry(w.projectAdmin, `?project=${KEY}`)).toBeDefined();
    expect((await expand(w.projectAdmin)).statusCode).toBe(200);
    expect(await entry(w.observer)).toBeUndefined();
    expect((await expand(w.observer)).statusCode).toBe(404);

    const before = await unread(w.contributor);
    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/members/${w.contributor.username}`, { role: 'observer' });
    try {
      expect(await entry(w.contributor)).toBeUndefined();
      expect(await unread(w.contributor)).toBe(before - 1);
      expect((await expand(w.contributor)).json().error.code).toBe('article.not_found');
      const marked = await w.call(w.contributor, 'POST', '/v1/notifications/read', {
        articles: [{ project: KEY, slug }],
        org: w.slug,
      });
      expect(marked.json().error.code).toBe('article.not_found');
    } finally {
      await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/members/${w.contributor.username}`, {
        role: 'contributor',
      });
    }
  });

  test('a digest carries an author’s entry about their own draft until they are demoted, and an observer’s never', async () => {
    await w.call(w.contributor, 'PATCH', '/v1/notifications/preferences', { email: { mentioned: 'daily_digest' } });
    await w.call(w.observer, 'PATCH', '/v1/notifications/preferences', {
      email: { article_published: 'daily_digest', mentioned: 'daily_digest' },
    });
    const draftWithEntry = async () => {
      const title = `Digest ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const created = await w.call(w.contributor, 'POST', `/v1/projects/${KEY}/articles`, { title, body_md: 'Steps' });
      const path = `/v1/projects/${KEY}/articles/${created.json().data.slug}`;
      await w.call(w.contributor, 'PATCH', path, { status: 'published' });
      await settle();
      await w.call(w.admin, 'POST', `${path}/comments`, {
        body_md: `@${w.contributor.username} @${w.observer.username} please review`,
      });
      await settle();
      await w.call(w.contributor, 'PATCH', path, { status: 'draft' });
      return title;
    };
    const nineOn = (daysAgo: number) => {
      const at = new Date();
      at.setUTCHours(9, 20, 0, 0);
      at.setTime(at.getTime() - daysAgo * 86_400_000);
      return at;
    };

    const first = await draftWithEntry();
    const sent = async (at: Date) => {
      const before = w.box.sent.length;
      await w.app.jobHandlers['email.digest'](at);
      return w.box.sent.slice(before).filter(m => m.subject === 'email.digest.daily.subject');
    };
    const day1 = await sent(nineOn(2));
    const has = (mails: typeof day1, who: Person, title: string) =>
      mails.some(m => m.to === who.email && JSON.stringify(m.body).includes(title));
    expect(has(day1, w.contributor, first)).toBe(true);
    expect(has(day1, w.observer, first)).toBe(false);

    const second = await draftWithEntry();
    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/members/${w.contributor.username}`, { role: 'observer' });
    try {
      const day2 = await sent(nineOn(1));
      expect(has(day2, w.contributor, second)).toBe(false);
      expect(has(day2, w.contributor, first)).toBe(false);
      expect(has(day2, w.observer, second)).toBe(false);
    } finally {
      await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/members/${w.contributor.username}`, {
        role: 'contributor',
      });
      for (const who of [w.contributor, w.observer]) {
        await w.call(who, 'PATCH', '/v1/notifications/preferences', {
          email: { mentioned: 'off', article_published: 'off' },
        });
      }
    }
  });
});
