import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import type { Person } from './people.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'LNK';
const OTHER = 'LNO';

interface Group {
  link: string;
  type: string;
  direction: string;
  count: number;
  issues: { key: string; title: string; resolved: boolean; starred: boolean }[];
}

const newIssue = async (title = 'An issue', project = KEY, extra: object = {}) => {
  const res = await w.call(w.admin, 'POST', '/v1/issues', { project, title, ...extra });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().data.key as string;
};
const link = (key: string, name: string, issues: string[], who = w.contributor) =>
  w.call(who, 'POST', `/v1/issues/${key}/links`, { link: name, issues });
const groupsOf = async (key: string, who = w.admin) =>
  (await w.call(who, 'GET', `/v1/issues/${key}/links`)).json().data as Group[];
const summary = (groups: Group[]) => Object.fromEntries(groups.map(g => [g.link, g.issues.map(i => i.key)]));
const activityOf = async (key: string) =>
  (await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?limit=200`)).json().data as {
    kind: string;
    old_value: unknown;
    new_value: unknown;
  }[];

beforeAll(async () => {
  w = await issueWorld(KEY);
  await w.call(w.admin, 'POST', '/v1/projects', { name: 'Other', key: OTHER });
});

afterAll(async () => {
  await w.close();
});

describe('links', () => {
  test('every type reads correctly from both ends, grouped with counts', async () => {
    const [a, b, c, d] = [await newIssue('A'), await newIssue('B'), await newIssue('C'), await newIssue('D')];
    expect((await link(a, 'depends on', [b])).statusCode).toBe(201);
    await link(a, 'Duplicates', [c]);
    await link(a, 'relates to', [d]);

    expect(summary(await groupsOf(a))).toEqual({ 'depends on': [b], duplicates: [c], 'relates to': [d] });
    expect(summary(await groupsOf(b))).toEqual({ 'is required for': [a] });
    expect(summary(await groupsOf(c))).toEqual({ 'is duplicated by': [a] });
    expect(summary(await groupsOf(d))).toEqual({ 'relates to': [a] });
    expect((await groupsOf(a)).find(g => g.link === 'depends on')).toMatchObject({
      type: 'depends',
      direction: 'inward',
      count: 1,
    });

    expect((await activityOf(a)).filter(x => x.kind === 'linked').map(x => x.new_value)).toEqual([
      { link: 'depends on', issue: b },
      { link: 'duplicates', issue: c },
      { link: 'relates to', issue: d },
    ]);
    expect((await activityOf(b)).find(x => x.kind === 'linked')?.new_value).toEqual({
      link: 'is required for',
      issue: a,
    });
  });

  test('a relates link is stored once, whichever end adds it', async () => {
    const [a, b] = [await newIssue(), await newIssue()];
    expect((await link(a, 'relates to', [b])).statusCode).toBe(201);
    const again = await link(b, 'relates to', [a]);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('link.exists');
  });

  test('a depends cycle is refused, directly or through other issues; a self-link too', async () => {
    const [a, b, c] = [await newIssue(), await newIssue(), await newIssue()];
    await link(a, 'depends on', [b]);
    await link(b, 'depends on', [c]);
    const direct = await link(b, 'depends on', [a]);
    expect(direct.json().error.code).toBe('link.cycle');
    expect((await link(c, 'depends on', [a])).json().error.code).toBe('link.cycle');
    expect((await link(c, 'is required for', [a])).statusCode).toBe(201);
    expect((await link(a, 'relates to', [a])).json().error.code).toBe('link.self');
  });

  test('one refusal links none of the targets', async () => {
    const [a, b, c] = [await newIssue(), await newIssue(), await newIssue()];
    await link(a, 'depends on', [c]);
    expect((await link(a, 'depends on', [b, c])).statusCode).toBe(409);
    expect(summary(await groupsOf(a))).toEqual({ 'depends on': [c] });
  });

  test('an unknown link name answers valid_values', async () => {
    const a = await newIssue();
    const res = await link(a, 'blocks', [a]);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'link.unknown', field: 'link' });
    expect(res.json().error.valid_values).toContain('depends on');
  });

  test('unlinking removes the row and records unlinked on both ends', async () => {
    const [a, b] = [await newIssue(), await newIssue()];
    await link(a, 'depends on', [b]);
    const res = await w.call(w.contributor, 'DELETE', `/v1/issues/${b}/links/${a}?link=is%20required%20for`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(await groupsOf(a)).toEqual([]);
    expect((await activityOf(a)).find(x => x.kind === 'unlinked')?.old_value).toEqual({ link: 'depends on', issue: b });
    const gone = await w.call(w.contributor, 'DELETE', `/v1/issues/${b}/links/${a}?link=is%20required%20for`);
    expect(gone.json().error.code).toBe('link.not_found');
  });

  test('resolved issues are marked so their keys render struck through', async () => {
    const [a, b] = [await newIssue(), await newIssue()];
    await link(a, 'relates to', [b]);
    await w.call(w.admin, 'PATCH', `/v1/issues/${b}`, { status: 'Fixed' });
    await w.call(w.admin, 'PUT', `/v1/issues/${b}/star`);
    const [group] = await groupsOf(a);
    expect(group!.issues[0]).toMatchObject({ key: b, resolved: true, starred: true, status: { name: 'Fixed' } });
  });

  test('cross-project links work; a target the caller cannot read is neither linkable nor listed', async () => {
    const a = await newIssue();
    const elsewhere = await newIssue('Elsewhere', OTHER);
    expect((await link(a, 'relates to', [elsewhere], w.admin)).statusCode).toBe(201);
    expect(summary(await groupsOf(a))).toEqual({ 'relates to': [elsewhere] });
    expect(await groupsOf(a, w.contributor)).toEqual([]);
    expect((await link(a, 'relates to', [elsewhere])).json().error.code).toBe('link.target_not_found');
  });

  test('history keeps a link into an unreadable project, but not the key', async () => {
    const a = await newIssue('Readable');
    const hidden = await newIssue('Restricted', OTHER);
    expect((await link(a, 'depends on', [hidden], w.admin)).statusCode).toBe(201);
    const unlinked = await w.call(w.admin, 'DELETE', `/v1/issues/${a}/links/${hidden}?link=depends%20on`);
    expect(unlinked.statusCode).toBe(200);

    const history = async (who: Person) => {
      const body = (await w.call(who, 'GET', `/v1/issues/${a}/activity?limit=200`)).json();
      const rows = body.data as { kind: string; old_value: unknown; new_value: unknown }[];
      return {
        total: body.meta.pagination.total as number,
        links: rows
          .filter(x => x.kind === 'linked' || x.kind === 'unlinked')
          .map(x => ({ kind: x.kind, value: x.kind === 'linked' ? x.new_value : x.old_value })),
      };
    };
    const full = await history(w.admin);
    expect(full.links).toEqual([
      { kind: 'linked', value: { link: 'depends on', issue: hidden } },
      { kind: 'unlinked', value: { link: 'depends on', issue: hidden } },
    ]);
    const redacted = await history(w.contributor);
    expect(redacted.links).toEqual([
      { kind: 'linked', value: { link: 'depends on', issue: null } },
      { kind: 'unlinked', value: { link: 'depends on', issue: null } },
    ]);
    expect(redacted.total).toBe(full.total);

    const minted = await w.call(w.admin, 'POST', '/v1/me/tokens', {
      name: 'only-lnk',
      scopes: ['issues:read'],
      project_keys: [KEY],
    });
    const narrow: Person = {
      email: w.admin.email,
      sid: '',
      headers: { authorization: `Bearer ${minted.json().data.token}` },
    };
    expect((await history(narrow)).links.map(l => l.value)).toEqual([
      { link: 'depends on', issue: null },
      { link: 'depends on', issue: null },
    ]);
  });

  test('observers cannot link; strangers see nothing', async () => {
    const [a, b] = [await newIssue(), await newIssue()];
    expect((await link(a, 'relates to', [b], w.observer)).statusCode).toBe(403);
    expect((await w.call(w.observer, 'GET', `/v1/issues/${a}/links`)).statusCode).toBe(200);
    expect((await w.call(w.outsider, 'GET', `/v1/issues/${a}/links`)).statusCode).toBe(404);
  });
});

describe('hierarchy', () => {
  test('PATCH parent sets and clears it, with parent_changed on the child and a link row on each parent', async () => {
    const [epic, other, task] = [await newIssue('Epic'), await newIssue('Other epic'), await newIssue('Task')];
    const set = await w.call(w.contributor, 'PATCH', `/v1/issues/${task}`, { parent: epic });
    expect(set.statusCode).toBe(200);
    expect(set.json().data.parent).toBe(epic);
    expect(summary(await groupsOf(epic))).toEqual({ 'parent for': [task] });
    expect(summary(await groupsOf(task))).toEqual({ 'subtask of': [epic] });

    await w.call(w.contributor, 'PATCH', `/v1/issues/${task}`, { parent: other });
    await w.call(w.contributor, 'PATCH', `/v1/issues/${task}`, { parent: null });
    expect((await w.call(w.admin, 'GET', `/v1/issues/${task}`)).json().data.parent).toBeNull();

    const changes = (await activityOf(task)).filter(x => x.kind === 'parent_changed');
    expect(changes.map(c => [c.old_value, c.new_value])).toEqual([
      [null, { key: epic }],
      [{ key: epic }, { key: other }],
      [{ key: other }, null],
    ]);
    expect((await activityOf(epic)).filter(x => x.kind !== 'created').map(x => x.kind)).toEqual(['linked', 'unlinked']);
  });

  test('a subtask link writes parent_id and never an issue_links row', async () => {
    const [epic, a, b] = [await newIssue(), await newIssue(), await newIssue()];
    expect((await link(epic, 'parent for', [a, b])).statusCode).toBe(201);
    expect((await w.call(w.admin, 'GET', `/v1/issues/${a}`)).json().data.parent).toBe(epic);
    expect((await groupsOf(epic))[0]).toMatchObject({ link: 'parent for', count: 2 });
    expect((await link(a, 'subtask of', [epic])).json().error.code).toBe('link.exists');
    expect((await link(a, 'subtask of', [b, epic])).json().error.code).toBe('link.one_parent');

    const removed = await w.call(w.contributor, 'DELETE', `/v1/issues/${a}/links/${epic}?link=subtask%20of`);
    expect(removed.statusCode).toBe(200);
    expect((await w.call(w.admin, 'GET', `/v1/issues/${a}`)).json().data.parent).toBeNull();
  });

  test('create takes a parent', async () => {
    const epic = await newIssue('Epic');
    const child = await newIssue('Child', KEY, { parent: epic });
    expect((await w.call(w.admin, 'GET', `/v1/issues/${child}`)).json().data.parent).toBe(epic);
    expect((await activityOf(epic)).find(x => x.kind === 'linked')?.new_value).toEqual({
      link: 'parent for',
      issue: child,
    });
  });

  test('depth is at most 3, counting the subtree that moves with the child', async () => {
    const [l1, l2, l3, l4] = [await newIssue(), await newIssue(), await newIssue(), await newIssue()];
    await w.call(w.admin, 'PATCH', `/v1/issues/${l2}`, { parent: l1 });
    await w.call(w.admin, 'PATCH', `/v1/issues/${l3}`, { parent: l2 });
    const deep = await w.call(w.admin, 'PATCH', `/v1/issues/${l4}`, { parent: l3 });
    expect(deep.statusCode).toBe(400);
    expect(deep.json().error).toMatchObject({ code: 'issue.hierarchy_too_deep', field: 'parent' });

    const [top, mid] = [await newIssue(), await newIssue()];
    await w.call(w.admin, 'PATCH', `/v1/issues/${mid}`, { parent: top });
    expect((await w.call(w.admin, 'PATCH', `/v1/issues/${top}`, { parent: l2 })).json().error.code).toBe(
      'issue.hierarchy_too_deep',
    );
    expect((await w.call(w.admin, 'PATCH', `/v1/issues/${top}`, { parent: l1 })).statusCode).toBe(200);
  });

  test('cycles, self-parenting, other projects and unknown parents are refused', async () => {
    const [a, b] = [await newIssue(), await newIssue()];
    await w.call(w.admin, 'PATCH', `/v1/issues/${b}`, { parent: a });
    const code = async (key: string, parent: string) =>
      (await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { parent })).json().error?.code;
    expect(await code(a, b)).toBe('issue.hierarchy_cycle');
    expect(await code(a, a)).toBe('issue.parent_self');
    expect(await code(a, await newIssue('x', OTHER))).toBe('issue.parent_other_project');
    expect(await code(a, `${KEY}-9999`)).toBe('issue.parent_not_found');
    const otherChild = await newIssue('y', OTHER);
    expect((await link(a, 'parent for', [otherChild], w.admin)).json().error.code).toBe('issue.parent_other_project');
  });

  test('observers cannot set a parent', async () => {
    const [a, b] = [await newIssue(), await newIssue()];
    expect((await w.call(w.observer, 'PATCH', `/v1/issues/${b}`, { parent: a })).statusCode).toBe(403);
    expect((await link(a, 'parent for', [b], w.observer)).statusCode).toBe(403);
  });
});

describe('links at creation', () => {
  const createWith = (body: object, who = w.contributor) =>
    w.call(who, 'POST', '/v1/issues', { project: KEY, title: 'Born linked', ...body });

  test('links are written with the issue, every type, parent included', async () => {
    const [epic, required, dupe] = [await newIssue('Epic'), await newIssue('Required'), await newIssue('Dupe')];
    const res = await createWith({
      links: [
        { link: 'subtask of', issues: [epic] },
        { link: 'depends on', issues: [required] },
        { link: 'duplicates', issues: [dupe] },
      ],
    });
    expect(res.statusCode).toBe(201);
    const key = res.json().data.key;
    expect(res.json().data.parent).toBe(epic);
    expect(summary(await groupsOf(key))).toEqual({
      'subtask of': [epic],
      'depends on': [required],
      duplicates: [dupe],
    });
    expect(summary(await groupsOf(required))).toEqual({ 'is required for': [key] });
  });

  test('any refusal creates nothing and names the links field', async () => {
    const before = (await w.call(w.admin, 'GET', `/v1/issues?project=${KEY}&limit=1`)).json().meta.pagination.total;
    const missing = await createWith({ links: [{ link: 'relates to', issues: [`${KEY}-99999`] }] });
    expect(missing.json().error).toMatchObject({ code: 'link.target_not_found', field: 'links' });
    const unknown = await createWith({ links: [{ link: 'blocks', issues: [await newIssue()] }] });
    expect(unknown.json().error).toMatchObject({ code: 'link.unknown', field: 'links' });
    const epic = await newIssue();
    const conflict = await createWith({ parent: epic, links: [{ link: 'subtask of', issues: [epic] }] });
    expect(conflict.json().error).toMatchObject({ code: 'link.parent_conflict', field: 'links' });
    const [l1, l2, l3] = [await newIssue(), await newIssue(), await newIssue()];
    await w.call(w.admin, 'PATCH', `/v1/issues/${l2}`, { parent: l1 });
    await w.call(w.admin, 'PATCH', `/v1/issues/${l3}`, { parent: l2 });
    const deep = await createWith({ links: [{ link: 'subtask of', issues: [l3] }] });
    expect(deep.json().error.code).toBe('issue.hierarchy_too_deep');
    const after = (await w.call(w.admin, 'GET', `/v1/issues?project=${KEY}&limit=1`)).json().meta.pagination.total;
    expect(after).toBe(before + 5);
    expect((await createWith({ links: [{ link: 'relates to', issues: [l1] }] }, w.observer)).statusCode).toBe(403);
  });
});

describe('GET /v1/issues/refs', () => {
  test('keys resolve to chips in the order asked, dropping what is missing or unreadable', async () => {
    const [a, b] = [await newIssue('Alpha'), await newIssue('Beta')];
    const hidden = await newIssue('Hidden', OTHER);
    const res = await w.call(w.contributor, 'GET', `/v1/issues/refs?keys=${b},${hidden},${KEY}-9999,${a}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((r: { key: string }) => r.key)).toEqual([b, a]);
    expect(res.json().data[0]).toMatchObject({ title: 'Beta', resolved: false, type: { name: 'Bug' } });
  });

  test('the # picker matches a key prefix or a title substring', async () => {
    const needle = await newIssue('Unique needle title');
    const byTitle = await w.call(w.contributor, 'GET', '/v1/issues/refs?q=needle');
    expect(byTitle.json().data.map((r: { key: string }) => r.key)).toContain(needle);
    const byKey = await w.call(w.contributor, 'GET', `/v1/issues/refs?q=${needle}&project=${KEY}`);
    expect(byKey.json().data[0].key).toBe(needle);
    const recent = await w.call(w.contributor, 'GET', '/v1/issues/refs?limit=3');
    expect(recent.json().data).toHaveLength(3);
    expect((await w.call(w.outsider, 'GET', '/v1/issues/refs?q=needle')).json().data ?? []).toEqual([]);
  });
});
