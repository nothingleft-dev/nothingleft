import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { gitIdentitiesRepository, systemContext, usersRepository } from '@nothingleft/db';
import { runQueued, type RecordingQueue } from '@lib/jobs';
import { matchesGlob } from '@services/automations.service';
import { gitFixture } from './git-fixtures.ts';
import { gitWorld, type GitWorld } from './git-world.ts';
import type { Person } from './people.ts';

const KEY = 'API';
const MINUTE = 60_000;
let w: GitWorld;
// Unique per run: provider identities are global, and the test database outlives a run.
const caseyId = 900_000_000 + Math.floor(Math.random() * 99_999_999);

type Loose = Record<string, unknown>;
type PullRequestBody = Loose & { pull_request: Loose & { merged_by: Loose | null; head: Loose; title: string } };
const fixtureBody = (name: string) => structuredClone(gitFixture('github', name).body) as PullRequestBody;

async function deliver(name: string, delivery: string, body?: Loose) {
  const res = await w.deliver('github', name, { delivery, ...(body ? { body } : {}) });
  expect(res.statusCode).toBe(202);
  await w.drain();
}

/** The merge, by Casey: a member through a claimed identity. */
const mergedByCasey = () => {
  const body = fixtureBody('pull_request.closed.merged');
  body.pull_request.merged_by = { ...body.pull_request.merged_by, id: caseyId };
  body['sender'] = { ...(body['sender'] as Loose), id: caseyId };
  return body;
};

const create = (who: Person, body: Loose) => w.call(who, 'POST', `/v1/projects/${KEY}/automations`, body);
const status = async (key: string) => (await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data.status.name;
const setStatus = (key: string, name: string, who: Person = w.admin) =>
  w.call(who, 'PATCH', `/v1/issues/${key}`, { status: name });

async function settle(): Promise<void> {
  const queue = w.app.jobQueue as RecordingQueue;
  const at = new Date(Date.now() + 11 * MINUTE);
  for (const job of queue.pending.splice(0).filter(j => j.name === 'notify.fanout')) {
    await runQueued(w.app.queuedHandlers, job, at);
  }
}

const kindsFor = async (who: Person, key: string) =>
  (
    (await w.call(who, 'GET', '/v1/notifications')).json().data as {
      subject: { key?: string };
      notifications: { kind: string; summary: string }[];
    }[]
  )
    .filter(g => g.subject.key === key)
    .flatMap(g => g.notifications.map(n => n.kind));

beforeAll(async () => {
  w = await gitWorld(KEY);
  for (let i = 1; i <= 8; i++) await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: `Issue ${i}` });
  expect((await w.connectGitHub(w.admin, w.slug, w.inst('5001'))).statusCode).toBe(200);
  expect(
    (await w.call(w.admin, 'PUT', `/v1/projects/${KEY}/repositories/acme-inc%2Fweb`, { backfill: false })).statusCode,
  ).toBe(201);
  w.provider.routes['GET https://api.github.com/repositories/101/pulls/42/commits'] = [];
  const sys = systemContext('test setup');
  const casey = await usersRepository(w.db).findByEmail(sys, w.contributor.email);
  await gitIdentitiesRepository(w.db).insert(sys, {
    user_id: casey!.id,
    provider: 'github',
    base_url: 'https://github.com',
    provider_user_id: String(caseyId),
    login: `casey-${caseyId}`,
    email: null,
    verified_by: 'provider',
    verified_at: new Date(),
  });
});

afterAll(async () => {
  await w.close();
});

describe('branch patterns', () => {
  test('`*` matches any run of characters, and a hostile pattern stays fast', () => {
    expect(matchesGlob('release/*', 'release/2026.10')).toBe(true);
    expect(matchesGlob('release/*', 'main')).toBe(false);
    expect(matchesGlob('main', 'main')).toBe(true);
    expect(matchesGlob('*-hotfix', 'api-7-hotfix')).toBe(true);
    const started = performance.now();
    expect(matchesGlob(`${'*a'.repeat(100)}*c`, 'a'.repeat(255))).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('the catalogue and templates', () => {
  test('every trigger and action is listed with its conditions', async () => {
    const res = await w.call(w.observer, 'GET', '/v1/automations/catalogue');
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.triggers.map((t: { key: string }) => t.key)).toContain('git.pull_request_merged');
    expect(data.actions).toHaveLength(1);
    const merged = data.triggers.find((t: { key: string }) => t.key === 'git.pull_request_merged');
    expect(merged.defaults).toEqual({ intent: ['closes'], all_linked_merged: true });
  });

  test("templates fill in the project's statuses and say when one is missing", async () => {
    const data = (await w.call(w.observer, 'GET', `/v1/projects/${KEY}/automations/templates`)).json().data;
    const byKey = Object.fromEntries(data.map((t: { key: string }) => [t.key, t]));
    expect(byKey.close_on_merge.automation.action_params.status).toBe('Fixed');
    expect(byKey.start_work.automation.action_params.status).toBe('In Progress');
    expect(byKey.reopen_on_revert.automation.action_params.status).toBe('Reopened');
    expect(byKey.review).toMatchObject({ needs_status: true, automation: { action_params: { status: null } } });
  });
});

describe('managing rules', () => {
  test('a project admin creates, renames, disables and deletes; contributors and observers only read', async () => {
    const body = {
      name: 'Start on branch',
      trigger: 'git.branch_created',
      action: 'issue.set_status',
      action_params: { status: 'in progress' },
    };
    expect((await create(w.contributor, body)).statusCode).toBe(403);
    expect((await w.call(w.outsider, 'GET', `/v1/projects/${KEY}/automations`)).statusCode).toBe(404);

    const created = await create(w.projectAdmin, body);
    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({
      name: 'Start on branch',
      action_params: { status: 'In Progress' },
      is_enabled: true,
      status_missing: false,
      runs: 0,
    });
    expect(created.json().data.sentence).toContain('In Progress');
    expect((await create(w.projectAdmin, body)).json().error.code).toBe('automation.name_taken');

    const list = (await w.call(w.observer, 'GET', `/v1/projects/${KEY}/automations`)).json().data;
    expect(list.map((a: { name: string }) => a.name)).toEqual(['Start on branch']);

    const patched = await w.call(w.projectAdmin, 'PATCH', `/v1/projects/${KEY}/automations/start%20on%20branch`, {
      name: 'Start work',
      is_enabled: false,
    });
    expect(patched.json().data).toMatchObject({ name: 'Start work', is_enabled: false });
    expect((await w.call(w.contributor, 'DELETE', `/v1/projects/${KEY}/automations/Start%20work`)).statusCode).toBe(
      403,
    );
    const removed = await w.call(w.projectAdmin, 'DELETE', `/v1/projects/${KEY}/automations/Start%20work`);
    expect(removed.json().data).toEqual([]);
    expect((await w.call(w.admin, 'GET', `/v1/projects/${KEY}/automations/Start%20work`)).statusCode).toBe(404);
  });

  test('"templates" is not a name a rule can take', async () => {
    const res = await create(w.admin, {
      name: 'Templates',
      trigger: 'git.branch_created',
      action: 'issue.set_status',
      action_params: { status: 'In Progress' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('automation.name_reserved');
  });

  test('a status that does not exist and a condition the trigger has not are refused', async () => {
    const missing = await create(w.admin, {
      trigger: 'git.branch_created',
      action: 'issue.set_status',
      action_params: { status: 'Shipped' },
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.code).toBe('automation.status_missing');
    const wrong = await create(w.admin, {
      trigger: 'git.branch_created',
      conditions: { all_linked_merged: true },
      action: 'issue.set_status',
      action_params: { status: 'Fixed' },
    });
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().error.code).toBe('automation.condition_invalid');
  });

  test('a renamed status is followed by every rule that sets it', async () => {
    await create(w.admin, {
      name: 'Reopen',
      trigger: 'git.revert_merged',
      action: 'issue.set_status',
      action_params: { status: 'Reopened' },
    });
    expect(
      (await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/statuses/Reopened`, { name: 'Back again' })).statusCode,
    ).toBe(200);
    const rule = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/automations/Reopen`)).json().data;
    expect(rule.action_params.status).toBe('Back again');
    expect(rule.status_missing).toBe(false);
    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/statuses/Back%20again`, { name: 'Reopened' });
    await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/automations/Reopen`);
  });

  test('the free plan allows ten rules per project', async () => {
    await w.call(w.admin, 'POST', '/v1/projects', { name: 'Limits', key: 'LIM' });
    for (let i = 0; i < 10; i++) {
      const res = await w.call(w.admin, 'POST', '/v1/projects/LIM/automations', {
        name: `Rule ${i}`,
        trigger: 'git.branch_created',
        action: 'issue.set_status',
        action_params: { status: 'In Progress' },
      });
      expect(res.statusCode).toBe(201);
    }
    const over = await w.call(w.admin, 'POST', '/v1/projects/LIM/automations', {
      name: 'Rule 10',
      trigger: 'git.branch_created',
      action: 'issue.set_status',
      action_params: { status: 'In Progress' },
    });
    expect(over.statusCode).toBe(409);
    expect(over.json().error.code).toBe('automation.limit_reached');
  });

  test('a dry run says what would happen and writes nothing', async () => {
    await create(w.admin, {
      name: 'Start',
      trigger: 'git.branch_created',
      conditions: { issue_status_category: ['backlog', 'unstarted'] },
      action: 'issue.set_status',
      action_params: { status: 'In Progress' },
    });
    const apply = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/automations/Start/test`, { issue: `${KEY}-3` });
    expect(apply.json().data).toMatchObject({
      result: 'would_apply',
      changes: { status: { from: 'Open', to: 'In Progress' } },
    });
    expect(await status(`${KEY}-3`)).toBe('Open');
    await setStatus(`${KEY}-3`, 'In Progress');
    const skip = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/automations/Start/test`, { issue: `${KEY}-3` });
    expect(skip.json().data).toMatchObject({ result: 'would_skip', reason: 'condition_not_met' });
    expect(
      (await w.call(w.contributor, 'POST', `/v1/projects/${KEY}/automations/Start/test`, { issue: `${KEY}-3` }))
        .statusCode,
    ).toBe(403);
    await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/automations/Start`);
  });
});

describe('running rules', () => {
  test('a branch named for the issue starts work, as the system, naming the rule and its cause', async () => {
    await create(w.admin, {
      name: 'Start work',
      trigger: 'git.branch_created',
      conditions: { issue_status_category: ['backlog', 'unstarted'] },
      action: 'issue.set_status',
      action_params: { status: 'In Progress' },
    });
    await deliver('create.branch', 'branch-1');
    expect(await status(`${KEY}-7`)).toBe('In Progress');
    const activity = (await w.call(w.admin, 'GET', `/v1/issues/${KEY}-7/activity?kind=field_changed&limit=20`)).json()
      .data as {
      field: string;
      actor: { name: string; system?: boolean };
      automation: { name: string; cause: string } | null;
    }[];
    const change = activity.find(a => a.field === 'status')!;
    expect(change.actor.system).toBe(true);
    expect(change.automation).toEqual({
      name: 'Start work',
      cause: 'branch feat/api-7-login was created in acme-inc/web',
    });
    const issue = (await w.call(w.admin, 'GET', `/v1/issues/${KEY}-7`)).json().data;
    expect(issue.last_automation_at).not.toBeNull();
  });

  test('a pull request linked by hand while open fires the opened rules, caused by the person', async () => {
    await create(w.admin, {
      name: 'Start on PR',
      trigger: 'git.pull_request_opened',
      conditions: { issue_status_category: ['backlog', 'unstarted'] },
      action: 'issue.set_status',
      action_params: { status: 'In Progress' },
    });
    await deliver('pull_request.opened', 'pr-open');
    const linked = await w.call(w.contributor, 'POST', `/v1/issues/${KEY}-6/development/links`, {
      url: 'https://github.com/acme-inc/web/pull/42',
    });
    expect(linked.statusCode).toBe(200);
    expect(await status(`${KEY}-6`)).toBe('In Progress');
    const runs = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/automation-runs?issue=${KEY}-6`)).json().data;
    expect(runs[0]).toMatchObject({
      automation: 'Start on PR',
      result: 'applied',
      cause: `acme-inc/web#42 was linked by hand by @${w.contributor.username}`,
    });
    await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/automations/Start%20on%20PR`);
  });

  test('close on merge: the merger is not told, everyone else is; failing checks reach assignees; the run is logged', async () => {
    await create(w.admin, {
      name: 'Close on merge',
      trigger: 'git.pull_request_merged',
      action: 'issue.set_status',
      action_params: { status: 'Fixed' },
    });
    await w.call(w.admin, 'POST', `/v1/issues/${KEY}-7/watchers`, { username: w.contributor.username });
    await w.call(w.admin, 'PATCH', `/v1/issues/${KEY}-7`, { assignees: [w.projectAdmin.username] });
    await settle();

    await deliver('pull_request.opened', 'pr-open');
    expect(await status(`${KEY}-7`)).toBe('In Progress');
    // The dry run takes the issue's own open pull request as the one merging.
    const dry = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/automations/Close%20on%20merge/test`, {
      issue: `${KEY}-7`,
    });
    expect(dry.json().data).toMatchObject({ result: 'would_apply', changes: { status: { to: 'Fixed' } } });
    const failing = fixtureBody('check_run.completed.failure') as unknown as { check_run: Loose };
    failing.check_run['head_sha'] = '0303030303030303030303030303030303030303';
    await deliver('check_run.completed.failure', 'check-failed', failing);
    await deliver('pull_request.closed.merged', 'pr-merged', mergedByCasey());
    expect(await status(`${KEY}-7`)).toBe('Fixed');

    const runs = (
      await w.call(w.observer, 'GET', `/v1/projects/${KEY}/automations/Close%20on%20merge/runs?issue=${KEY}-7`)
    ).json();
    expect(runs.data[0]).toMatchObject({
      automation: 'Close on merge',
      issue: `${KEY}-7`,
      result: 'applied',
      changes: { status: { from: 'In Progress', to: 'Fixed' } },
      cause: `acme-inc/web#42 was merged by @casey-kim`,
    });
    const byIssue = (await w.call(w.observer, 'GET', `/v1/projects/${KEY}/automation-runs?issue=${KEY}-7`)).json();
    expect(byIssue.meta.pagination.total).toBeGreaterThanOrEqual(2);

    await settle();
    // The admin created and watches the issue; the project admin is assigned; Casey merged it.
    expect(await kindsFor(w.admin, `${KEY}-7`)).toEqual(expect.arrayContaining(['resolved', 'pull_request_merged']));
    expect(await kindsFor(w.projectAdmin, `${KEY}-7`)).toEqual(
      expect.arrayContaining(['pull_request_merged', 'ci_failed']),
    );
    const casey = await kindsFor(w.contributor, `${KEY}-7`);
    expect(casey).not.toContain('resolved');
    expect(casey).not.toContain('pull_request_merged');
    // Watching is not enough for a failing check: only assignees hear of it.
    expect(casey).not.toContain('ci_failed');
  });

  test('a live delivery runs rules; a replay without them changes nothing a rule would', async () => {
    await setStatus(`${KEY}-7`, 'In Progress');
    const events = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/git/events?limit=50`)).json().data as {
      id: number;
      delivery_id: string;
      run_automations: boolean;
    }[];
    const merged = events.find(e => e.delivery_id === 'pr-merged')!;
    expect(merged.run_automations).toBe(true);
    // Stored state already says merged, so the replayed event is no transition and fires nothing.
    await w.call(w.admin, 'POST', `/v1/organizations/${w.slug}/git/events/${merged.id}/replay`, {
      run_automations: false,
    });
    await w.drain();
    expect(await status(`${KEY}-7`)).toBe('In Progress');
  });

  test('depth one: a parent resolved by a person resolving the last subtask; never by an automation', async () => {
    await create(w.admin, {
      name: 'Resolve parent',
      trigger: 'issue.children_resolved',
      action: 'issue.set_status',
      action_params: { status: 'Closed' },
    });
    await w.call(w.admin, 'PATCH', `/v1/issues/${KEY}-2`, { parent: `${KEY}-1` });
    await w.call(w.admin, 'PATCH', `/v1/issues/${KEY}-4`, { parent: `${KEY}-1` });
    await setStatus(`${KEY}-2`, 'Fixed');
    expect(await status(`${KEY}-1`)).toBe('Open');
    await setStatus(`${KEY}-4`, 'Fixed', w.contributor);
    expect(await status(`${KEY}-1`)).toBe('Closed');

    // The last subtask resolved by an automation leaves the parent alone.
    await create(w.admin, {
      name: 'Fix on push',
      trigger: 'git.commit_pushed',
      action: 'issue.set_status',
      action_params: { status: 'Fixed' },
    });
    await w.call(w.admin, 'PATCH', `/v1/issues/${KEY}-7`, { parent: `${KEY}-5` });
    await setStatus(`${KEY}-7`, 'In Progress');
    await deliver('push.feature', 'push-depth');
    expect(await status(`${KEY}-7`)).toBe('Fixed');
    expect(await status(`${KEY}-5`)).toBe('Open');
    await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/automations/Fix%20on%20push`);
  });

  test('an archived project skips its rules and says so', async () => {
    expect((await w.call(w.admin, 'POST', `/v1/projects/${KEY}/archive`)).statusCode).toBe(200);
    const body = fixtureBody('create.branch') as Loose;
    body['ref'] = 'feat/api-8-archive';
    await deliver('create.branch', 'branch-archived', body);
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/unarchive`);
    const runs = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/automation-runs?issue=${KEY}-8`)).json().data;
    expect(runs[0]).toMatchObject({ automation: 'Start work', result: 'skipped', reason: 'archived_project' });
    expect(await status(`${KEY}-8`)).toBe('Open');
  });
});
