import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { issueWorld, type IssueWorld } from './issue-world.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'DUP';
const OTHER = 'DUO';

const newIssue = async (project = KEY, extra: object = {}) => {
  const res = await w.call(w.admin, 'POST', '/v1/issues', { project, title: 'An issue', ...extra });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().data as { key: string; status: { name: string } };
};
const statusOf = async (key: string) => (await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data.status.name;
const link = (key: string, name: string, issues: string[], who = w.contributor) =>
  w.call(who, 'POST', `/v1/issues/${key}/links`, { link: name, issues });

beforeAll(async () => {
  w = await issueWorld(KEY);
  await w.call(w.admin, 'POST', '/v1/projects', { name: 'Other', key: OTHER });
});

afterAll(async () => {
  await w.close();
});

describe('Close duplicates', () => {
  test('a new project starts with the rule switched on, pointing at its Duplicate status', async () => {
    const rules = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/automations`)).json().data;
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      name: 'Close duplicates',
      trigger: 'issue.marked_duplicate',
      action_params: { status: 'Duplicate' },
      is_enabled: true,
    });
  });

  test('the issue that duplicates closes; the one it duplicates stays open, from either end', async () => {
    const [original, copy, another] = [await newIssue(), await newIssue(), await newIssue()];
    expect((await link(copy.key, 'duplicates', [original.key])).statusCode).toBe(201);
    expect(await statusOf(copy.key)).toBe('Duplicate');
    expect(await statusOf(original.key)).toBe('Open');

    expect((await link(original.key, 'is duplicated by', [another.key])).statusCode).toBe(201);
    expect(await statusOf(another.key)).toBe('Duplicate');
    expect(await statusOf(original.key)).toBe('Open');

    const history = (await w.call(w.admin, 'GET', `/v1/issues/${copy.key}/activity?limit=50`)).json().data as {
      field: string | null;
      actor: { system?: boolean };
      automation: { name: string; cause: string } | null;
    }[];
    const change = history.find(r => r.field === 'status')!;
    expect(change.actor.system).toBe(true);
    expect(change.automation).toEqual({
      name: 'Close duplicates',
      cause: `it was marked as a duplicate of ${original.key}`,
    });
  });

  test('an issue already resolved keeps its resolution', async () => {
    const [original, copy] = [await newIssue(), await newIssue()];
    await w.call(w.admin, 'PATCH', `/v1/issues/${copy.key}`, { status: 'Fixed' });
    await link(copy.key, 'duplicates', [original.key]);
    expect(await statusOf(copy.key)).toBe('Fixed');
  });

  test('a duplicate in another project runs that project’s rule', async () => {
    const original = await newIssue();
    const copy = await newIssue(OTHER);
    expect((await link(original.key, 'is duplicated by', [copy.key], w.admin)).statusCode).toBe(201);
    expect(await statusOf(copy.key)).toBe('Duplicate');
    expect(await statusOf(original.key)).toBe('Open');
  });

  test('an issue created as a duplicate is answered already closed', async () => {
    const original = await newIssue();
    const copy = await newIssue(KEY, { links: [{ link: 'duplicates', issues: [original.key] }] });
    expect(copy.status.name).toBe('Duplicate');
    expect(await statusOf(original.key)).toBe('Open');
  });

  test('switched off, marking a duplicate only links', async () => {
    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/automations/Close%20duplicates`, { is_enabled: false });
    const [original, copy] = [await newIssue(), await newIssue()];
    await link(copy.key, 'duplicates', [original.key]);
    expect(await statusOf(copy.key)).toBe('Open');
    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/automations/Close%20duplicates`, { is_enabled: true });
  });

  test('relates and depends links fire nothing', async () => {
    const [a, b] = [await newIssue(), await newIssue()];
    await link(a.key, 'relates to', [b.key]);
    await link(a.key, 'depends on', [b.key]);
    expect([await statusOf(a.key), await statusOf(b.key)]).toEqual(['Open', 'Open']);
  });

  test('the template is offered too', async () => {
    const templates = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/automations/templates`)).json().data;
    expect(templates.find((t: { key: string }) => t.key === 'close_duplicates')).toMatchObject({
      needs_status: false,
      automation: { trigger: 'issue.marked_duplicate', action_params: { status: 'Duplicate' } },
    });
  });
});
